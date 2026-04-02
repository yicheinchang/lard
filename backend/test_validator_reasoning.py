import asyncio
import os
import sys
import json

# Add current directory to path
sys.path.append(os.getcwd())

from ai.chains import description_validation_prompt, DescriptionValidation
from ai.llm_factory import get_llm

async def debug_validator():
    print("--- DEBUGGING VALIDATOR REASONING ---")
    llm = get_llm(num_ctx=8190)
    
    # We want to see what happens when it fails
    validator = description_validation_prompt | llm.with_structured_output(DescriptionValidation)
    
    # CASE: J&J tricky HTML (JSON-LD)
    source_type = "JSON-LD"
    # The actual HTML from J&J (snippet part)
    raw_source = "for data integrity, reproducibility, and engineering.</p></li></ul><ul><li><p>Communicate the approach and findings effectively to diverse collaborators and stakeholders through internal/external reports, presentations and publications. Enhance the organization’s Omics data foundation and technical capabilities."
    
    # Scenario: Truncated description
    generated = "for data integrity, reproducibility, and engineering."
    
    print(f"\n[INPUT] Source Type: {source_type}")
    print(f"[INPUT] Source Text (HTML): {raw_source}")
    print(f"[INPUT] Generated (Markdown): {generated}")
    
    try:
        # 1. Run with structured output
        print("\n--- Running with Structured Output ---")
        res = await validator.ainvoke({
            "source_type": source_type,
            "source_text": raw_source,
            "generated_description": generated
        })
        print(f"Result JSON: {res.model_dump_json(indent=2)}")
        
        # 2. Run raw to see what it actually outputs in text
        print("\n--- Running Raw (Non-Structured) to see reasoning ---")
        raw_chain = description_validation_prompt | llm
        raw_res = await raw_chain.ainvoke({
            "source_type": source_type,
            "source_text": raw_source,
            "generated_description": generated
        })
        print(f"Raw Output Content:\n{raw_res.content}")
        
    except Exception as e:
        print(f"Error during debugging: {e}")

if __name__ == "__main__":
    asyncio.run(debug_validator())
