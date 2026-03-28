from config import settings
from langchain_community.chat_models import ChatOllama
from langchain_core.language_models.chat_models import BaseChatModel

def get_llm() -> BaseChatModel:
    if settings.LLM_PROVIDER == "openai":
        from langchain_community.chat_models import ChatOpenAI
        return ChatOpenAI(api_key=settings.OPENAI_API_KEY, model="gpt-4o-mini")
    elif settings.LLM_PROVIDER == "anthropic":
        from langchain_community.chat_models import ChatAnthropic
        return ChatAnthropic(api_key=settings.ANTHROPIC_API_KEY, model="claude-3-haiku-20240307")
    
    # Default: Ollama
    return ChatOllama(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL,
    )
