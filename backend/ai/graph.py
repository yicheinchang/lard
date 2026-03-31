from typing import TypedDict
from langgraph.graph import StateGraph, END
from ai.llm_factory import get_llm
from ai.chains import extraction_prompt, JobDetails

class AgentState(TypedDict):
    text: str
    url: str | None
    extracted_data: dict | None
    error: str | None

def extract_node(state: AgentState):
    llm = get_llm()
    try:
        extractor = extraction_prompt | llm.with_structured_output(JobDetails)
        result = extractor.invoke({
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
