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

        # --- Dynamic Context & Truncation Strategy ---
        # Descriptions need much larger context than metadata
        is_description = field == "description"
        max_chars = 24000 if is_description else 8000
        num_ctx = 32768 if is_description else 8192
        
        # Selective truncation for this specific agent's view
        agent_text = text[:max_chars]
        llm = get_llm(num_ctx=num_ctx)

        try:
            # 1. Attempt Structured Extraction (JSON)
            chain = prompt | llm.with_structured_output(schema)
            res = await asyncio.wait_for(
                chain.ainvoke({"text": agent_text, "url": url or "Not provided"}),
                timeout=300
            )
            val = res.model_dump()
            
            # If description came back empty but we have text, trigger raw fallback
            if is_description and not val.get('description'):
                raise ValueError("Structured extraction returned empty description")

            if progress_cb:
                raw_val = list(val.values())[0]
                snippet = str(raw_val)[:40] + ("..." if len(str(raw_val)) > 40 else "")
                await progress_cb({"event": "field_done", "field": field, "msg": f"Found {field.replace('_', ' ')}: {snippet}"})
                
            return field, val

        except (asyncio.TimeoutError, Exception) as e:
            # 2. Raw Fallback for Description (Verbatim retrieval)
            if is_description:
                if progress_cb:
                    await progress_cb({"event": "extracting", "field": "description", "msg": "Structured extraction failed. Retrying with raw verbatim pass..."})
                
                try:
                    # Raw LLM call without structured output wrapping
                    raw_chain = description_extraction_prompt | llm
                    raw_res = await asyncio.wait_for(
                        raw_chain.ainvoke({"text": agent_text}),
                        timeout=180
                    )
                    verbatim_text = raw_res.content
                    return field, {"description": verbatim_text}
                except Exception as fallback_err:
                    print(f"Fallback extraction failed: {fallback_err}")
            
            print(f"Error extracting {field}: {e}")
            return field, None

async def _run_multi_agent_extraction(text: str, url: str, request: Any = None, progress_cb: Callable = None):
    """Parallelized extraction for small models (Multi-Agent mode) with streaming support."""
    # Concurrency limit (Reduced to 2 for improved stability on local hardware)
    semaphore = asyncio.Semaphore(1) # Keep at 1 for multi-agent description stability when using large context
    
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
            # Single-Agent (Default) using large context if available
            llm = get_llm(num_ctx=32768)
            if request and await request.is_disconnected():
                return {"extracted_data": None, "error": "Cancelled"}
                
            if progress_cb:
                await progress_cb({"event": "extracting", "field": "all", "msg": "AI: Extracting all job details (Large Context)..."})

            extractor = extraction_prompt | llm.with_structured_output(JobDetails)
            result = await asyncio.wait_for(
                extractor.ainvoke({
                    "text": state["text"][:24000],
                    "url": state.get("url") or "Not provided"
                }),
                timeout=300
            )
            return {"extracted_data": result.model_dump(), "error": None}
    except asyncio.TimeoutError:
        return {"extracted_data": None, "error": "Extraction timed out. Try smaller snippets or Multi-Agent mode."}
    except Exception as e:
        return {"extracted_data": None, "error": str(e)}

workflow = StateGraph(AgentState)
workflow.add_node("extract", extract_node)
workflow.set_entry_point("extract")
workflow.add_edge("extract", END)

agent_app = workflow.compile()
