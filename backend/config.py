from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    LLM_PROVIDER: str = "ollama" # ollama, openai, anthropic
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "gemma3:4b-it-qat"
    OPENAI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None
    DATABASE_URL: str = "sqlite:///./tracker.db"

    class Config:
        env_file = ".env"

settings = Settings()
