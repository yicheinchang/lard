from config import load_app_settings

def agnt_log(agent: str, task: str = None, result: str = None, input_data: str = None):
    """
    Standardized logging for AI agents.
    Format: AGNT:     <AgentName> | <Task/Status> | <Details>
    Max 80 characters.
    """
    prefix = "AGNT:     "
    
    if input_data:
        # Task calling case: <Agent> | <Task> | <Input>
        msg = f"{agent} | {task or 'CALL'} | {str(input_data).replace('\n', ' ')}"
    elif result:
        # Finish case: <Agent> | DONE | <Result>
        msg = f"{agent} | DONE | {str(result).replace('\n', ' ')}"
    elif task:
        # Generic status: <Agent> | <Status>
        msg = f"{agent} | {task}"
    else:
        return

    full_msg = f"{prefix}{msg}"
    if len(full_msg) > 80:
        full_msg = full_msg[:77] + "..."
    
    print(full_msg)

def log_llm_info():
    """
    Retrieves and logs the current LLM provider and model configuration.
    Used to show provider info once before a series of agent calls.
    """
    try:
        settings = load_app_settings()
        provider = settings.get("llm_provider", "ollama")
        cfg = settings.get("llm_config", {})
        
        if provider == "openai":
            model = cfg.get("openai_model", "gpt-4o")
        elif provider == "anthropic":
            model = cfg.get("anthropic_model", "claude-3")
        else:
            model = cfg.get("ollama_model", "gemma3:4b-it-qat")
            
        agnt_log("System", task=f"Using {provider.title()} model: {model}")
    except Exception:
        # Fail silently to avoid breaking the main flow
        pass
