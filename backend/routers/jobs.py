from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
import os
import shutil
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime
from database.relational import get_db
from database.models import JobApplication, InterviewStep, StepType, DocumentMeta

router = APIRouter(prefix="/api", tags=["Jobs"])

# --- Pydantic Models ---
class DocumentMetaResponse(BaseModel):
    id: int
    job_id: Optional[int]
    title: str
    doc_type: str
    file_path: str
    uploaded_at: datetime
    model_config = ConfigDict(from_attributes=True)

class StepTypeBase(BaseModel):
    name: str

class StepTypeResponse(StepTypeBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class InterviewStepCreate(BaseModel):
    step_type_name: str
    step_date: Optional[datetime] = None
    status: Optional[str] = "Scheduled"
    notes: Optional[str] = None

class InterviewStepUpdate(BaseModel):
    step_date: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class InterviewStepResponse(BaseModel):
    id: int
    step_type: StepTypeResponse
    step_date: Optional[datetime]
    status: str
    notes: Optional[str]
    model_config = ConfigDict(from_attributes=True)

class JobBase(BaseModel):
    company: str
    role: str
    url: Optional[str] = None
    status: Optional[str] = "Applied"
    job_posted_date: Optional[datetime] = None
    application_deadline: Optional[datetime] = None
    company_job_id: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    hr_email: Optional[str] = None
    hiring_manager_name: Optional[str] = None
    hiring_manager_email: Optional[str] = None
    headhunter_name: Optional[str] = None
    headhunter_email: Optional[str] = None

class JobCreate(JobBase):
    pass

class JobUpdate(BaseModel):
    company: Optional[str] = None
    role: Optional[str] = None
    url: Optional[str] = None
    status: Optional[str] = None
    job_posted_date: Optional[datetime] = None
    application_deadline: Optional[datetime] = None
    company_job_id: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    hr_email: Optional[str] = None
    hiring_manager_name: Optional[str] = None
    hiring_manager_email: Optional[str] = None
    headhunter_name: Optional[str] = None
    headhunter_email: Optional[str] = None

class JobResponse(JobBase):
    id: int
    applied_date: datetime
    last_updated: datetime
    steps: List[InterviewStepResponse] = []
    documents: List[DocumentMetaResponse] = []
    
    model_config = ConfigDict(from_attributes=True)

# --- Routes ---

def get_or_create_step_type(db: Session, name: str) -> StepType:
    st = db.query(StepType).filter(StepType.name == name).first()
    if not st:
        st = StepType(name=name)
        db.add(st)
        db.commit()
        db.refresh(st)
    return st

@router.get("/jobs", response_model=List[JobResponse])
def read_jobs(db: Session = Depends(get_db)):
    return db.query(JobApplication).options(joinedload(JobApplication.steps).joinedload(InterviewStep.step_type), joinedload(JobApplication.documents)).order_by(JobApplication.applied_date.desc()).all()

@router.post("/jobs/", response_model=JobResponse)
def create_job(job: JobCreate, db: Session = Depends(get_db)):
    db_job = JobApplication(**job.model_dump())
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job

@router.put("/jobs/{job_id}", response_model=JobResponse)
def update_job(job_id: int, job_update: JobUpdate, db: Session = Depends(get_db)):
    db_job = db.query(JobApplication).filter(JobApplication.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Very permissive dict update to allow dynamic patch from the UI form
    update_data = job_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if hasattr(db_job, key):
            setattr(db_job, key, value)
        
    db.commit()
    db.refresh(db_job)
    return db_job

@router.delete("/jobs/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db)):
    db_job = db.query(JobApplication).filter(JobApplication.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(db_job)
    db.commit()
    return {"status": "deleted"}

@router.get("/steps/types", response_model=List[StepTypeResponse])
def get_step_types(db: Session = Depends(get_db)):
    return db.query(StepType).all()

@router.post("/jobs/{job_id}/steps", response_model=InterviewStepResponse)
def add_interview_step(job_id: int, step: InterviewStepCreate, db: Session = Depends(get_db)):
    db_job = db.query(JobApplication).filter(JobApplication.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    st = get_or_create_step_type(db, step.step_type_name)
    
    new_step = InterviewStep(
        job_application_id=job_id,
        step_type_id=st.id,
        step_date=step.step_date,
        status=step.status,
        notes=step.notes
    )
    db.add(new_step)
    db.commit()
    db.refresh(new_step)
    return new_step

@router.put("/jobs/steps/{step_id}", response_model=InterviewStepResponse)
def update_interview_step(step_id: int, step_update: InterviewStepUpdate, db: Session = Depends(get_db)):
    db_step = db.query(InterviewStep).filter(InterviewStep.id == step_id).first()
    if not db_step:
        raise HTTPException(status_code=404, detail="Step not found")
    
    update_data = step_update.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(db_step, k, v)
    
    db.commit()
    db.refresh(db_step)
    return db_step

@router.post("/jobs/{job_id}/documents", response_model=DocumentMetaResponse)
def upload_job_document(job_id: int, file: UploadFile = File(...), doc_type: str = Form(...), db: Session = Depends(get_db)):
    db_job = db.query(JobApplication).filter(JobApplication.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    os.makedirs("uploads", exist_ok=True)
    safe_filename = file.filename.replace(" ", "_").replace("/", "")
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    file_path = f"uploads/{job_id}_{timestamp}_{safe_filename}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    doc = DocumentMeta(
        job_id=job_id,
        title=file.filename,
        doc_type=doc_type,
        file_path=f"/{file_path}"
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc

@router.delete("/documents/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(DocumentMeta).filter(DocumentMeta.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    local_path = doc.file_path.lstrip('/')
    if os.path.exists(local_path):
        try:
            os.remove(local_path)
        except Exception as e:
            print(f"Error deleting file {local_path}: {e}")
            
    db.delete(doc)
    db.commit()
    return {"status": "deleted"}
