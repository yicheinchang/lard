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

async def _run_field_extraction(field, schema, prompt, text, url, request, semaphore, progress_cb=None):
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
                # Raw LLM call without structured output wrapping
                raw_chain = prompt | llm
                raw_res = await asyncio.wait_for(
                    raw_chain.ainvoke({"text": text}),
                    timeout=600
                )
                verbatim_text = raw_res.content
                
                if progress_cb:
                    snippet = str(verbatim_text)[:40] + ("..." if len(str(verbatim_text)) > 40 else "")
                    await progress_cb({"event": "field_done", "field": field, "msg": f"Captured Description: {snippet}"})
                
                return field, {"description": verbatim_text}

            # STANDARD CASE: Metadata (Structured JSON)
            # Multi-agent metadata fields are small and benefit from JSON schema enforcement.
            chain = prompt | llm.with_structured_output(schema)
            res = await asyncio.wait_for(
                chain.ainvoke({"text": text, "url": url or "Not provided"}),
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

async def _run_multi_agent_extraction(text: str, url: str, request: Any = None, progress_cb: Callable = None):
    """Parallelized extraction for small models (Multi-Agent mode) with streaming support."""
    # Concurrency limit (Keep at 1 for stability when processing large descriptions on local LLM)
    semaphore = asyncio.Semaphore(1)
    
    from ai.chains import (
        JobCompany, JobRole, JobLocation, JobSalary, JobId, 
        PostedDate, DeadlineDate, JobDescription,
        company_prompt, role_prompt, location_prompt, salary_prompt,
        job_id_prompt, posted_date_prompt, deadline_date_prompt,
        description_extraction_prompt
    )
    metadata_tasks = [
        ("company", JobCompany, company_prompt),
        ("role", JobRole, role_prompt),
        ("location", JobLocation, location_prompt),
        ("salary_range", JobSalary, salary_prompt),
        ("company_job_id", JobId, job_id_prompt),
        ("job_posted_date", PostedDate, posted_date_prompt),
        ("application_deadline", DeadlineDate, deadline_date_prompt),
        ("description", JobDescription, description_extraction_prompt),
    ]
    
    # Launch all tasks concurrently
    tasks = [
        _run_field_extraction(field, schema, prompt, text, url, request, semaphore, progress_cb)
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

async def _run_field_json_extraction(field, schema, prompt, text, fragment, request, semaphore, progress_cb=None):
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
                raw_chain = prompt | llm
                raw_res = await asyncio.wait_for(raw_chain.ainvoke({"json_fragment": json.dumps(fragment, indent=2)}), timeout=600)
                val = raw_res.content
                if progress_cb:
                    await progress_cb({"event": "field_done", "field": field, "msg": f"Captured Description (JSON)"})
                return field, {"description": val}

            chain = prompt | llm.with_structured_output(schema)
            res = await asyncio.wait_for(chain.ainvoke({"json_fragment": json.dumps(fragment, indent=2)}), timeout=300)
            val = res.model_dump()

            if progress_cb:
                await progress_cb({"event": "field_done", "field": field, "msg": f"Parsed {field} from JSON"})
            return field, val
        except Exception as e:
            print(f"Error extracting JSON {field}: {e}")
            return field, None

async def _run_multi_agent_json_extraction(structured_data: dict, text: str, request: Any = None, progress_cb: Callable = None):
    semaphore = asyncio.Semaphore(1)
    from ai.chains import (
        JobCompany, JobRole, JobLocation, JobSalary, JobId, 
        PostedDate, DeadlineDate, JobDescription,
        company_json_prompt, role_json_prompt, location_json_prompt, salary_json_prompt,
        job_id_json_prompt, posted_date_json_prompt, deadline_date_json_prompt,
        description_json_prompt
    )
    
    metadata_tasks = [
        ("company", JobCompany, company_json_prompt, structured_data.get("hiringOrganization")),
        ("role", JobRole, role_json_prompt, structured_data.get("title")),
        ("location", JobLocation, location_json_prompt, structured_data.get("jobLocation")),
        ("salary_range", JobSalary, salary_json_prompt, structured_data.get("baseSalary")),
        ("company_job_id", JobId, job_id_json_prompt, structured_data.get("identifier") or structured_data.get("url")),
        ("job_posted_date", PostedDate, posted_date_json_prompt, structured_data.get("datePosted")),
        ("application_deadline", DeadlineDate, deadline_date_json_prompt, structured_data.get("validThrough")),
        ("description", JobDescription, description_json_prompt, structured_data.get("description")),
    ]
    
    tasks = [
        _run_field_json_extraction(field, schema, prompt, text, fragment, request, semaphore, progress_cb)
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
    
    try:
        from ai.chains import (
            extraction_prompt, JobDetails,
            description_extraction_prompt, structured_data_validation_prompt
        )
        if state.get("structured_data"):
            # --- PATH A: JSON-LD Structured Data found ---
            if mode == "multi":
                if progress_cb:
                    await progress_cb({"event": "progress", "msg": "AI: JSON-LD found! Using Multi-Agent JSON extraction..."})
                results = await _run_multi_agent_json_extraction(state["structured_data"], state["text"], request, progress_cb)
                return {"extracted_data": results, "error": None}
            else:
                if progress_cb:
                    await progress_cb({"event": "progress", "msg": "AI: JSON-LD found! Validating and converting description..."})
                
                # Use Single-Agent logic with the validation prompt
                llm = get_llm(num_ctx=8190)
                chain = structured_data_validation_prompt | llm.with_structured_output(JobDetails)
                import json
                import asyncio
                result = await asyncio.wait_for(
                    chain.ainvoke({"json_ld_data": json.dumps(state["structured_data"], indent=2)}),
                    timeout=600
                )
                return {"extracted_data": result.model_dump(), "error": None}

        if mode == "multi":
            results = await _run_multi_agent_extraction(state["text"], state.get("url"), request, progress_cb)
            return {"extracted_data": results, "error": None}
        else:
            import asyncio
            # Single-Agent (Default) using fixed 8190 context
            llm = get_llm(num_ctx=8190)
            if request and await request.is_disconnected():
                return {"extracted_data": None, "error": "Cancelled"}
                
            if progress_cb:
                await progress_cb({"event": "extracting", "field": "all", "msg": "AI: Extracting all job details (Fixed Context)..."})

            extractor = extraction_prompt | llm.with_structured_output(JobDetails)
            result = await asyncio.wait_for(
                extractor.ainvoke({
                    "text": state["text"],
                    "url": state.get("url") or "Not provided"
                }),
                timeout=600
            )
            return {"extracted_data": result.model_dump(), "error": None}
    except asyncio.TimeoutError:
        return {"extracted_data": None, "error": "Extraction timed out after 5 minutes. Try smaller snippets or Multi-Agent mode."}
    except Exception as e:
        return {"extracted_data": None, "error": str(e)}

_agent_app_instance = None

def get_agent_app():
    global _agent_app_instance
    if _agent_app_instance is None:
        from langgraph.graph import StateGraph, END
        workflow = StateGraph(AgentState)
        workflow.add_node("extract", extract_node)
        workflow.set_entry_point("extract")
        workflow.add_edge("extract", END)
        _agent_app_instance = workflow.compile()
    return _agent_app_instance
