from langchain_core.language_models.chat_models import BaseChatModel
from config import load_app_settings


def get_llm(provider: str = None, cfg: dict = None, num_ctx: int = None) -> BaseChatModel:
    """Build an LLM instance from the current dynamic app settings or provided config."""
    if provider is None or cfg is None:
        s = load_app_settings()
        provider = provider or s.get("llm_provider", "ollama")
        cfg = cfg or s.get("llm_config", {})

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            api_key=cfg.get("openai_api_key", ""),
            model=cfg.get("openai_model", "gpt-4o-mini"),
        )
    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            api_key=cfg.get("anthropic_api_key", ""),
            model=cfg.get("anthropic_model", "claude-3-haiku-20240307"),
        )

    # Default: Ollama
    from langchain_ollama import ChatOllama
    
    # Dynamic context window adjustment for Ollama
    ollama_kwargs = {
        "base_url": cfg.get("ollama_base_url", "http://host.docker.internal:11434"),
        "model": cfg.get("ollama_model", "gemma3:4b-it-qat"),
        "temperature": 0.0,
    }
    
    # Priority: explicit arg > config > default (none/ollama default)
    context_window = num_ctx or cfg.get("num_ctx")
    if context_window:
        ollama_kwargs["num_ctx"] = int(context_window)
        
    return ChatOllama(**ollama_kwargs)
