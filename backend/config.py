import json
import os
from pydantic_settings import BaseSettings
from ai.chains import DEFAULT_SYSTEM_PROMPTS

class Settings(BaseSettings):
    """Env-var based settings — used as fallback defaults for app_settings.json."""
    LLM_PROVIDER: str = "ollama"
    OLLAMA_BASE_URL: str = "http://host.docker.internal:11434"
    OLLAMA_MODEL: str = "gemma3:4b-it-qat"
    OPENAI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None
    DATABASE_URL: str = "sqlite:///./tracker.db"

    class Config:
        env_file = ".env"

settings = Settings()

# ── Dynamic app settings (persisted to JSON file) ──────────────────────

APP_SETTINGS_PATH = os.path.join(os.path.dirname(__file__), "app_settings.json")

DEFAULT_APP_SETTINGS = {
    "theme": "dark",
    "ai_enabled": True,
    "llm_provider": settings.LLM_PROVIDER,
    "llm_config": {
        "ollama_base_url": settings.OLLAMA_BASE_URL,
        "ollama_model": settings.OLLAMA_MODEL,
        "openai_api_key": settings.OPENAI_API_KEY or "",
        "openai_model": "gpt-4o-mini",
        "anthropic_api_key": settings.ANTHROPIC_API_KEY or "",
        "anthropic_model": "claude-3-haiku-20240307",
    },
    "embedding_provider": "default",  # "default" | "ollama" | "openai"
    "embedding_config": {
        "ollama_base_url": settings.OLLAMA_BASE_URL,
        "ollama_model": "nomic-embed-text",
        "openai_api_key": settings.OPENAI_API_KEY or "",
        "openai_model": "text-embedding-3-small",
    },
    "extraction_mode": "single",
    "custom_prompts": {
        "single_agent": "",
        "multi_agent": {
            "company": "",
            "role": "",
            "location": "",
            "salary_range": "",
            "job_posted_date": "",
            "application_deadline": "",
            "description": ""
        }
    },
    "system_prompts": {
        "extraction_base": DEFAULT_SYSTEM_PROMPTS["extraction_base"],
        "extraction_description": DEFAULT_SYSTEM_PROMPTS["extraction_description"],
        "json_ld": DEFAULT_SYSTEM_PROMPTS["json_ld"],
        "qa_validator": DEFAULT_SYSTEM_PROMPTS["qa_validator"],
        # Multi-Agent Fields (Text)
        "field_company": DEFAULT_SYSTEM_PROMPTS["field_company"],
        "field_role": DEFAULT_SYSTEM_PROMPTS["field_role"],
        "field_location": DEFAULT_SYSTEM_PROMPTS["field_location"],
        "field_salary": DEFAULT_SYSTEM_PROMPTS["field_salary"],
        "field_id": DEFAULT_SYSTEM_PROMPTS["field_id"],
        "field_posted": DEFAULT_SYSTEM_PROMPTS["field_posted"],
        "field_deadline": DEFAULT_SYSTEM_PROMPTS["field_deadline"],
        # Multi-Agent Fields (JSON)
        "json_company": DEFAULT_SYSTEM_PROMPTS["json_company"],
        "json_role": DEFAULT_SYSTEM_PROMPTS["json_role"],
        "json_location": DEFAULT_SYSTEM_PROMPTS["json_location"],
        "json_salary": DEFAULT_SYSTEM_PROMPTS["json_salary"],
        "json_id": DEFAULT_SYSTEM_PROMPTS["json_id"],
        "json_posted": DEFAULT_SYSTEM_PROMPTS["json_posted"],
        "json_deadline": DEFAULT_SYSTEM_PROMPTS["json_deadline"]
    }
}


def _deep_merge(base: dict, overrides: dict) -> dict:
    """Recursively merge *overrides* into *base*, returning a new dict."""
    merged = base.copy()
    for key, value in overrides.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def load_app_settings() -> dict:
    """Load settings from disk, falling back to defaults for missing keys."""
    if os.path.exists(APP_SETTINGS_PATH):
        try:
            with open(APP_SETTINGS_PATH, "r") as f:
                stored = json.load(f)
            return _deep_merge(DEFAULT_APP_SETTINGS, stored)
        except (json.JSONDecodeError, IOError):
            pass
    return DEFAULT_APP_SETTINGS.copy()


def save_app_settings(data: dict) -> dict:
    """Merge *data* into current settings and persist to disk."""
    current = load_app_settings()
    merged = _deep_merge(current, data)
    with open(APP_SETTINGS_PATH, "w") as f:
        json.dump(merged, f, indent=2)
    return merged
