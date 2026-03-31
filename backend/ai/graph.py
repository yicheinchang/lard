import asyncio
from typing import TypedDict, Any, Callable
from langgraph.graph import StateGraph, END
from ai.llm_factory import get_llm
from ai.chains import (
    extraction_prompt, JobDetails,
    JobCompany, JobRole, JobLocation, JobSalary, JobId, 
    PostedDate, DeadlineDate, JobDescription,
    multi_metadata_prompt, description_extraction_prompt
)
from config import load_app_settings

class AgentState(TypedDict):
    text: str
    url: str | None
    extracted_data: dict | None
    error: str | None
    request: Any | None # fastapi.Request
    progress_callback: Callable | None # Async callback for streaming

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
                    timeout=300
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
    
    metadata_tasks = [
        ("company", JobCompany, multi_metadata_prompt),
        ("role", JobRole, multi_metadata_prompt),
        ("location", JobLocation, multi_metadata_prompt),
        ("salary_range", JobSalary, multi_metadata_prompt),
        ("company_job_id", JobId, multi_metadata_prompt),
        ("job_posted_date", PostedDate, multi_metadata_prompt),
        ("application_deadline", DeadlineDate, multi_metadata_prompt),
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

async def extract_node(state: AgentState):
    settings = load_app_settings()
    mode = settings.get("extraction_mode", "single")
    request = state.get("request")
    progress_cb = state.get("progress_callback")
    
    try:
        if mode == "multi":
            results = await _run_multi_agent_extraction(state["text"], state.get("url"), request, progress_cb)
            return {"extracted_data": results, "error": None}
        else:
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
                timeout=300
            )
            return {"extracted_data": result.model_dump(), "error": None}
    except asyncio.TimeoutError:
        return {"extracted_data": None, "error": "Extraction timed out after 5 minutes. Try smaller snippets or Multi-Agent mode."}
    except Exception as e:
        return {"extracted_data": None, "error": str(e)}

workflow = StateGraph(AgentState)
workflow.add_node("extract", extract_node)
workflow.set_entry_point("extract")
workflow.add_edge("extract", END)

agent_app = workflow.compile()
