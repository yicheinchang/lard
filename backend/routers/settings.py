from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
import httpx
from pydantic import BaseModel
from typing import Optional
from config import load_app_settings, save_app_settings

router = APIRouter(prefix="/api/settings", tags=["Settings"])


@router.get("")
def get_settings():
    """Return current app settings."""
    data = load_app_settings()
    # Mask sensitive keys for the frontend
    safe = _mask_secrets(data)
    return safe


@router.get("/default-prompts")
def get_default_prompts():
    """Return the hardcoded factory default system prompts."""
    from ai.prompts import DEFAULT_SYSTEM_PROMPTS
    return DEFAULT_SYSTEM_PROMPTS


class SettingsUpdate(BaseModel):
    theme: Optional[str] = None
    ai_enabled: Optional[bool] = None
    debug_mode: Optional[bool] = None
    llm_provider: Optional[str] = None
    llm_config: Optional[dict] = None
    embedding_provider: Optional[str] = None
    embedding_config: Optional[dict] = None
    extraction_mode: Optional[str] = None
    max_concurrency: Optional[int] = None
    custom_prompts: Optional[dict] = None
    system_prompts: Optional[dict] = None


class TestConfigPayload(BaseModel):
    provider: str
    config: dict


@router.put("")
def update_settings(payload: SettingsUpdate):
    """Partially update app settings."""
    update_data = payload.model_dump(exclude_none=True)
    merged = save_app_settings(update_data)
    return _mask_secrets(merged)


@router.post("/rebuild-vectors")
def rebuild_vectors(background_tasks: BackgroundTasks):
    """Trigger a full vector database rebuild with the current embedding config."""
    from database.vector_store import rebuild_vector_store
    background_tasks.add_task(rebuild_vector_store)
    return {"status": "rebuild_started", "message": "Vector database rebuild has been queued."}


@router.post("/test-llm")
def test_llm_connection(payload: Optional[TestConfigPayload] = None):
    """Quick connectivity check for the currently configured LLM or provided config."""
    try:
        from ai.llm_factory import get_llm
        if payload:
            llm = get_llm(provider=payload.provider, cfg=payload.config)
        else:
            llm = get_llm()
        response = llm.invoke("Reply with exactly: OK")
        return {"status": "ok", "response": str(response.content)[:200]}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/ollama-models")
async def get_ollama_models(base_url: str = Query(..., alias="base_url")):
    """Fetch available models from an Ollama server."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Ollama tags endpoint
            url = f"{base_url.rstrip('/')}/api/tags"
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            return {"status": "ok", "models": models}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ollama server unreachable or error: {str(e)}")


@router.post("/test-embedding")
def test_embedding_connection(payload: Optional[TestConfigPayload] = None):
    """Quick connectivity check for the currently configured embedding model or provided config."""
    try:
        from database.vector_store import get_embedding_function
        if payload:
            ef = get_embedding_function(provider=payload.provider, cfg=payload.config)
        else:
            ef = get_embedding_function()
        result = ef.embed_query("hello world")
        return {"status": "ok", "dimensions": len(result)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


def _mask_secrets(data: dict) -> dict:
    """Return a copy with API keys partially masked or marked as system-provided."""
    import copy
    from config import settings
    d = copy.deepcopy(data)

    env_keys = {
        "openai_api_key": settings.OPENAI_API_KEY,
        "anthropic_api_key": settings.ANTHROPIC_API_KEY,
    }

    for section_key in ("llm_config", "embedding_config"):
        section = d.get(section_key, {})
        for key in section:
            if "api_key" in key and section[key]:
                val = section[key]
                # Check if this matches the system environment default
                env_val = env_keys.get(key)
                
                if env_val and val == env_val:
                    # Provide a hint that this is the system default
                    section[key] = "●●●●●●●● (System)"
                elif len(val) > 8:
                    section[key] = val[:4] + "…" + val[-4:]
                else:
                    section[key] = "••••"
    return d
