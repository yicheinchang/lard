import asyncio
import os
import sys

# Add current directory to path so we can import ai modules
sys.path.append(os.getcwd())

from ai.chains import description_validation_prompt, DescriptionValidation
from ai.graph import description_validator_node, AgentState
from ai.llm_factory import get_llm

async def test_validator():
    print("--- STARTING VALIDATOR TEST ---")
    llm = get_llm(num_ctx=8190)
    validator = description_validation_prompt | llm.with_structured_output(DescriptionValidation)
    
    # CASE 1: Incomplete Description (TEXT)
    print("\n[CASE 1] Incomplete Description (TEXT)")
    raw_source = """
    Responsibilities:
    1. Develop omics pipelines.
    2. Collaborate with stakeholders.
    3. Enhance data foundation.
    """
    generated = """
    Responsibilities:
    * Develop omics pipelines.
    * Collaborate with stakeholders.
    """ # Missing the last item "3. Enhance data foundation."
    
    try:
        res = await validator.ainvoke({
            "source_type": "TEXT",
            "source_text": raw_source,
            "generated_description": generated
        })
        print(f"Result: is_valid={res.is_valid}, is_complete={res.is_complete}")
        print(f"Reason: {res.failure_reason}")
        if not res.is_complete:
            print("OK: Validator correctly identified INCOMPLETE description.")
        else:
            print("FAIL: Validator failed to catch missing item in TEXT mode.")
    except Exception as e:
        print(f"Error during Case 1: {e}")

    # CASE 2: J&J tricky HTML (JSON-LD)
    print("\n[CASE 2] J&J tricky HTML (JSON-LD)")
    # The snippet user provided
    json_ld_source = "for data integrity, reproducibility, and engineering.</p></li></ul><ul><li><p>Communicate the approach and findings effectively to diverse collaborators and stakeholders through internal/external reports, presentations and publications. Enhance the organization’s Omics data foundation and technical capabilities."
    
    # Scenario: LLM misses the second part after the </ul><ul> transition
    generated_missing = "for data integrity, reproducibility, and engineering."
    
    try:
        res_jj = await validator.ainvoke({
            "source_type": "JSON-LD",
            "source_text": json_ld_source,
            "generated_description": generated_missing
        })
        print(f"Result: is_valid={res_jj.is_valid}, is_complete={res_jj.is_complete}")
        print(f"Reason: {res_jj.failure_reason}")
        if not res_jj.is_complete:
            print("OK: Validator correctly identified truncation in JSON-LD mode.")
        else:
            print("FAIL: Validator failed to catch missing item in JSON-LD mode.")
    except Exception as e:
        print(f"Error during Case 2: {e}")

    # CASE 3: Full Description (Success Path)
    print("\n[CASE 3] Full Description (Success Path)")
    generated_full = "for data integrity, reproducibility, and engineering. Communicate the approach and findings effectively to diverse collaborators and stakeholders through internal/external reports, presentations and publications. Enhance the organization’s Omics data foundation and technical capabilities."
    
    try:
        res_full = await validator.ainvoke({
            "source_type": "JSON-LD",
            "source_text": json_ld_source,
            "generated_description": generated_full
        })
        print(f"Result: is_valid={res_full.is_valid}, is_complete={res_full.is_complete}")
        if res_full.is_complete:
            print("OK: Validator correctly passed complete description.")
        else:
            print(f"FAIL: Validator incorrectly rejected complete description. Reason: {res_full.failure_reason}")
    except Exception as e:
        print(f"Error during Case 3: {e}")

if __name__ == "__main__":
    asyncio.run(test_validator())
