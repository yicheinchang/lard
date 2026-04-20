import asyncio
import json
import os
import html
import operator
from typing import TypedDict, Any, Annotated, Callable
from ai.llm_factory import get_llm
from ai.logger import agnt_log, log_llm_info
from config import load_app_settings, settings
from ai.chains import (
    get_job_post_check_prompt, 
    get_extraction_prompt, 
    _create_description_prompt, 
    get_json_ld_prompt
)

class AgentState(TypedDict):
    text: str
    url: str | None
    extracted_data: dict | None
    error: str | None
    request: Any | None # fastapi.Request
    progress_callback: Callable | None # Async callback for streaming
    structured_data: dict | None
    retries: Annotated[int, operator.add]
    validation_feedback: str | None
    llm_logged: bool
    use_text_fallback: bool
    previous_json_results: dict | None
    active_source: str | None # "JSON-LD" or "TEXT"
    description_verified: bool | None # True if validated by JSON fidelity check
    text_truncated: bool
    json_truncated: bool
    context_limit_reached: bool

def _is_valid_value(val: Any) -> bool:
    """
    Checks if an extracted value is a meaningful result.
    Filters out placeholders like 'N/A', 'Unknown', or empty strings.
    Used for heuristic validation and cross-pass merging.
    """
    if val is None:
        return False
    if not isinstance(val, str):
        return True # Non-string truthy values are considered valid
    
    placeholders = ["n/a", "unknown", "not provided", "[company name]", "null", "undefined", "tbd", "tbc", "none"]
    v_clean = val.lower().strip()
    
    if not v_clean or v_clean in placeholders or len(v_clean) < 2:
        return False
    return True

async def _run_field_extraction(field, schema, prompt, text, url, request, semaphore, progress_cb=None, state=None):
    """Async helper to execute a single agent task within a concurrency limit."""
    async with semaphore:
        # Check for disconnection before starting the call
        if request and await request.is_disconnected():
            print(f"Task Cancelled: Parallel agent aborted at field '{field}'.")
            return field, None
        
        if progress_cb:
            # Emit "Extracting..." status
            await progress_cb({"event": "extracting", "field": field, "msg": f"AI: Extracting {field.replace('_', ' ')}..."})

        settings = load_app_settings()
        num_ctx = settings["llm_config"].get("num_ctx")
        llm = get_llm(num_ctx=num_ctx)

        # Log calling
        agnt_log(f"Agent:{field}", task="Extracting Field", input_data=str(text)[:50])

        try:
            # SPECIAL CASE: Job Description (Raw Pass)
            # We skip structured output for the large description field to avoid JSON overhead and hangs.
            if field == "description":
                # Inject custom guidance into the prompt if provided
                custom_guidance = ""
                settings = load_app_settings()
                if settings.get("custom_prompts"):
                    mode = settings.get("extraction_mode", "single")
                    if mode == "multi":
                        cg = settings["custom_prompts"]["multi_agent"].get(field, "")
                        if cg: custom_guidance = f"ADDITIONAL USER INSTRUCTIONS:\n{cg}"
                    else:
                        cg = settings["custom_prompts"].get("single_agent", "")
                        if cg: custom_guidance = f"ADDITIONAL USER INSTRUCTIONS:\n{cg}"

                # Raw LLM call without structured output wrapping
                raw_chain = prompt | llm
                
                # Check for validation feedback on retry
                # Use prompt.input_variables for more reliable detection of placeholders
                prompt_vars = prompt.input_variables if hasattr(prompt, 'input_variables') else []
                inputs = {
                    "text": text,
                    "url": url or "Not provided",
                    "validation_feedback": "",
                    "custom_guidance": custom_guidance
                }
                
                # Check for validation feedback on retry
                vf = state.get("validation_feedback", "") if state else ""
                if vf:
                    label = "TRANSITION FEEDBACK (FALLBACK TO TEXT):" if state.get("use_text_fallback") else "PREVIOUS ATTEMPT FAILED QA VALIDATION:"
                    inputs["validation_feedback"] = f"{label}\n{vf}\n"
                    
                raw_res = await asyncio.wait_for(
                    raw_chain.ainvoke(inputs),
                    timeout=600
                )
                verbatim_text = raw_res.content
                
                if progress_cb:
                    snippet = str(verbatim_text)[:40] + ("..." if len(str(verbatim_text)) > 40 else "")
                    await progress_cb({"event": "field_done", "field": field, "msg": f"Captured Description: {snippet}"})
                
                # Log completion
                agnt_log(f"Agent:{field}", result=str(verbatim_text)[:50])
                
                return field, {"description": verbatim_text}

            # STANDARD CASE: Metadata (Structured JSON)
            # Multi-agent metadata fields are small and benefit from JSON schema enforcement.
            custom_guidance = ""
            settings = load_app_settings()
            if settings.get("custom_prompts"):
                mode = settings.get("extraction_mode", "single")
                if mode == "multi":
                    cg = settings["custom_prompts"]["multi_agent"].get(field, "")
                    if cg: custom_guidance = f"ADDITIONAL USER INSTRUCTIONS:\n{cg}"
                else:
                    cg = settings["custom_prompts"].get("single_agent", "")
                    if cg: custom_guidance = f"ADDITIONAL USER INSTRUCTIONS:\n{cg}"

            chain = prompt | llm.with_structured_output(schema)
            inputs = {
                "text": text,
                "url": url or "Not provided",
                "custom_guidance": custom_guidance,
                "validation_feedback": ""
            }
            
            # Also check for validation feedback in case user added it to base prompts
            vf = state.get("validation_feedback", "") if state else ""
            if vf:
                label = "TRANSITION FEEDBACK (FALLBACK TO TEXT):" if state.get("use_text_fallback") else "PREVIOUS ATTEMPT FAILED QA VALIDATION:"
                inputs["validation_feedback"] = f"{label}\n{vf}\n"

            res = await asyncio.wait_for(
                chain.ainvoke(inputs),
                timeout=300
            )
            val = res.model_dump()
            
            if progress_cb:
                raw_val = list(val.values())[0]
                snippet = str(raw_val)[:40] + ("..." if len(str(raw_val)) > 40 else "")
                await progress_cb({"event": "field_done", "field": field, "msg": f"Found {field.replace('_', ' ')}: {snippet}"})
            
            # Log completion
            agnt_log(f"Agent:{field}", result=str(val)[:50])
                
            return field, val

        except (asyncio.TimeoutError, Exception) as e:
            print(f"Error extracting {field}: {e}")
            return field, None

async def _run_multi_agent_extraction(text: str, url: str, request: Any = None, progress_cb: Callable = None, state: dict = None, fields_to_extract: list[str] = None):
    """Parallelized extraction for small models (Multi-Agent mode) with streaming support."""
    settings = load_app_settings()
    # Concurrency limit (Dynamic from settings)
    semaphore = asyncio.Semaphore(settings.get("max_concurrency", 1))
    
    from ai.chains import (
        JobCompany, JobRole, JobLocation, JobSalary, JobId, 
        PostedDate, DeadlineDate, JobDescription,
        get_field_prompt, _create_description_prompt
    )
    description_extraction_prompt = _create_description_prompt(settings)

    metadata_tasks = [
        ("company", JobCompany, get_field_prompt("company", settings)),
        ("role", JobRole, get_field_prompt("role", settings)),
        ("location", JobLocation, get_field_prompt("location", settings)),
        ("salary_range", JobSalary, get_field_prompt("salary_range", settings)),
        ("company_job_id", JobId, get_field_prompt("company_job_id", settings)),
        ("job_posted_date", PostedDate, get_field_prompt("job_posted_date", settings)),
        ("application_deadline", DeadlineDate, get_field_prompt("application_deadline", settings)),
        ("description", JobDescription, description_extraction_prompt),
    ]
    
    # Filter tasks if requested
    if fields_to_extract:
        metadata_tasks = [t for t in metadata_tasks if t[0] in fields_to_extract]

    # Launch concurrent tasks
    tasks = [
        _run_field_extraction(field, schema, prompt, text, url, request, semaphore, progress_cb, state=state)
        for field, schema, prompt in metadata_tasks
    ]
    
    results_list = await asyncio.gather(*tasks)
    
    # Merge results from all parallel tasks
    results = {}
    for field, res in results_list:
        if res:
            results.update(res)
        else:
            results[field] = None
            
    return results

async def _run_field_json_extraction(field, schema, prompt, text, fragment, request, semaphore, progress_cb=None, state=None):
    """Async helper to execute a single agent task using a JSON fragment."""
    if not fragment:
        if progress_cb:
            await progress_cb({"event": "field_done", "field": field, "msg": f"AI: Bypassed {field} (Not in JSON)"})
        return field, None

    async with semaphore:
        if request and await request.is_disconnected():
            return field, None

        if progress_cb:
            await progress_cb({"event": "extracting", "field": field, "msg": f"AI: Parsing {field} from JSON..."})

        settings = load_app_settings()
        num_ctx = settings["llm_config"].get("num_ctx")
        llm = get_llm(num_ctx=num_ctx)

        # Log calling
        agnt_log(f"Agent:{field} (JSON)", task="Parsing Field", input_data=str(fragment)[:50])

        try:
            custom_guidance = ""
            settings = load_app_settings()
            if settings.get("custom_prompts"):
                mode = settings.get("extraction_mode", "single")
                if mode == "multi":
                    cg = settings["custom_prompts"]["multi_agent"].get(field, "")
                    if cg: custom_guidance = f"ADDITIONAL USER INSTRUCTIONS:\n{cg}"
                else:
                    cg = settings["custom_prompts"].get("single_agent", "")
                    if cg: custom_guidance = f"ADDITIONAL USER INSTRUCTIONS:\n{cg}"

            if field == "description":
                raw_chain = prompt | llm
                inputs = {
                    "json_fragment": html.unescape(fragment) if isinstance(fragment, str) else json.dumps(fragment, indent=2),
                    "validation_feedback": "",
                    "custom_guidance": custom_guidance
                }

                # Dynamic check for variables in description prompt (JSON)
                vf = state.get("validation_feedback", "") if state else ""
                if vf:
                    label = "TRANSITION FEEDBACK (FALLBACK TO TEXT):" if state.get("use_text_fallback") else "PREVIOUS ATTEMPT FAILED QA VALIDATION:"
                    inputs["validation_feedback"] = f"{label}\n{vf}\n"

                raw_res = await asyncio.wait_for(raw_chain.ainvoke(inputs), timeout=600)
                val = raw_res.content
                if progress_cb:
                    await progress_cb({"event": "field_done", "field": field, "msg": f"Captured Description (JSON)"})
                
                # Log completion
                agnt_log(f"Agent:{field} (JSON)", result=str(val)[:50])
                return field, {"description": val}

            chain = prompt | llm.with_structured_output(schema)
            
            inputs = {
                "json_fragment": json.dumps(fragment, indent=2),
                "custom_guidance": custom_guidance,
                "validation_feedback": ""
            }
            
            # Also check for validation feedback in base prompts
            vf = state.get("validation_feedback", "") if state else ""
            if vf:
                label = "TRANSITION FEEDBACK (FALLBACK TO TEXT):" if state.get("use_text_fallback") else "PREVIOUS ATTEMPT FAILED QA VALIDATION:"
                inputs["validation_feedback"] = f"{label}\n{vf}\n"

            res = await asyncio.wait_for(chain.ainvoke(inputs), timeout=300)
            val = res.model_dump()

            if progress_cb:
                await progress_cb({"event": "field_done", "field": field, "msg": f"Parsed {field} from JSON"})
            
            # Log completion
            agnt_log(f"Agent:{field} (JSON)", result=str(val)[:50])
            return field, val
        except Exception as e:
            print(f"Error extracting JSON {field}: {e}")
            return field, None

def _get_json_ld_company(structured_data: dict) -> Any:
    """Robustly find company information in Schema.org JobPosting data."""
    # Official key: hiringOrganization
    org = structured_data.get("hiringOrganization")
    if org: return org
    
    # Common fallbacks
    for key in ["organization", "brand", "author", "publisher"]:
        val = structured_data.get(key)
        if val: return val
        
    return None

def _get_json_ld_salary(structured_data: dict) -> Any:
    """Robustly find salary information in Schema.org JobPosting data."""
    # Standard keys
    for key in ["baseSalary", "salaryRange", "salary", "estimatedSalary", "jobBenefits"]:
        val = structured_data.get(key)
        if val: return val
    return None

def _get_json_ld_identifier(structured_data: dict) -> Any:
    """Robustly find job identifier in Schema.org JobPosting data."""
    # Standard keys
    for key in ["identifier", "jobID", "job_id", "positionID"]:
        val = structured_data.get(key)
        if val: return val
    return None

def _map_json_ld_fragments(structured_data: dict) -> dict:
    """Unified helper to map raw JSON-LD data into standardized fragments using original Schema.org keys."""
    return {
        "hiringOrganization": _get_json_ld_company(structured_data),
        "title": structured_data.get("title"),
        "jobLocation": structured_data.get("jobLocation"),
        "baseSalary": _get_json_ld_salary(structured_data),
        "identifier": _get_json_ld_identifier(structured_data),
        "datePosted": structured_data.get("datePosted"),
        "validThrough": structured_data.get("validThrough"),
        "description": structured_data.get("description"),
    }

async def _run_multi_agent_json_extraction(structured_data: dict, text: str, request: Any = None, progress_cb: Callable = None, state: dict = None):
    settings = load_app_settings()
    # Concurrency limit (Dynamic from settings)
    semaphore = asyncio.Semaphore(settings.get("max_concurrency", 1))
    from ai.chains import (
        JobCompany, JobRole, JobLocation, JobSalary, JobId, 
        PostedDate, DeadlineDate, JobDescription,
        get_json_field_prompt, description_json_prompt
    )
    
    fragments = _map_json_ld_fragments(structured_data)
    
    metadata_tasks = [
        ("company", JobCompany, get_json_field_prompt("company", settings), fragments.get("hiringOrganization")),
        ("role", JobRole, get_json_field_prompt("role", settings), fragments.get("title")),
        ("location", JobLocation, get_json_field_prompt("location", settings), fragments.get("jobLocation")),
        ("salary_range", JobSalary, get_json_field_prompt("salary_range", settings), fragments.get("baseSalary")),
        ("company_job_id", JobId, get_json_field_prompt("company_job_id", settings), fragments.get("identifier")),
        ("job_posted_date", PostedDate, get_json_field_prompt("job_posted_date", settings), fragments.get("datePosted")),
        ("application_deadline", DeadlineDate, get_json_field_prompt("application_deadline", settings), fragments.get("validThrough")),
        ("description", JobDescription, description_json_prompt, fragments.get("description")),
    ]
    
    # Launch all tasks concurrently
    tasks = [
        _run_field_json_extraction(field, schema, prompt, text, fragment, request, semaphore, progress_cb, state=state)
        for field, schema, prompt, fragment in metadata_tasks
    ]
    
    results_list = await asyncio.gather(*tasks)
    
    results = {}
    for field, res in results_list:
        if res:
            results.update(res)
    return results

def _calculate_context_limit(settings: dict) -> int:
    """Calculate the character limit based on num_ctx * 3."""
    num_ctx = settings.get("llm_config", {}).get("num_ctx", 8192)
    try:
        limit = int(num_ctx) * 3
    except (ValueError, TypeError):
        limit = 8192 * 3
    return limit

async def check_job_post_node(state: AgentState):
    """
    New node to confirm if the input is a job post (Multi-Agent mode only).
    Single-agent mode embeds this check into its main prompt to save calls.
    ALSO PERFORMS CENTRALIZED TRUNCATION SENSITIVE TO num_ctx.
    """
    request = state.get("request")
    if request and await request.is_disconnected():
        return state

    settings = load_app_settings()
    limit = _calculate_context_limit(settings)
    progress_cb = state.get("progress_callback")
    
    # ── Centralized Truncation ─────────────────────────────────────────
    # We truncate once here. All downstream nodes inherit this state.
    text_truncated = False
    json_truncated = False
    
    # 1. Truncate Raw Text
    raw_text = state.get("text", "")
    if len(raw_text) > limit:
        state["text"] = raw_text[:limit]
        text_truncated = True
        agnt_log("Graph", task="Central Truncation", result=f"RAW_TEXT truncated to {limit} chars")

    # 2. Truncate JSON-LD Description (most common token sink)
    structured_data = state.get("structured_data")
    if structured_data and isinstance(structured_data, dict):
        desc = structured_data.get("description")
        if desc and isinstance(desc, str) and len(desc) > limit:
            structured_data["description"] = desc[:limit]
            json_truncated = True
            agnt_log("Graph", task="Central Truncation", result=f"JSON_LD description truncated to {limit} chars")

    # Initial context limit state
    state["text_truncated"] = text_truncated
    state["json_truncated"] = json_truncated
    state["context_limit_reached"] = False # Default, will be updated in extract_node based on path

    # If JSON-LD structured data is found, it's definitely a job post
    if structured_data:
        return {"error": None, "text_truncated": text_truncated, "json_truncated": json_truncated, "structured_data": structured_data}

    # Log LLM Info once
    llm_logged = state.get("llm_logged", False)
    if not llm_logged:
        log_llm_info()
        llm_logged = True

    mode = settings.get("extraction_mode", "single")
    
    # Requirement: In single-agent strategy, this feature is embedded in the agent prompt.
    if mode == "single":
        agnt_log("Verifier", task="Job Post Verification", result="SKIP: Embedded in Single-Agent Extractor")
        return {"error": None, "llm_logged": llm_logged, "text_truncated": text_truncated, "json_truncated": json_truncated}

    if progress_cb:
        await progress_cb({"event": "progress", "msg": "AI: Verifying content (Job Post Confirmation)..."})

    from ai.chains import get_job_post_check_prompt, JobPostCheck
    llm = get_llm(num_ctx=settings["llm_config"].get("num_ctx"))
    checker = get_job_post_check_prompt(settings) | llm.with_structured_output(JobPostCheck)

    # Log calling - use min(8000, limit) for identification as per plan
    verification_limit = min(8000, limit)
    agnt_log("Verifier", task="Checking Job Post Content", input_data=str(state["text"])[:50])

    try:
        # Check first portion for identification
        res = await asyncio.wait_for(
            checker.ainvoke({"text": state["text"][:verification_limit]}),
            timeout=120
        )
        if not res.is_job_post or res.likelihood < 0.8:
            category = res.detected_category or "Unknown"
            reason = res.reason or "The content does not appear to be a job posting."
            # Log result
            agnt_log("Verifier", result=f"FAIL: {category} (Likelihood: {res.likelihood})")
            return {"error": f"NOT_A_JOB_POST: This document looks like a {category}. {reason}", "llm_logged": llm_logged}
            
        # Log result
        agnt_log("Verifier", result="PASS: Job post confirmed.")
        return {"error": None, "llm_logged": llm_logged}
    except Exception as e:
        print(f"Error in job post check node: {e}")
        # Fail-fast on tech errors to ensure extraction only runs on verified content
        return {"error": f"IDENTIFICATION_ERROR: AI failed to verify the document content. {str(e)}", "llm_logged": llm_logged}

async def extract_node(state: AgentState):
    settings = load_app_settings()
    mode = settings.get("extraction_mode", "single")
    request = state.get("request")
    progress_cb = state.get("progress_callback")
    text = state.get("text")
    url = state.get("url")
    is_json_ld = state.get("structured_data") is not None
    structured_data = state.get("structured_data")
    use_text_fallback = state.get("use_text_fallback", False)
    vf = state.get("validation_feedback", "")
    
    # Priority A: JSON-LD (Attempt 0)
    # Priority B: Text Fallback (Attempt 1+)
    active_source = "JSON-LD" if (is_json_ld and not use_text_fallback) else "TEXT"
    
    # Track source in state for routing to the correct specialized validator
    state_update = {"active_source": active_source}

    # Context-Aware Flagging Strategy
    # Warn only if the used source was truncated
    context_limit_reached = False
    if active_source == "JSON-LD":
        context_limit_reached = state.get("json_truncated", False)
    else:
        # TEXT mode (Primary or Fallback)
        context_limit_reached = state.get("text_truncated", False)
        # If we had JSON but fell back, a truncation in JSON description also matters
        if is_json_ld and state.get("json_truncated"):
             context_limit_reached = True

    if context_limit_reached:
        state_update["context_limit_reached"] = True
        agnt_log("Graph", task="Warning", result="Active source exceeded context limit")
        if progress_cb:
            # Emit SSE Warning
            await progress_cb({
                "event": "progress", 
                "msg": "Warning: Job content exceeds AI context window. Validation completeness check will be limited."
            })

    try:
        from ai.chains import (
            get_extraction_prompt, JobDetails,
            _create_description_prompt, get_json_ld_prompt
        )
        settings = load_app_settings()
        extraction_prompt = get_extraction_prompt(settings)
        description_extraction_prompt = _create_description_prompt(settings)
        structured_data_validation_prompt = get_json_ld_prompt(settings)

        # RETRY MODE: Triggered by description QA validator (stays on current source)
        is_fallback_transition = vf.startswith("FALLBACK_PHASE:") if vf else False
        
        if state.get("extracted_data") and not is_fallback_transition:
            # --- QA RETRY PATH: Only extract description with feedback ---
            results = state["extracted_data"].copy()
            if progress_cb:
                if use_text_fallback:
                     await progress_cb({"event": "progress", "msg": f"AI: Fallback! Scaling up to Full Text extraction (Attempt {state.get('retries', 0)}/3)..."})
                else:
                     await progress_cb({"event": "progress", "msg": f"AI: Regenerating Description (QA Retry {state.get('retries', 0)}/3)..."})
            
            text_with_feedback = f"PREVIOUS ATTEMPT FAILED QA VALIDATION:\n{vf}\n\nORIGINAL TEXT:\n{text}" if vf else text

            if mode == "multi":
                from ai.chains import JobDescription, description_extraction_prompt, description_json_prompt
                sema = asyncio.Semaphore(settings.get("max_concurrency", 1))
                if active_source == "JSON-LD":
                    _, desc_val = await _run_field_json_extraction("description", JobDescription, description_json_prompt, text_with_feedback, structured_data.get("description"), request, sema, progress_cb, state=state)
                else:    
                    _, desc_val = await _run_field_extraction("description", JobDescription, description_extraction_prompt, text_with_feedback, url, request, sema, progress_cb, state=state)
                results["description"] = desc_val.get("description") if desc_val else None
            else:
                llm = get_llm(num_ctx=settings["llm_config"].get("num_ctx"))
                
                if active_source == "JSON-LD":
                    extractor = structured_data_validation_prompt | llm.with_structured_output(JobDetails)
                    inputs = {
                        "json_ld_data": json.dumps(structured_data, indent=2),
                        "raw_text": text,
                        "validation_feedback": f"PREVIOUS ATTEMPT FAILED QA VALIDATION:\n{vf}\nPLEASE FIX THESE ISSUES.\n" if vf else "",
                        "custom_guidance": ""
                    }
                else:
                    extractor = get_extraction_prompt(settings) | llm.with_structured_output(JobDetails)
                    inputs = { 
                        "text": text_with_feedback, 
                        "url": url or "Not provided",
                        "validation_feedback": f"PREVIOUS ATTEMPT FAILED QA VALIDATION:\n{vf}\nPLEASE FIX THESE ISSUES.\n" if vf else ""
                    }
                
                cg = settings.get("custom_prompts", {}).get("single_agent", "")
                inputs["custom_guidance"] = f"ADDITIONAL USER INSTRUCTIONS:\n{cg}" if cg else ""
                
                result = await asyncio.wait_for(extractor.ainvoke(inputs), timeout=600)
                results["description"] = result.model_dump().get("description")
 
            state_update["extracted_data"] = results
            return state_update

        if request and await request.is_disconnected():
            return {"extracted_data": None, "error": "Cancelled"}
            
        # FRESH EXTRACTION MODE
        if active_source == "JSON-LD":
            # --- PATH A: JSON-LD Phase ---
            if mode == "multi":
                if progress_cb:
                    await progress_cb({"event": "progress", "msg": "AI: JSON-LD found! Using Multi-Agent JSON extraction..."})
                results = await _run_multi_agent_json_extraction(structured_data, text, request, progress_cb, state=state)
                state_update["extracted_data"] = results
                return state_update
            else:
                if progress_cb:
                    await progress_cb({"event": "progress", "msg": "AI: JSON-LD found! Validating and converting metadata..."})
                
                llm_logged = state.get("llm_logged", False)
                if not llm_logged:
                    log_llm_info()
                    llm_logged = True

                agnt_log("Extractor (JSON-LD)", task="Mapping Fields", input_data=str(structured_data.get("title"))[:50])

                llm = get_llm(num_ctx=settings["llm_config"].get("num_ctx"))
                chain = structured_data_validation_prompt | llm.with_structured_output(JobDetails)
                
                mapped_fragments = _map_json_ld_fragments(structured_data)
                
                # DIAGNOSTIC: Save JSON sources for troubleshooting
                try:
                    tmp_dir = settings.TMP_DIR
                    os.makedirs(tmp_dir, exist_ok=True)
                    
                    # 1. RAW: Original structured data
                    with open(os.path.join(tmp_dir, "raw_json_ld.json"), "w", encoding="utf-8") as f:
                        json.dump(structured_data, f, indent=2)
                        
                    # 2. CLEAN: Fragments actually sent to AI
                    with open(os.path.join(tmp_dir, "last_fragments.json"), "w", encoding="utf-8") as f:
                        json.dump(mapped_fragments, f, indent=2)
                        
                    agnt_log("Graph", task="Diagnostic", result=f"Saved raw and clean JSON to {tmp_dir}")
                except Exception as e:
                    print(f"Error saving diagnostic JSON: {e}")

                inputs = {
                    "json_ld_data": json.dumps(mapped_fragments, indent=2),
                    "custom_guidance": "",
                    "validation_feedback": ""
                }
                
                cg = settings.get("custom_prompts", {}).get("single_agent", "")
                if cg: inputs["custom_guidance"] = f"ADDITIONAL USER INSTRUCTIONS:\n{cg}"

                result = await asyncio.wait_for(chain.ainvoke(inputs), timeout=600)
                agnt_log("Extractor (JSON-LD)", task="RAW_AI_OUTPUT", result=str(result)[:200])
                data = result.model_dump()
                agnt_log("Extractor (JSON-LD)", result=f"SUCCESS: Data extracted. [Company: {data.get('company')}, Role: {data.get('role')}]")
                state_update.update({"extracted_data": data, "error": None, "llm_logged": llm_logged})
                return state_update

        else:
            # --- PATH B: Text Fallback (or Non-JSON Entry) ---
            previous_json = state.get("previous_json_results") or {}
            
            if mode == "multi":
                # Determine fields that are still missing from Attempt 0
                missing_fields = []
                # All Multi-Agent fields from metadata_tasks
                test_fields = ["company", "role", "location", "salary_range", "company_job_id", "job_posted_date", "application_deadline", "description"]
                for f in test_fields:
                    if not previous_json.get(f):
                        missing_fields.append(f)
                
                if not missing_fields:
                    state_update["extracted_data"] = previous_json
                    return state_update

                if progress_cb:
                    await progress_cb({"event": "progress", "msg": f"AI: Falling back to text mode for {len(missing_fields)} missing fields..."})
                
                new_results = await _run_multi_agent_extraction(text, url, request, progress_cb, state=state, fields_to_extract=missing_fields)
                
                # Merge: JSON ground truth > Text results
                final_results = previous_json.copy()
                for k, v in new_results.items():
                    # If JSON result is missing or a placeholder, use the Fallback Text result
                    if not _is_valid_value(final_results.get(k)):
                        final_results[k] = v
                
                state_update["extracted_data"] = final_results
                return state_update
            else:
                # --- PATH B: Text Fallback (or Non-JSON Entry) ---
                llm_logged = state.get("llm_logged", False)
                llm = get_llm(num_ctx=settings["llm_config"].get("num_ctx"))
                if not llm_logged:
                    log_llm_info()
                    llm_logged = True

                if request and await request.is_disconnected():
                    return {"extracted_data": None, "error": "Cancelled"}
                    
                if progress_cb:
                    msg = "AI: JSON-LD incomplete. Falling back to Full Text extraction..." if use_text_fallback else "AI: Extracting details from text (Ollama)..."
                    await progress_cb({"event": "progress", "msg": msg})

                extractor = get_extraction_prompt(settings) | llm.with_structured_output(JobDetails)
                cg = settings.get("custom_prompts", {}).get("single_agent", "")
                
                # Determine correct label for validation_feedback
                label = "TRANSITION FEEDBACK (FALLBACK TO TEXT):" if use_text_fallback else "PREVIOUS ATTEMPT FAILED QA VALIDATION:"
                
                inputs = { 
                    "text": text, 
                    "url": url or "Not provided",
                    "custom_guidance": f"ADDITIONAL USER INSTRUCTIONS:\n{cg}" if cg else "",
                    "validation_feedback": f"{label}\n{vf}\n" if vf else ""
                }
                    
                agnt_log("Extractor (Text)", task="Full Extraction", input_data=str(text)[:50])
                result = await asyncio.wait_for(extractor.ainvoke(inputs), timeout=600)
                data = result.model_dump()
                
                # Verification Step (Only on Fresh Pass, not Fallback)
                if not use_text_fallback:
                    if not data.get("is_job_post") or data.get("likelihood", 1.0) < 0.8:
                        category = data.get("detected_category") or "Unknown"
                        agnt_log("Extractor (Text)", result=f"FAIL: Not a job post ({category})")
                        state_update.update({"extracted_data": None, "error": f"NOT_A_JOB_POST: This document looks like a {category}."})
                        return state_update

                if request and await request.is_disconnected():
                    return {"extracted_data": None, "error": "Cancelled"}

                # MERGE LOGIC (Single-Agent): Prioritize previous JSON results
                final_results = data
                if previous_json:
                    for k, v in previous_json.items():
                        # ONLY preserve JSON value if it's actually valid content
                        if _is_valid_value(v):
                            final_results[k] = v

                agnt_log("Extractor (Text)", result=f"SUCCESS: Data extracted. [Company: {final_results.get('company')}, Role: {final_results.get('role')}]")
                state_update.update({"extracted_data": final_results, "error": None, "llm_logged": llm_logged})
                return state_update
    except asyncio.TimeoutError:
        return {"extracted_data": None, "error": "Extraction timed out after 5 minutes. Try smaller snippets or Multi-Agent mode."}
    except Exception as e:
        return {"extracted_data": None, "error": str(e)}

async def json_validator_node(state: AgentState):
    """
    Specialized validator for JSON-LD sources. 
    Focuses on HTML fidelity and heuristic metadata completeness.
    """
    request = state.get("request")
    if request and await request.is_disconnected():
        return {"validation_feedback": None, "error": "Cancelled"}
        
    extracted = state.get("extracted_data")
    if not extracted or not extracted.get("description"):
        return {"validation_feedback": None}
        
    description = extracted["description"]
    
    # 1. Clean markdown wrappers
    if description.strip().startswith("```markdown"):
        lines = description.strip().split("\n")
        if len(lines) > 2 and lines[-1].strip() == "```":
            description = "\n".join(lines[1:-1])
            extracted["description"] = description

    retries = state.get("retries", 0)
    if retries >= 3:
        extracted["hallucination_detected"] = True
        extracted["hallucination_reasons"] = state.get("validation_feedback", "Maximum validation attempts reached.")
        return {"extracted_data": extracted}

    # 2. HEURISTIC METADATA CHECK (Check if we need fallback soon)
    important_fields = {
        "company": "Company Name",
        "role": "Job Role",
        "location": "Location",
        "salary_range": "Salary Range",
        "company_job_id": "Job ID",
        "job_posted_date": "Posted Date",
        "application_deadline": "Application Deadline"
    }
    
    missing_reasons = []
    for key, label in important_fields.items():
        val = extracted.get(key)
        if not _is_valid_value(val):
            reason = f"'{val}'" if val is not None else "Missing"
            missing_reasons.append(f"  - {key} ({reason})")

    if missing_reasons:
        missing_list = [r.split(" ")[3] for r in missing_reasons]
        missing_str = ", ".join(missing_list)
        agnt_log("JSON Validator", task="FALLBACK", result=f"Switching to TEXT mode. Missing fields: [{missing_str}]")
        return {
            "active_source": "TEXT", 
            "use_text_fallback": True, 
            "validation_feedback": f"FALLBACK_PHASE: Incomplete JSON-LD metadata. Missing: {missing_str}",
            "retries": retries + 1
        }

    # 3. LLM FIDELITY QA (Even if metadata failed, we want to 'Verify' the description)
    from ai.chains import get_json_validation_prompt, DescriptionValidation
    progress_cb = state.get("progress_callback")
    if progress_cb:
         await progress_cb({"event": "progress", "msg": "AI: Validating JSON-LD fidelity (Fidelity check)..."})

    settings = load_app_settings()
    llm = get_llm(num_ctx=settings["llm_config"].get("num_ctx"))
    validator = get_json_validation_prompt(settings) | llm.with_structured_output(DescriptionValidation)
    
    def find_description(data):
        if isinstance(data, dict):
            if "@graph" in data: return find_description(data["@graph"])
            if data.get("@type") == "JobPosting": return data.get("description", "")
            if "all_json_ld" in data: return find_description(data["all_json_ld"])
        elif isinstance(data, list):
            for item in data:
                res = find_description(item)
                if res: return res
        return ""
    raw_source = html.unescape(find_description(state["structured_data"]))
    
    custom_guidance = settings.get("custom_prompts", {}).get("qa_json", "")
    agnt_log("JSON Validator", task="Validating Fidelity", input_data=str(description)[:50])
    
    description_verified = False
    try:
        result = await asyncio.wait_for(
            validator.ainvoke({
                "source_text": str(raw_source), 
                "generated_description": str(description),
                "custom_guidance": f"ADDITIONAL QA GUIDANCE:\n{custom_guidance}" if custom_guidance else ""
            }),
            timeout=180
        )
        
        if result.is_valid and result.is_complete:
            agnt_log("JSON Validator", task="QA_DONE", result="PASS")
            description_verified = True
        else:
            reason = result.failure_reason or "Fidelity error"
            agnt_log("JSON Validator", task="QA_FAILURE", result=f"REJECTED: Fidelity check failed. Reason: {reason}")
            # If description itself is bad, we retry extraction (not necessarily fallback yet)
            if retries >= 2:
                extracted["hallucination_detected"] = True
                extracted["hallucination_reasons"] = f"QA Fail (Final): {reason}"
                return {"extracted_data": extracted, "retries": 1, "validation_feedback": reason}
            return {"retries": 1, "validation_feedback": reason}
            
    except Exception as e:
        agnt_log("JSON Validator", task="ERROR", result=str(e))
        return {"retries": 1, "validation_feedback": f"Fidelity error: {e}"}

    return {"extracted_data": extracted, "validation_feedback": None, "description_verified": True}

async def text_validator_node(state: AgentState):
    """
    Specialized validator for Raw Text sources.
    Focuses on boundary detection and semantic completeness.
    """
    request = state.get("request")
    if request and await request.is_disconnected():
        return {"validation_feedback": None, "error": "Cancelled"}
        
    extracted = state.get("extracted_data")
    if not extracted or not extracted.get("description"):
        return {"validation_feedback": None}
        
    description = extracted["description"]
    if description.strip().startswith("```markdown"):
        lines = description.strip().split("\n")
        if len(lines) > 2 and lines[-1].strip() == "```":
            description = "\n".join(lines[1:-1])
            extracted["description"] = description

    retries = state.get("retries", 0)
    if retries >= 3:
        extracted["hallucination_detected"] = True
        extracted["hallucination_reasons"] = state.get("validation_feedback", "Max retries in text mode.")
        return {"extracted_data": extracted}

    # --- FAST PASS: Skip validation if already verified by JSON pass ---
    if state.get("description_verified"):
        agnt_log("Text Validator", task="FAST_PASS", result="Skipping validation (Description already verified by JSON Fidelity pass).")
        return {"extracted_data": extracted, "validation_feedback": None}

    # --- LLM SEMANTIC QA (Text Mode) ---
    from ai.chains import get_text_validation_prompt, DescriptionValidation
    progress_cb = state.get("progress_callback")
    if progress_cb:
         await progress_cb({"event": "progress", "msg": "AI: Validating Text source (Completeness & Boundaries)..."})

    settings = load_app_settings()
    llm = get_llm(num_ctx=settings["llm_config"].get("num_ctx"))
    validator = get_text_validation_prompt(settings) | llm.with_structured_output(DescriptionValidation)
    
    custom_guidance = settings.get("custom_prompts", {}).get("qa_text", "")
    agnt_log("Text Validator", task="Validating Text Source", input_data=str(description)[:50])
    
    try:
        result = await asyncio.wait_for(
            validator.ainvoke({
                "source_text": str(state["text"]), 
                "generated_description": str(description),
                "custom_guidance": f"ADDITIONAL QA GUIDANCE:\n{custom_guidance}" if custom_guidance else ""
            }),
            timeout=180
        )
        
        if not result.is_valid or not result.is_complete:
            reason = result.failure_reason or "Boundary error"
            agnt_log("Text Validator", task="QA_FAILURE", result=f"REJECTED: Fidelity check failed. Reason: {reason}")
            if retries >= 2:
                extracted["hallucination_detected"] = True
                extracted["hallucination_reasons"] = f"QA Fail (Final): {reason}"
                return {"extracted_data": extracted, "retries": 1, "validation_feedback": reason}
            return {"retries": 1, "validation_feedback": reason}
            
        agnt_log("Text Validator", task="DONE", result="PASS")
        return {"extracted_data": extracted, "validation_feedback": None}
    except Exception as e:
        return {"retries": 1, "validation_feedback": f"Text QA error: {e}"}

def should_continue_after_check(state: AgentState):
    if state.get("error"):
        return "end"
    return "extract"

def should_retry(state: AgentState):
    feedback = state.get("validation_feedback")
    retries = state.get("retries", 0)
    source = state.get("active_source", "TEXT")
    
    if feedback is not None and retries < 3:
        agnt_log("Graph", task="RETRY", result=f"Looping back to extraction (Attempt {retries + 1}/3) ({source} Mode)...")
        return "retry"
    
    if retries >= 3:
        agnt_log("Graph", task="CIRCUIT_BREAKER", result="Max retries reached. Termination.")
        
    return "end"

def route_to_validator(state: AgentState):
    """Router to choose the specialized validator based on the extraction source."""
    source = state.get("active_source", "TEXT")
    if source == "JSON-LD":
        return "json_validator"
    return "text_validator"

def get_agent_app():
    from langgraph.graph import StateGraph, END
    
    settings = load_app_settings()
    workflow = StateGraph(AgentState)
    
    # These prompts are now generated with the LATEST settings on every call
    check_job_post_prompt = get_job_post_check_prompt(settings)
    extraction_prompt = get_extraction_prompt(settings)
    description_extraction_prompt = _create_description_prompt(settings)
    structured_data_validation_prompt = get_json_ld_prompt(settings)
    
    workflow.add_node("check", check_job_post_node)
    workflow.add_node("extract", extract_node)
    workflow.add_node("json_validator", json_validator_node)
    workflow.add_node("text_validator", text_validator_node)
    
    workflow.set_entry_point("check")
    
    workflow.add_conditional_edges("check", should_continue_after_check, {
        "extract": "extract",
        "end": END
    })
    
    # Specialized Routing after extraction
    workflow.add_conditional_edges("extract", route_to_validator, {
        "json_validator": "json_validator",
        "text_validator": "text_validator"
    })
    
    # Both validators can lead to retries
    workflow.add_conditional_edges("json_validator", should_retry, {
        "retry": "extract",
        "end": END
    })
    workflow.add_conditional_edges("text_validator", should_retry, {
        "retry": "extract",
        "end": END
    })
    
    return workflow.compile()
