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
    finally:
        from ai.status import set_ai_ready
        set_ai_ready()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure database tables exist
    from database.relational import engine, Base
    Base.metadata.create_all(bind=engine)
    
    # Standardize existing records and ensure columns exist
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            # 1. Ensure columns exist (SQLite doesn't support IF NOT EXISTS in ALTER TABLE)
            # We try to add them and catch the error if they already exist
            try:
                conn.execute(text("ALTER TABLE job_applications ADD COLUMN employment_type VARCHAR(20)"))
                conn.commit()
                print("INFO:     Added missing column 'employment_type'")
            except Exception:
                pass # Already exists
            
            try:
                conn.execute(text("ALTER TABLE job_applications ADD COLUMN agency TEXT"))
                conn.commit()
                print("INFO:     Added missing column 'agency'")
            except Exception:
                pass # Already exists

            # 2. Normalize NULL -> FTE
            conn.execute(text("UPDATE job_applications SET employment_type = 'FTE' WHERE employment_type IS NULL"))
            conn.commit()
            print("INFO:     Database normalization complete (employment_type -> FTE)")
    except Exception as e:
        print(f"WARNING:  Failed to normalize database: {e}")

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
