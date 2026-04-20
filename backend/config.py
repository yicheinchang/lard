import json
import os
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from ai.prompts import DEFAULT_SYSTEM_PROMPTS

# Setup logger for config
logger = logging.getLogger("config")

# ── Settings Class (Env & Base Defaults) ──────────────────────────────

class Settings(BaseSettings):
    """
    Application Settings managed via Environment Variables.
    Priority: Environment Variables (LARD_*) > .env file > Defaults.
    """
    model_config = SettingsConfigDict(
        env_prefix="LARD_",
        env_file=".env",
        extra="ignore"
    )

    # ── Path Management ──
    # Base data directory
    DATA_DIR: str = Field(default="")
    
    # Subdirectories (Defaults calculate relative to DATA_DIR later)
    # We use Optional[str] to allow full overrides via environment
    DB_DIR: str | None = None
    UPLOADS_DIR: str | None = None
    CHROMA_DIR: str | None = None
    HF_HOME: str | None = None
    TMP_DIR: str | None = None

    # ── AI Providers (Env Defaults) ──
    LLM_PROVIDER: str = "ollama"
    OLLAMA_BASE_URL: str = "http://host.docker.internal:11434"
    OLLAMA_MODEL: str = "gemma3:4b-it-qat"
    OPENAI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None
    
    # Legacy support (overridden if DATABASE_URL env is set)
    DATABASE_URL: str | None = None

    def initialize_paths(self):
        """Calculate final paths and ensure directories exist."""
        # 1. Determine base DATA_DIR
        if not self.DATA_DIR:
            # Fallback to Docker path or local path
            if os.environ.get("RUNNING_IN_DOCKER") == "true":
                self.DATA_DIR = "/app/data"
            else:
                self.DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
        
        # 2. Derive subdirectories if not explicitly overridden via env
        self.DB_DIR = self.DB_DIR or os.path.join(self.DATA_DIR, "db")
        self.UPLOADS_DIR = self.UPLOADS_DIR or os.path.join(self.DATA_DIR, "uploads")
        self.CHROMA_DIR = self.CHROMA_DIR or os.path.join(self.DATA_DIR, "chroma_db")
        self.HF_HOME = self.HF_HOME or os.path.join(self.DATA_DIR, "huggingface")
        self.TMP_DIR = self.TMP_DIR or os.path.join(self.DATA_DIR, "tmp")
        
        # 3. Handle Database URL
        if not self.DATABASE_URL:
            self.DATABASE_URL = f"sqlite:///{os.path.join(self.DB_DIR, 'tracker.db')}"

        # 4. Export AI Cache paths to environment so libraries pick them up
        os.environ["HF_HOME"] = self.HF_HOME
        
        # 5. Create directories
        for d in [self.DATA_DIR, self.DB_DIR, self.UPLOADS_DIR, self.CHROMA_DIR, self.HF_HOME, self.TMP_DIR]:
            try:
                os.makedirs(d, exist_ok=True)
                print(f"INFO:     Directory verified/created: {d}")
            except Exception as e:
                print(f"ERROR:    Failed to create directory {d}: {e}")

# Create global instance and initialize
settings = Settings()
settings.initialize_paths()

# ── Dynamic app settings (persisted to JSON file) ──────────────────────

APP_SETTINGS_PATH = os.path.join(settings.DATA_DIR, "app_settings.json")
UPLOADS_DIR = settings.UPLOADS_DIR # Helper for main.py
CHROMA_DIR = settings.CHROMA_DIR   # Helper for vector_store.py

DEFAULT_APP_SETTINGS = {
    "theme": "dark",
    "ai_enabled": True,
    "debug_mode": True,
    "llm_provider": settings.LLM_PROVIDER,
    "llm_config": {
        "ollama_base_url": settings.OLLAMA_BASE_URL,
        "ollama_model": settings.OLLAMA_MODEL,
        "openai_api_key": settings.OPENAI_API_KEY or "",
        "openai_model": "gpt-4o-mini",
        "anthropic_api_key": settings.ANTHROPIC_API_KEY or "",
        "anthropic_model": "claude-3-haiku-20240307",
        "num_ctx": 8192,
    },
    "embedding_provider": "default",
    "embedding_config": {
        "ollama_base_url": settings.OLLAMA_BASE_URL,
        "ollama_model": "nomic-embed-text",
        "openai_api_key": settings.OPENAI_API_KEY or "",
        "openai_model": "text-embedding-3-small",
    },
    "extraction_mode": "single",
    "max_concurrency": 2,
    "custom_prompts": {
        "single_agent": "",
        "multi_agent": {
            "company": "", "role": "", "location": "", "salary_range": "",
            "job_posted_date": "", "application_deadline": "", "description": ""
        },
        "job_post_check": "", "qa_json": "", "qa_text": ""
    },
    "system_prompts": {
        "extraction_base": DEFAULT_SYSTEM_PROMPTS["extraction_base"],
        "extraction_description": DEFAULT_SYSTEM_PROMPTS["extraction_description"],
        "json_ld": DEFAULT_SYSTEM_PROMPTS["json_ld"],
        "qa_validator": DEFAULT_SYSTEM_PROMPTS["qa_validator"],
        "field_company": DEFAULT_SYSTEM_PROMPTS["field_company"],
        "field_role": DEFAULT_SYSTEM_PROMPTS["field_role"],
        "field_location": DEFAULT_SYSTEM_PROMPTS["field_location"],
        "field_salary": DEFAULT_SYSTEM_PROMPTS["field_salary"],
        "field_id": DEFAULT_SYSTEM_PROMPTS["field_id"],
        "field_posted": DEFAULT_SYSTEM_PROMPTS["field_posted"],
        "field_deadline": DEFAULT_SYSTEM_PROMPTS["field_deadline"],
        "json_company": DEFAULT_SYSTEM_PROMPTS["json_company"],
        "json_role": DEFAULT_SYSTEM_PROMPTS["json_role"],
        "json_location": DEFAULT_SYSTEM_PROMPTS["json_location"],
        "json_salary": DEFAULT_SYSTEM_PROMPTS["json_salary"],
        "json_id": DEFAULT_SYSTEM_PROMPTS["json_id"],
        "json_posted": DEFAULT_SYSTEM_PROMPTS["json_posted"],
        "json_deadline": DEFAULT_SYSTEM_PROMPTS["json_deadline"],
        "json_description": DEFAULT_SYSTEM_PROMPTS["json_description"],
        "job_post_check": DEFAULT_SYSTEM_PROMPTS["job_post_check"],
        "qa_validator_json": DEFAULT_SYSTEM_PROMPTS["qa_validator_json"],
        "qa_validator_text": DEFAULT_SYSTEM_PROMPTS["qa_validator_text"]
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
