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

async def _run_multi_agent_extraction(llm, text: str, url: str, request: Any = None):
    """Sequential extraction for small models (Multi-Agent mode)."""
    results = {}
    
    # Metadata Agents (Sequential)
    metadata_tasks = [
        ("company", JobCompany),
        ("role", JobRole),
        ("location", JobLocation),
        ("salary_range", JobSalary),
        ("company_job_id", JobId),
        ("job_posted_date", PostedDate),
        ("application_deadline", DeadlineDate),
    ]
    
    for field, schema in metadata_tasks:
        # Check for client disconnection before each agent call
        if request and await request.is_disconnected():
            print(f"Task Cancelled: Multi-agent extraction aborted at field '{field}'.")
            return results
            
        try:
            # Use ainvoke for async compatibility and better cancellation support
            chain = multi_metadata_prompt | llm.with_structured_output(schema)
            res = await chain.ainvoke({"text": text, "url": url or "Not provided"})
            results.update(res.model_dump())
        except Exception:
            results[field] = None

    # Description Agent (Separate Prompt)
    if request and await request.is_disconnected():
        print("Task Cancelled: Multi-agent extraction aborted before description.")
        return results

    try:
        desc_chain = description_extraction_prompt | llm.with_structured_output(JobDescription)
        desc_res = await desc_chain.ainvoke({"text": text})
        results.update(desc_res.model_dump())
    except Exception:
        results["description"] = None
        
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
