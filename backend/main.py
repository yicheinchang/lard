from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from contextlib import asynccontextmanager
import warnings

# Suppress Pydantic V1/Python 3.14 compatibility warning from LangChain
warnings.filterwarnings("ignore", message="Core Pydantic V1 functionality isn't compatible with Python 3.14 or greater.")
# Suppress harmless resource tracker warnings at shutdown caused by AI libraries
warnings.filterwarnings("ignore", message="resource_tracker: There appear to be .* leaked semaphore objects")

import threading

def _preload_ai_components():
    print("INFO:     Preloading AI libraries in background...")
    try:
        from ai.graph import get_agent_app
        get_agent_app()
        from database.vector_store import get_embedding_function
        get_embedding_function() # This caches the embeddings
        print("INFO:     AI libraries preloaded successfully.")
    except Exception as e:
        print(f"ERROR:    Failed to preload AI libraries: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure database tables exist
    from database.relational import engine, Base
    Base.metadata.create_all(bind=engine)
    print("INFO:     Application startup complete (Database Ready)")
    
    threading.Thread(target=_preload_ai_components, daemon=True).start()
    
    yield
    # Shutdown: Clean up if needed
    pass

def create_app() -> FastAPI:
    app = FastAPI(title="Lard API", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from config import UPLOADS_DIR
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

    # Lazy Router Inclusion
    from routers import jobs, ai, settings
    app.include_router(jobs.router)
    app.include_router(ai.router)
    app.include_router(settings.router)
    
    return app

app = create_app()

@app.get("/")
def root():
    return {"status": "ok"}
