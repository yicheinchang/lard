from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from contextlib import asynccontextmanager
import warnings

# Suppress Pydantic V1/Python 3.14 compatibility warning from LangChain
warnings.filterwarnings("ignore", message="Core Pydantic V1 functionality isn't compatible with Python 3.14 or greater.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure database tables exist
    from database.relational import engine, Base
    Base.metadata.create_all(bind=engine)
    print("INFO:     Application startup complete (Database Ready)")
    yield
    # Shutdown: Clean up if needed
    pass

def create_app() -> FastAPI:
    app = FastAPI(title="Job Tracker API", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    os.makedirs("uploads", exist_ok=True)
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

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
