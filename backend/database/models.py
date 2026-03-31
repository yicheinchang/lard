from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database.relational import Base

class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False) # Case-insensitive unique in logic

    applications = relationship("JobApplication", back_populates="company_obj", cascade="all, delete-orphan")

class InterviewStep(Base):
    __tablename__ = "interview_steps"

    id = Column(Integer, primary_key=True, index=True)
    job_application_id = Column(Integer, ForeignKey("job_applications.id"), nullable=False)
    step_type_id = Column(Integer, ForeignKey("step_types.id"), nullable=False)
    step_date = Column(DateTime, nullable=True)
    status = Column(String, default="Scheduled") 
    notes = Column(Text, nullable=True)

    job_application = relationship("JobApplication", back_populates="steps")
    step_type = relationship("StepType", back_populates="steps")

class StepType(Base):
    __tablename__ = "step_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)

    steps = relationship("InterviewStep", back_populates="step_type")

class JobApplication(Base):
    __tablename__ = "job_applications"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True) # Linked to Company table
    company = Column(String, index=True, nullable=True) # Legacy field / caching
    role = Column(String, nullable=False)
    status = Column(String, default="Applied") 
    url = Column(String, nullable=True)
    
    # New detail fields
    job_posted_date = Column(DateTime, nullable=True)
    application_deadline = Column(DateTime, nullable=True)
    company_job_id = Column(String, nullable=True)
    location = Column(String, nullable=True)
    description = Column(Text, nullable=True) # Markdown
    salary_range = Column(String, nullable=True)
    
    hr_email = Column(String, nullable=True)
    hiring_manager_name = Column(String, nullable=True)
    hiring_manager_email = Column(String, nullable=True)
    headhunter_name = Column(String, nullable=True)
    headhunter_email = Column(String, nullable=True)

    applied_date = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_updated = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    notes = Column(Text, nullable=True) # Additional user notes in Markdown

    steps = relationship("InterviewStep", back_populates="job_application", cascade="all, delete-orphan")
    documents = relationship("DocumentMeta", back_populates="job_application", cascade="all, delete-orphan")
    company_obj = relationship("Company", back_populates="applications")

class DocumentMeta(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("job_applications.id"), nullable=True) # Optional link to a job
    title = Column(String, nullable=False)
    doc_type = Column(String, nullable=False) # resume, cover_letter, notes
    file_path = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    job_application = relationship("JobApplication", back_populates="documents")
