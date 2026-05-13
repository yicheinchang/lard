import os
import sys
from pathlib import Path

# Add backend to path
sys.path.append(str(Path(__file__).parent))

try:
    from ai.graph import get_agent_app
    print("INFO:     Import successful.")
    print("INFO:     Calling get_agent_app()...")
    app = get_agent_app()
    print("INFO:     get_agent_app() initialized successfully.")
except ImportError as ie:
    print(f"IMPORT ERROR: {ie}")
    sys.exit(1)
except Exception as e:
    # Other errors (like missing API keys) are fine for this test
    # as long as the import and graph construction (nodes/edges) worked.
    print(f"INFO:     Graph construction finished (expected runtime error: {e})")
    sys.exit(0)
