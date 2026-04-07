from config import load_app_settings

def agnt_log(agent: str, task: str = None, result: str = None, input_data: str = None):
    """
    Standardized logging for AI agents.
    Format: AGNT:     <AgentName> | <Task/Status> | <Details>
    Multi-line details are indented to maintain grouping.
    """
    prefix = "AGNT:     "
    
    # 1. Prepare Header
    header = f"{agent} | {task or 'INFO'}"
    
    # 2. Prepare Detail
    detail = None
    if input_data:
        detail = str(input_data)
    elif result:
        detail = str(result)
    
    # 3. Print
    if detail and ("\n" in detail or len(header + " | " + detail) > 70):
        # Multi-line or Long content: Header on line 1, Detail indented below
        print(f"{prefix}{header} |")
        for line in detail.split("\n"):
            print(f"    {line}")
    elif detail:
        # Short single-line content
        print(f"{prefix}{header} | {detail}")
    else:
        # Header only
        print(f"{prefix}{header}")

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
