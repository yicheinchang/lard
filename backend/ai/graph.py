import asyncio
import json
from typing import TypedDict, Any, Callable
from ai.llm_factory import get_llm
from config import load_app_settings

class AgentState(TypedDict):
    text: str
    url: str | None
    extracted_data: dict | None
    error: str | None
    request: Any | None # fastapi.Request
    progress_callback: Callable | None # Async callback for streaming
    structured_data: dict | None
    retries: int
    validation_feedback: str | None

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

        # --- Fixed Context Strategy (8190 tokens) ---
        # Using a stable, fixed context window for local LLM performance as requested
        num_ctx = 8190 
        llm = get_llm(num_ctx=num_ctx)

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
                inputs = {"text": text, "url": url or "Not provided"}
                
                vf = state.get("validation_feedback", "") if state else ""
                feedback_str = f"PREVIOUS ATTEMPT FAILED QA VALIDATION:\n{vf}\nPLEASE FIX THESE ISSUES.\n" if vf else ""
                
                if "validation_feedback" in prompt_vars:
                    inputs["validation_feedback"] = feedback_str
                if "custom_guidance" in prompt_vars:
                    inputs["custom_guidance"] = custom_guidance
                    
                raw_res = await asyncio.wait_for(
                    raw_chain.ainvoke(inputs),
                    timeout=600
                )
                verbatim_text = raw_res.content
                
                if progress_cb:
                    snippet = str(verbatim_text)[:40] + ("..." if len(str(verbatim_text)) > 40 else "")
                    await progress_cb({"event": "field_done", "field": field, "msg": f"Captured Description: {snippet}"})
                
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
            inputs = {"text": text, "url": url or "Not provided"}
            prompt_vars = prompt.input_variables if hasattr(prompt, 'input_variables') else []
            if "custom_guidance" in prompt_vars:
                inputs["custom_guidance"] = custom_guidance
            
            # Also check for validation feedback in case user added it to base prompts
            if "validation_feedback" in prompt_vars:
                vf = state.get("validation_feedback", "") if state else ""
                inputs["validation_feedback"] = f"PREVIOUS ATTEMPT FAILED QA VALIDATION:\n{vf}\nPLEASE FIX THESE ISSUES.\n" if vf else ""

            res = await asyncio.wait_for(
                chain.ainvoke(inputs),
                timeout=300
            )
            val = res.model_dump()
            
            if progress_cb:
                raw_val = list(val.values())[0]
                snippet = str(raw_val)[:40] + ("..." if len(str(raw_val)) > 40 else "")
                await progress_cb({"event": "field_done", "field": field, "msg": f"Found {field.replace('_', ' ')}: {snippet}"})
                
            return field, val

        except (asyncio.TimeoutError, Exception) as e:
            print(f"Error extracting {field}: {e}")
            return field, None

async def _run_multi_agent_extraction(text: str, url: str, request: Any = None, progress_cb: Callable = None, state: dict = None):
    """Parallelized extraction for small models (Multi-Agent mode) with streaming support."""
    # Concurrency limit (Keep at 1 for stability when processing large descriptions on local LLM)
    semaphore = asyncio.Semaphore(1)
    
    from ai.chains import (
        JobCompany, JobRole, JobLocation, JobSalary, JobId, 
        PostedDate, DeadlineDate, JobDescription,
        get_field_prompt, _create_description_prompt
    )
    settings = load_app_settings()
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
    
    # Launch all tasks concurrently
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

        num_ctx = 8190
        llm = get_llm(num_ctx=num_ctx)

        try:
            if field == "description":
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

                raw_chain = prompt | llm
                inputs = {"json_fragment": json.dumps(fragment, indent=2)}
                
                vf = state.get("validation_feedback", "") if state else ""
                feedback_str = f"PREVIOUS ATTEMPT FAILED QA VALIDATION:\n{vf}\nPLEASE FIX THESE ISSUES.\n" if vf else ""

                if "validation_feedback" in raw_chain.input_schema.model_fields:
                    inputs["validation_feedback"] = feedback_str
                if "custom_guidance" in raw_chain.input_schema.model_fields:
                    inputs["custom_guidance"] = custom_guidance

                raw_res = await asyncio.wait_for(raw_chain.ainvoke(inputs), timeout=600)
                val = raw_res.content
                if progress_cb:
                    await progress_cb({"event": "field_done", "field": field, "msg": f"Captured Description (JSON)"})
                return field, {"description": val}

            chain = prompt | llm.with_structured_output(schema)
            
            inputs = {"json_fragment": json.dumps(fragment, indent=2)}
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

            vars_needed = [p for p in chain.input_schema.model_fields.keys()]
            if "custom_guidance" in vars_needed:
                inputs["custom_guidance"] = custom_guidance

            res = await asyncio.wait_for(chain.ainvoke(inputs), timeout=300)
            val = res.model_dump()

            if progress_cb:
                await progress_cb({"event": "field_done", "field": field, "msg": f"Parsed {field} from JSON"})
            return field, val
        except Exception as e:
            print(f"Error extracting JSON {field}: {e}")
            return field, None

async def _run_multi_agent_json_extraction(structured_data: dict, text: str, request: Any = None, progress_cb: Callable = None, state: dict = None):
    semaphore = asyncio.Semaphore(1)
    from ai.chains import (
        JobCompany, JobRole, JobLocation, JobSalary, JobId, 
        PostedDate, DeadlineDate, JobDescription,
        get_json_field_prompt, description_json_prompt
    )
    settings = load_app_settings()
    
    metadata_tasks = [
        ("company", JobCompany, get_json_field_prompt("company", settings), structured_data.get("hiringOrganization")),
        ("role", JobRole, get_json_field_prompt("role", settings), structured_data.get("title")),
        ("location", JobLocation, get_json_field_prompt("location", settings), structured_data.get("jobLocation")),
        ("salary_range", JobSalary, get_json_field_prompt("salary_range", settings), structured_data.get("baseSalary")),
        ("company_job_id", JobId, get_json_field_prompt("company_job_id", settings), structured_data.get("identifier") or structured_data.get("url")),
        ("job_posted_date", PostedDate, get_json_field_prompt("job_posted_date", settings), structured_data.get("datePosted")),
        ("application_deadline", DeadlineDate, get_json_field_prompt("application_deadline", settings), structured_data.get("validThrough")),
        ("description", JobDescription, description_json_prompt, structured_data.get("description")),
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
        else:
            results[field] = None
            
    return results

async def extract_node(state: AgentState):
    settings = load_app_settings()
    mode = settings.get("extraction_mode", "single")
    request = state.get("request")
    progress_cb = state.get("progress_callback")
    text = state.get("text")
    url = state.get("url")
    is_json_ld = state.get("structured_data") is not None
    structured_data = state.get("structured_data")
    
    try:
        from ai.chains import (
            get_extraction_prompt, JobDetails,
            _create_description_prompt, get_json_ld_prompt
        )
        settings = load_app_settings()
        extraction_prompt = get_extraction_prompt(settings)
        description_extraction_prompt = _create_description_prompt(settings)
        structured_data_validation_prompt = get_json_ld_prompt(settings)
        if state.get("extracted_data"):
            # Retry Mode: Only re-extract description using validation feedback
            results = state["extracted_data"].copy()
            if progress_cb:
                await progress_cb({"event": "progress", "msg": f"AI: Regenerating Description (Retry {state.get('retries', 0)}/3)..."})
            
            vf = state.get("validation_feedback", "")
            text_with_feedback = f"PREVIOUS ATTEMPT FAILED QA VALIDATION:\n{vf}\n\nORIGINAL TEXT:\n{text}" if vf else text

            # Redo description only
            if mode == "multi":
                from ai.chains import JobDescription, description_extraction_prompt, description_json_prompt
                sema = asyncio.Semaphore(1)
                if is_json_ld:
                    _, desc_val = await _run_field_json_extraction("description", JobDescription, description_json_prompt, text_with_feedback, structured_data.get("description"), request, sema, progress_cb, state=state)
                else:    
                    _, desc_val = await _run_field_extraction("description", JobDescription, description_extraction_prompt, text_with_feedback, url, request, sema, progress_cb, state=state)
                results["description"] = desc_val.get("description") if desc_val else None
            else:
                llm = get_llm(num_ctx=8190)
                extractor = get_extraction_prompt(settings) | llm.with_structured_output(JobDetails)
                inputs = { "text": text_with_feedback, "url": url or "Not provided" }
                
                # Dynamic check for variables in extraction prompt
                prompt_vars = extractor.get_graph().nodes['__start__']['data'].input_variables if hasattr(extractor, 'get_graph') else []
                # Fallback: check the prompt directly if possible
                if not prompt_vars:
                    prompt_vars = get_extraction_prompt(settings).input_variables
                
                if "custom_guidance" in prompt_vars:
                    cg = settings.get("custom_prompts", {}).get("single_agent", "")
                    inputs["custom_guidance"] = f"ADDITIONAL USER INSTRUCTIONS:\n{cg}" if cg else ""
                if "validation_feedback" in prompt_vars:
                    vf = state.get("validation_feedback", "")
                    inputs["validation_feedback"] = f"PREVIOUS ATTEMPT FAILED QA VALIDATION:\n{vf}\nPLEASE FIX THESE ISSUES.\n" if vf else ""
                
                result = await asyncio.wait_for(extractor.ainvoke(inputs), timeout=600)
                results["description"] = result.model_dump().get("description")

            return {"extracted_data": results, "error": None}


        if is_json_ld:
            # --- PATH A: JSON-LD Structured Data found ---
            if mode == "multi":
                if progress_cb:
                    await progress_cb({"event": "progress", "msg": "AI: JSON-LD found! Using Multi-Agent JSON extraction..."})
                results = await _run_multi_agent_json_extraction(structured_data, text, request, progress_cb, state=state)
                return {"extracted_data": results, "error": None}
            else:
                if progress_cb:
                    await progress_cb({"event": "progress", "msg": "AI: JSON-LD found! Validating and converting description..."})
                
                # Use Single-Agent logic with the validation prompt
                llm = get_llm(num_ctx=8190)
                chain = structured_data_validation_prompt | llm.with_structured_output(JobDetails)
                
                inputs = {"json_ld_data": json.dumps(structured_data, indent=2)}
                if "custom_guidance" in chain.input_schema.model_fields:
                    cg = settings.get("custom_prompts", {}).get("single_agent", "")
                    inputs["custom_guidance"] = f"ADDITIONAL USER INSTRUCTIONS:\n{cg}" if cg else ""

                result = await asyncio.wait_for(
                    chain.ainvoke(inputs),
                    timeout=600
                )
                return {"extracted_data": result.model_dump(), "error": None}

        if mode == "multi":
            if is_json_ld:
                results = await _run_multi_agent_json_extraction(structured_data, text, request, progress_cb, state=state)
            else:
                results = await _run_multi_agent_extraction(text, url, request, progress_cb, state=state)
            return {"extracted_data": results, "error": None}
        else:
            # Single-Agent (Default) using fixed 8190 context
            llm = get_llm(num_ctx=8190)
            if request and await request.is_disconnected():
                return {"extracted_data": None, "error": "Cancelled"}
                
            if progress_cb:
                await progress_cb({"event": "extracting", "field": "all", "msg": "AI: Extracting all job details (Fixed Context)..."})

            extractor = get_extraction_prompt(settings) | llm.with_structured_output(JobDetails)
            
            inputs = { "text": state["text"], "url": state.get("url") or "Not provided" }
            
            # Dynamic check for variables
            prompt_vars = get_extraction_prompt(settings).input_variables
            if "custom_guidance" in prompt_vars:
                cg = settings.get("custom_prompts", {}).get("single_agent", "")
                inputs["custom_guidance"] = f"ADDITIONAL USER INSTRUCTIONS:\n{cg}" if cg else ""
            if "validation_feedback" in prompt_vars:
                inputs["validation_feedback"] = "" # No feedback on first pass
                
            result = await asyncio.wait_for(
                extractor.ainvoke(inputs),
                timeout=600
            )
            return {"extracted_data": result.model_dump(), "error": None}
    except asyncio.TimeoutError:
        return {"extracted_data": None, "error": "Extraction timed out after 5 minutes. Try smaller snippets or Multi-Agent mode."}
    except Exception as e:
        return {"extracted_data": None, "error": str(e)}

async def description_validator_node(state: AgentState):
    request = state.get("request")
    if request and await request.is_disconnected():
        return state
        
    extracted = state.get("extracted_data")
    if not extracted or not extracted.get("description"):
        return state
        
    description = extracted["description"]
    
    # Pre-parse common markdown wrapper hallucinations directly to save AI calls
    if description.strip().startswith("```markdown"):
        lines = description.strip().split("\n")
        if len(lines) > 2 and lines[-1].strip() == "```":
            description = "\n".join(lines[1:-1])
            extracted["description"] = description

    retries = state.get("retries", 0)
    if retries >= 3:
        # Circuit Breaker tripped
        progress_cb = state.get("progress_callback")
        if progress_cb:
             await progress_cb({"event": "progress", "msg": "AI: Validation limit reached. Flagging potential hallucination."})
             
        # Instead of nulling, we keep the description but flag it for UI warning
        extracted["hallucination_detected"] = True
        extracted["hallucination_reasons"] = state.get("validation_feedback", "Maximum validation attempts reached without passing QA.")
        return {"extracted_data": extracted}
        
    from ai.chains import get_validation_prompt, DescriptionValidation
    
    progress_cb = state.get("progress_callback")
    if progress_cb:
         await progress_cb({"event": "progress", "msg": "AI: Validating Description format (AI Hallucination check)..."})

    llm = get_llm(num_ctx=8190)
    settings = load_app_settings()
    validator = get_validation_prompt(settings) | llm.with_structured_output(DescriptionValidation)
    
    try:
        is_json_ld = state.get("structured_data") is not None
        source_type = "JSON-LD" if is_json_ld else "TEXT"
        raw_source = state.get("structured_data", {}).get("description", "") if is_json_ld else state["text"]
        
        result = await asyncio.wait_for(
            validator.ainvoke({
                "source_type": source_type,
                "source_text": str(raw_source)[:5000], 
                "generated_description": str(description)
            }),
            timeout=180
        )
        
        failed = not result.is_valid or not result.is_complete
        if failed:
            reason = result.failure_reason or "Unknown validation error"
            print(f"\n[AI VALIDATOR] Validation Failed ({source_type} Mode) (Attempt {retries + 1}/3):")
            print(f" > WHY: {reason}")
            
            if retries >= 2:
                # Final attempt failed
                extracted["hallucination_detected"] = True
                extracted["hallucination_reasons"] = f"QA Fail (Final Attempt): {reason}"
                return {"extracted_data": extracted, "retries": retries + 1, "validation_feedback": reason}

            if progress_cb:
                 await progress_cb({"event": "progress", "msg": f"AI Validator issue: {reason}"})
            return {"retries": retries + 1, "validation_feedback": reason}
            
        return {"extracted_data": extracted, "validation_feedback": None}
    except Exception as e:
        print(f"Validation failed temporarily: {e}")
        return state

def should_retry(state: AgentState):
    if state.get("error") is not None:
        return "end"
    if state.get("validation_feedback") is not None and state.get("retries", 0) < 3:
        return "retry"
    return "end"

_agent_app_instance = None

def get_agent_app():
    global _agent_app_instance
    if _agent_app_instance is None:
        from langgraph.graph import StateGraph, END
        workflow = StateGraph(AgentState)
        workflow.add_node("extract", extract_node)
        workflow.add_node("validate", description_validator_node)
        workflow.set_entry_point("extract")
        workflow.add_edge("extract", "validate")
        workflow.add_conditional_edges("validate", should_retry, {
            "retry": "extract",
            "end": END
        })
        _agent_app_instance = workflow.compile()
    return _agent_app_instance
