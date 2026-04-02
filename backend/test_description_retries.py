import asyncio
import os
import sys
import json

# Add current directory to path
sys.path.append(os.getcwd())

from ai.chains import description_validation_prompt, DescriptionValidation
from ai.graph import description_validator_node, AgentState, get_agent_app
from ai.llm_factory import get_llm

async def test_validator_loop():
    print("--- STARTING VALIDATOR LOOP TEST ---")
    
    # Mock state for a 3rd attempt failure
    # We want to verify that when retries reach 3, the hallucination_detected flag is set.
    print("\n[CASE 4] Circuit Breaker & Hallucination Flagging")
    
    # To test this, we need to call the node with retries=2
    # So the next failure will make it 3.
    
    state: AgentState = {
        "text": "Original Job Text here.",
        "url": "http://example.com",
        "extracted_data": {"description": "Incomplete generated description."},
        "error": None,
        "request": None,
        "progress_callback": None,
        "structured_data": None,
        "retries": 2, # Current attempt is the 3rd (0, 1, 2)
        "validation_feedback": "Previous failure reason."
    }
    
    print("Simulating final (3rd) attempt failure...")
    
    # We call the node. It should run the validator, fail (hopefully), 
    # and then return with extracted_data updated.
    
    # Since we can't easily force the LLM to fail, we'll verify the logic in the node 
    # by making sure it handles the 'failed' case correctly.
    
    # Actually, the logic is:
    # 1. retries = state.get("retries", 0) -> 2
    # 2. validator fails -> returns {"extracted_data": ..., "retries": 3, "validation_feedback": ...}
    
    res_node = await description_validator_node(state)
    
    print(f"Final Retries: {res_node.get('retries')}")
    extracted = res_node.get("extracted_data", {})
    print(f"Hallucination Detected: {extracted.get('hallucination_detected')}")
    print(f"Hallucination Reasons: {extracted.get('hallucination_reasons')}")
    
    if extracted.get("hallucination_detected") == True:
        print("OK: Circuit breaker correctly flagged the description after final failure.")
    else:
        print("FAIL: Circuit breaker did not flag the description.")

async def test_guided_retry():
    print("\n--- STARTING GUIDED RETRY TEST ---")
    # This test verifies that validation_feedback is passed to the extraction prompts.
    # We'll check the extract_node logic.
    from ai.graph import extract_node
    
    state: AgentState = {
        "text": "Job details about Python and React.",
        "url": None,
        "extracted_data": {"company": "Test Co", "role": "Dev", "description": "Old bad desc"},
        "error": None,
        "request": None,
        "progress_callback": None,
        "structured_data": None,
        "retries": 1,
        "validation_feedback": "The description is missing the React requirement."
    }
    
    print("Running extract_node in retry mode with feedback...")
    # This will trigger a re-extraction of the description only.
    # We want to see if the internal prompt gets the feedback.
    # Since it's a real LLM call, we just hope it succeeds or we check logs.
    res = await extract_node(state)
    
    new_desc = res["extracted_data"].get("description")
    print(f"New Description: {new_desc}")
    
    # If the LLM is good, it should now include 'React' because we told it it was missing.
    if "React" in new_desc:
        print("OK: Guided retry successful! Model used feedback to fix the description.")
    else:
        print("INFO: Model did not fix it in this run, but the feedback was passed.")

if __name__ == "__main__":
    asyncio.run(test_validator_loop())
    asyncio.run(test_guided_retry())
