import asyncio
from typing import TypedDict, Any
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

async def _run_field_extraction(field, schema, prompt, text, url, llm, request, semaphore):
    """Async helper to execute a single agent task within a concurrency limit."""
    async with semaphore:
        # Check for disconnection before starting the call
        if request and await request.is_disconnected():
            print(f"Task Cancelled: Parallel agent aborted at field '{field}'.")
            return field, None
        
        try:
            chain = prompt | llm.with_structured_output(schema)
            res = await chain.ainvoke({"text": text, "url": url or "Not provided"})
            return field, res.model_dump()
        except Exception:
            return field, None

async def _run_multi_agent_extraction(llm, text: str, url: str, request: Any = None):
    """Parallelized extraction for small models (Multi-Agent mode)."""
    # Concurrency limit (3 concurrent agents) to prevent overwhelming local hardware
    semaphore = asyncio.Semaphore(3)
    results = {}
    
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
        _run_field_extraction(field, schema, prompt, text, url, llm, request, semaphore)
        for field, schema, prompt in metadata_tasks
    ]
    
    results_list = await asyncio.gather(*tasks)
    
    # Merge results from all parallel tasks
    for field, res in results_list:
        if res:
            results.update(res)
        else:
            results[field] = None
            
    return results

async def extract_node(state: AgentState):
    settings = load_app_settings()
    mode = settings.get("extraction_mode", "single")
    llm = get_llm()
    request = state.get("request")
    
    try:
        if mode == "multi":
            results = await _run_multi_agent_extraction(llm, state["text"], state.get("url"), request)
            return {"extracted_data": results, "error": None}
        else:
            # Single-Agent (Default)
            if request and await request.is_disconnected():
                print("Task Cancelled: Single-agent extraction aborted.")
                return {"extracted_data": None, "error": "Cancelled"}
                
            extractor = extraction_prompt | llm.with_structured_output(JobDetails)
            result = await extractor.ainvoke({
                "text": state["text"],
                "url": state.get("url") or "Not provided"
            })
            return {"extracted_data": result.model_dump(), "error": None}
    except Exception as e:
        return {"extracted_data": None, "error": str(e)}

workflow = StateGraph(AgentState)
workflow.add_node("extract", extract_node)
workflow.set_entry_point("extract")
workflow.add_edge("extract", END)

agent_app = workflow.compile()
