from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from contextlib import asynccontextmanager
from database.relational import engine, Base
from routers import jobs, ai, settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure database tables exist
    Base.metadata.create_all(bind=engine)
    print("INFO:     Application startup complete (Database Ready)")
    yield
    # Shutdown: Clean up if needed
    pass

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

app.include_router(jobs.router)
app.include_router(ai.router)
app.include_router(settings.router)

@app.get("/")
def root():
    return {"status": "ok"}
