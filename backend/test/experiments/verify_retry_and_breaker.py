import sys
import os
import re

# Add backend to path
sys.path.append(os.getcwd())

def verify_code():
    print("[1/1] Verifying graph.py changes...")
    file_path = "backend/ai/graph.py"
    with open(file_path, "r") as f:
        content = f.read()

    # 1. Verify retries + 1 removal from dictionaries
    # Look for any returned dict with "retries": retries + 1
    leaks = re.findall(r'"retries":\s*retries\s*\+\s*1', content)
    if leaks:
        print(f"❌ FAILURE: Found {len(leaks)} occurrences of '\"retries\": retries + 1' returned in dictionary updates. They must be '\"retries\": 1'.")
        return False
    print("✅ SUCCESS: No direct '\"retries\": retries + 1' updates found in state dicts.")

    # 2. Verify HTML leakage final retry handler
    # Check if we have if retries >= 2 block in HTML leakage
    if 'extracted["hallucination_detected"] = True' in content and 'HTML Leakage (Final)' in content:
        print("✅ SUCCESS: HTML Leakage final retry handler is present.")
    else:
        print("❌ FAILURE: HTML Leakage final retry handler is missing.")
        return False

    # 3. Verify final retry handler in exception blocks
    if 'QA Error (Final)' in content:
        print("✅ SUCCESS: Exception blocks final retry handler is present.")
    else:
        print("❌ FAILURE: Exception blocks final retry handler is missing.")
        return False

    # 4. Verify no syntax errors in graph.py
    try:
        import ast
        ast.parse(content)
        print("✅ SUCCESS: graph.py parsed successfully without any syntax errors.")
    except Exception as e:
        print(f"❌ FAILURE: graph.py has syntax errors: {e}")
        return False

    return True

def main():
    if verify_code():
        print("\n🎉 Verification passed successfully! All Skip-a-Retry and Circuit Breaker changes are structurally correct.")
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
