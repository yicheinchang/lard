import os
import json
import uuid
from datetime import datetime
from copy import deepcopy
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import BaseMessage
from langchain_core.outputs import LLMResult

from config import settings
from .logger import agnt_log

class DebugLLMCallbackHandler(BaseCallbackHandler):
    """
    A custom callback handler that logs the exact exact raw prompt and LLM response 
    to individual files in the tmp directory when debug_mode is enabled.
    """

    def on_chat_model_start(self, serialized: dict, messages: list[list[BaseMessage]], **kwargs):
        """Called when a chat model starts running."""
        try:
            # Generate a unique invocation tag based on tags or a random UUID
            tags = kwargs.get("tags", [])
            tag_str = tags[0] if tags else "unknown_agent"
            run_id = str(kwargs.get("run_id", uuid.uuid4()))[:8]
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"debug_llm_call_{timestamp}_{tag_str}_{run_id}.txt"
            filepath = os.path.join(settings.TMP_DIR, filename)

            with open(filepath, "w", encoding="utf-8") as f:
                f.write(f"=== LLM CALL START: {timestamp} ===\n")
                f.write(f"Tags: {tags}\n")
                
                # Try to log kwargs (which includes tools / json_schema if any are bound)
                clean_kwargs = deepcopy(kwargs)
                # Remove un-serializable objects or massive lists if needed
                if "invocation_params" in clean_kwargs:
                    f.write("\n--- Invocation Params ---\n")
                    f.write(json.dumps(clean_kwargs["invocation_params"], indent=2, default=str))
                
                f.write("\n\n--- MESSAGES ---\n")
                for i, msg_list in enumerate(messages):
                    for j, msg in enumerate(msg_list):
                        f.write(f"\n[Message {i}.{j} | Role: {msg.type}]\n")
                        f.write(str(msg.content))
                        if msg.additional_kwargs:
                            f.write("\n[Additional Kwargs]\n")
                            f.write(json.dumps(msg.additional_kwargs, indent=2, default=str))
                
                f.write("\n\n=== WAITING FOR RESPONSE ===\n")
            
            # Store filepath in the run cache to append to it later in on_llm_end
            if not hasattr(self, 'run_files'):
                self.run_files = {}
            self.run_files[kwargs.get("run_id")] = filepath
            
            agnt_log("Debug", task=f"LLM Call Started -> {filename}")

        except Exception as e:
            print(f"Debug Callback Error (on_chat_model_start): {e}")


    def on_llm_end(self, response: LLMResult, **kwargs):
        """Called when LLM finishes running."""
        try:
            run_id = kwargs.get("run_id")
            if not hasattr(self, 'run_files') or run_id not in self.run_files:
                return

            filepath = self.run_files[run_id]
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

            with open(filepath, "a", encoding="utf-8") as f:
                f.write(f"\n\n=== LLM CALL END: {timestamp} ===\n")
                f.write("\n--- RAW RESPONSE(S) ---\n")
                for i, generation_list in enumerate(response.generations):
                    for j, gen in enumerate(generation_list):
                        f.write(f"\n[Generation {i}.{j}]\n")
                        f.write(str(gen.text))
                        if hasattr(gen, 'message') and gen.message.additional_kwargs:
                            f.write("\n[Message Additional Kwargs / Tool Calls]\n")
                            f.write(json.dumps(gen.message.additional_kwargs, indent=2, default=str))

            del self.run_files[run_id]

        except Exception as e:
            print(f"Debug Callback Error (on_llm_end): {e}")

    def on_llm_error(self, error: Exception | KeyboardInterrupt, **kwargs):
        """Called when LLM errors."""
        try:
            run_id = kwargs.get("run_id")
            if not hasattr(self, 'run_files') or run_id not in self.run_files:
                return
            
            filepath = self.run_files[run_id]
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            with open(filepath, "a", encoding="utf-8") as f:
                f.write(f"\n\n=== LLM CALL ERROR: {timestamp} ===\n")
                f.write(str(error))
                
            del self.run_files[run_id]
        except Exception:
            pass
