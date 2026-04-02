from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
import os
import shutil
import json
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
from database.relational import get_db
from database.models import JobApplication, InterviewStep, StepType, DocumentMeta, Company

router = APIRouter(prefix="/api", tags=["Jobs"])

# --- Pydantic Models ---
class CompanyResponse(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)

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
    company_id: Optional[int] = None
    salary_range: Optional[str] = None
    hr_email: Optional[str] = None
    hiring_manager_name: Optional[str] = None
    hiring_manager_email: Optional[str] = None
    headhunter_name: Optional[str] = None
    headhunter_email: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    applied_date: Optional[datetime] = None
    closed_date: Optional[datetime] = None
    last_operation: Optional[str] = None

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
    company_id: Optional[int] = None
    salary_range: Optional[str] = None
    hr_email: Optional[str] = None
    hiring_manager_name: Optional[str] = None
    hiring_manager_email: Optional[str] = None
    headhunter_name: Optional[str] = None
    headhunter_email: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    applied_date: Optional[datetime] = None
    closed_date: Optional[datetime] = None
    last_operation: Optional[str] = None

class JobResponse(JobBase):
    id: int
    last_updated: datetime
    steps: List[InterviewStepResponse] = []
    documents: List[DocumentMetaResponse] = []
    
    model_config = ConfigDict(from_attributes=True)


TERMINAL_STATUSES = ["Rejected", "Offered", "Discontinued", "Closed"]

def update_job_status(db_job: JobApplication, db: Session, operation: Optional[str] = None):
    """
    Automatically recalculate and update the application status based on internal logic.
    """
    original_status = db_job.status
    has_meaningful_change = False
    
    # 1. Terminal statuses stay as-is unless manually changed
    if db_job.status in TERMINAL_STATUSES:
        # One exception: Wishlist jobs can only be Discontinued or Closed.
        if not db_job.applied_date and db_job.status not in ["Discontinued", "Closed"]:
            db_job.status = "Wishlist"
    else:
        # 2. Progress logic
        if not db_job.applied_date:
            db_job.status = "Wishlist"
        elif db_job.steps:
            db_job.status = "Interviewing"
        else:
            db_job.status = "Applied"
    
    status_changed = db_job.status != original_status
    
    # Update last_operation and last_updated ONLY if something changed or explicit operation provided
    if operation or status_changed:
        # If both a manual operation and a status change occurred, prefer the status change for clarity
        # unless the status change was to "Wishlist/Applied/Interviewing" (automated)
        if status_changed:
            db_job.last_operation = f"Status Change: {db_job.status}"
            has_meaningful_change = True
        elif operation:
            db_job.last_operation = operation
            has_meaningful_change = True
            
        if has_meaningful_change:
            db_job.last_updated = datetime.now(timezone.utc)
    
    db.commit()

# --- Routes ---

def get_or_create_company(db: Session, name: str) -> Company:
    name = name.strip()
    company = db.query(Company).filter(Company.name.ilike(name)).first()
    if not company:
        company = Company(name=name)
        db.add(company)
        db.commit()
        db.refresh(company)
    return company

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
    job_data = job.model_dump()
    
    # Handle company linkage
    if job.company:
        company = get_or_create_company(db, job.company)
        job_data["company_id"] = company.id
        job_data["company"] = company.name # Keep name for legacy / convenience
        
    db_job = JobApplication(**job_data)
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    
    if db_job.description:
        try:
            from database.vector_store import get_vector_store_manager
            get_vector_store_manager().ingest_text(
                document_id=f"job_{db_job.id}",
                text=db_job.description,
                metadata={"job_id": db_job.id, "source": f"{db_job.company} - {db_job.role}", "type": "job_description"}
            )
        except Exception as e:
            print(f"Warning: Failed to vectorize job description {db_job.id}: {e}")
            
    # Initial status calculation
    update_job_status(db_job, db, operation="Job Created")
    db.refresh(db_job)
    return db_job

@router.put("/jobs/{job_id}", response_model=JobResponse)
def update_job(job_id: int, job_update: JobUpdate, db: Session = Depends(get_db)):
    db_job = db.query(JobApplication).filter(JobApplication.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Very permissive dict update to allow dynamic patch from the UI form
    
    # 0. Check for actual changes to avoid "Ghost" updates (Item 5)
    update_data = job_update.model_dump(exclude_unset=True)
    
    # Special check: is the updated data actually different from current?
    is_actually_different = False
    for key, value in update_data.items():
        if hasattr(db_job, key):
            current_val = getattr(db_job, key)
            # Normalize ISO strings for date comparison if needed, or rely on loose equality
            if current_val != value:
                is_actually_different = True
                break
    
    if not is_actually_different:
        return db_job

    status_changed = "status" in update_data and update_data["status"] != db_job.status
    description_changed = "description" in update_data and update_data["description"] != db_job.description
    notes_changed = "notes" in update_data and update_data["notes"] != db_job.notes
    
    # Maintain company sync if name is updated or ID is provided
    if "company" in update_data and update_data["company"]:
        company = get_or_create_company(db, update_data["company"])
        update_data["company_id"] = company.id
        update_data["company"] = company.name
        
    for key, value in update_data.items():
        if hasattr(db_job, key):
            setattr(db_job, key, value)
    
    db.commit()
    
    # Determine operation. If caller provided last_operation (e.g. "Updated Notes" from UI), use it
    operation = update_data.get("last_operation") or "Modified Job Details"
    
    update_job_status(db_job, db, operation=operation)
    db.refresh(db_job)
    
    if description_changed and db_job.description:
        try:
            from database.vector_store import get_vector_store_manager
            get_vector_store_manager().ingest_text(
                document_id=f"job_{db_job.id}",
                text=db_job.description,
                metadata={"job_id": db_job.id, "source": f"{db_job.company} - {db_job.role}", "type": "job_description"}
            )
        except Exception as e:
            print(f"Warning: Failed to vectorize job description {db_job.id}: {e}")
            
    if notes_changed and db_job.notes:
        try:
            from database.vector_store import get_vector_store_manager
            get_vector_store_manager().ingest_text(
                document_id=f"job_notes_{db_job.id}",
                text=db_job.notes,
                metadata={"job_id": db_job.id, "source": f"{db_job.company} - {db_job.role} (Notes)", "type": "job_notes"}
            )
        except Exception as e:
            print(f"Warning: Failed to vectorize job notes {db_job.id}: {e}")
            
    return db_job

@router.delete("/jobs/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db)):
    db_job = db.query(JobApplication).filter(JobApplication.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(db_job)
    db.commit()
    return {"status": "deleted"}

class DuplicateCheck(BaseModel):
    company: str
    role: str
    url: Optional[str] = None
    company_job_id: Optional[str] = None

@router.post("/jobs/check-duplicate")
def check_duplicate(check: DuplicateCheck, db: Session = Depends(get_db)):
    # 1. Check for URL match (Case 3 - Exact Match)
    if check.url:
        existing_url = db.query(JobApplication).filter(JobApplication.url == check.url).first()
        if existing_url:
            return {
                "status": "exact_match", 
                "match_type": "URL", 
                "job": {
                    "company": existing_url.company, 
                    "role": existing_url.role, 
                    "status": existing_url.status,
                    "applied_date": existing_url.applied_date.isoformat() if existing_url.applied_date else None,
                    "job_posted_date": existing_url.job_posted_date.isoformat() if existing_url.job_posted_date else None
                }
            }

    # 2. Check for Exact Match (Company + Role + JobID)
    company = db.query(Company).filter(Company.name.ilike(check.company.strip())).first()
    if company:
        # If job ID matches
        if check.company_job_id:
            existing_exact = db.query(JobApplication).filter(
                JobApplication.company_id == company.id,
                JobApplication.role.ilike(check.role.strip()),
                JobApplication.company_job_id == check.company_job_id
            ).first()
            if existing_exact:
                return {
                    "status": "exact_match", 
                    "match_type": "Company Job ID", 
                    "job": {
                        "company": existing_exact.company, 
                        "role": existing_exact.role, 
                        "status": existing_exact.status,
                        "applied_date": existing_exact.applied_date.isoformat() if existing_exact.applied_date else None,
                        "job_posted_date": existing_exact.job_posted_date.isoformat() if existing_exact.job_posted_date else None
                    }
                }
        
        # 3. Check for Similar Match (Company + Role)
        existing_similar = db.query(JobApplication).filter(
            JobApplication.company_id == company.id,
            JobApplication.role.ilike(check.role.strip())
        ).first()
        if existing_similar:
            return {
                "status": "similar_match", 
                "job": {
                    "id": existing_similar.id,
                    "company": existing_similar.company, 
                    "role": existing_similar.role,
                    "status": existing_similar.status,
                    "applied_date": existing_similar.applied_date.isoformat() if existing_similar.applied_date else None,
                    "job_posted_date": existing_similar.job_posted_date.isoformat() if existing_similar.job_posted_date else None
                }
            }

    return {"status": "unique"}

@router.get("/companies", response_model=List[CompanyResponse])
def read_companies(db: Session = Depends(get_db)):
    return db.query(Company).order_by(Company.name).all()

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
    
    # Recalculate job status
    update_job_status(db_job, db, operation=f"Added Interview Step: {st.name}")
    
    db.refresh(new_step)
    return new_step

@router.put("/jobs/steps/{step_id}", response_model=InterviewStepResponse)
def update_interview_step(step_id: int, step_update: InterviewStepUpdate, db: Session = Depends(get_db)):
    db_step = db.query(InterviewStep).filter(InterviewStep.id == step_id).first()
    if not db_step:
        raise HTTPException(status_code=404, detail="Step not found")
    
    update_data = step_update.model_dump(exclude_unset=True)
    
    if "step_type_name" in update_data:
        st = get_or_create_step_type(db, update_data.pop("step_type_name"))
        db_step.step_type_id = st.id
        
    for k, v in update_data.items():
        setattr(db_step, k, v)
    
    db.commit()
    db_step = db.query(InterviewStep).filter(InterviewStep.id == step_id).first() # Reload with type
    
    # Recalculate associated job status
    db_job = db.query(JobApplication).filter(JobApplication.id == db_step.job_application_id).first()
    if db_job:
        update_job_status(db_job, db, operation=f"Updated Interview Step: {db_step.step_type.name}")
        
    return db_step

@router.delete("/jobs/steps/{step_id}")
def delete_interview_step(step_id: int, db: Session = Depends(get_db)):
    db_step = db.query(InterviewStep).filter(InterviewStep.id == step_id).first()
    if not db_step:
        raise HTTPException(status_code=404, detail="Step not found")
    
    job_id = db_step.job_application_id
    db.delete(db_step)
    db.commit()
    
    # Recalculate status
    db_job = db.query(JobApplication).filter(JobApplication.id == job_id).first()
    if db_job:
        update_job_status(db_job, db, operation="Deleted Interview Step")
        
    return {"status": "deleted"}

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
    
    # Ingest document into vector store
    try:
        if file_path.endswith('.pdf'):
            from langchain_community.document_loaders import PyPDFLoader
            loader = PyPDFLoader(file_path)
            pages = loader.load()
            text = "\n".join([p.page_content for p in pages])
        else:
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read()
                
        from database.vector_store import get_vector_store_manager
        get_vector_store_manager().ingest_text(
            document_id=f"doc_{doc.id}", 
            text=text, 
            metadata={"job_id": job_id, "source": doc.title, "type": "document"}
        )
    except Exception as e:
        print(f"Warning: Failed to vectorize document {doc.id}: {e}")
        
        
    # Update Job status and operation
    update_job_status(db_job, db, operation=f"Attached Document: {doc.title}")
    
    return doc

@router.post("/jobs/{job_id}/documents/stream")
async def upload_job_document_stream(job_id: int, file: UploadFile = File(...), doc_type: str = Form(...), db: Session = Depends(get_db)):
    """
    Same as upload_job_document but returns a StreamingResponse with SSE progress updates.
    """
    async def generate_progress():
        try:
            yield f"data: {json.dumps({'event': 'progress', 'msg': 'Initializing upload...'})}\n\n"
            
            db_job = db.query(JobApplication).filter(JobApplication.id == job_id).first()
            if not db_job:
                yield f"data: {json.dumps({'event': 'error', 'msg': 'Job not found'})}\n\n"
                return

            os.makedirs("uploads", exist_ok=True)
            safe_filename = file.filename.replace(" ", "_").replace("/", "")
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            file_path = f"uploads/{job_id}_{timestamp}_{safe_filename}"
            
            yield f"data: {json.dumps({'event': 'progress', 'msg': 'Saving file to system...'})}\n\n"
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            yield f"data: {json.dumps({'event': 'progress', 'msg': 'Registering document...'})}\n\n"
            doc = DocumentMeta(
                job_id=job_id,
                title=file.filename,
                doc_type=doc_type,
                file_path=f"/{file_path}"
            )
            db.add(doc)
            db.commit()
            db.refresh(doc)
            
            yield f"data: {json.dumps({'event': 'progress', 'msg': 'Extracting content...'})}\n\n"
            # Ingest document into vector store
            if file_path.endswith('.pdf'):
                from langchain_community.document_loaders import PyPDFLoader
                loader = PyPDFLoader(file_path)
                pages = loader.load()
                text = "\n".join([p.page_content for p in pages])
            else:
                with open(file_path, "r", encoding="utf-8") as f:
                    text = f.read()
            
            yield f"data: {json.dumps({'event': 'progress', 'msg': 'Generating embeddings & vectorizing (this may take a minute)...'})}\n\n"
            from database.vector_store import get_vector_store_manager
            get_vector_store_manager().ingest_text(
                document_id=f"doc_{doc.id}", 
                text=text, 
                metadata={"job_id": job_id, "source": doc.title, "type": "document"}
            )
                
            # Update Job status and operation
            yield f"data: {json.dumps({'event': 'progress', 'msg': 'Finalizing attachment...'})}\n\n"
            update_job_status(db_job, db, operation=f"Attached Document: {doc.title}")
            
            yield f"data: {json.dumps({'event': 'completed', 'doc_id': doc.id, 'title': doc.title})}\n\n"
            
        except Exception as e:
            print(f"Error during streaming upload: {e}")
            yield f"data: {json.dumps({'event': 'error', 'msg': str(e)})}\n\n"

    return StreamingResponse(generate_progress(), media_type="text/event-stream")

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
            
    job_id = doc.job_id
    db.delete(doc)
    db.commit()

    if job_id:
        db_job = db.query(JobApplication).filter(JobApplication.id == job_id).first()
        if db_job:
            update_job_status(db_job, db, operation="Deleted Document")

    return {"status": "deleted"}
