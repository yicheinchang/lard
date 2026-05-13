import sys
import os
from sqlalchemy.orm import Session
from pydantic import NameEmail, ValidationError, TypeAdapter

# Add backend to path so we can import modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database.relational import SessionLocal
from database.models import JobApplication

def audit_emails():
    print("--- Starting Email Audit (Read-Only) ---")
    db: Session = SessionLocal()
    try:
        jobs = db.query(JobApplication).all()
        issue_count = 0
        total_fields_checked = 0
        
        for job in jobs:
            # Fields to check
            fields = {
                "hr_email": job.hr_email,
                "hiring_manager_email": job.hiring_manager_email,
                "headhunter_email": job.headhunter_email
            }
            
            for field_name, value in fields.items():
                if not value or not value.strip():
                    continue
                
                total_fields_checked += 1
                try:
                    # Attempt to validate using Pydantic's NameEmail
                    TypeAdapter(NameEmail).validate_python(value)
                except ValidationError as e:
                    issue_count += 1
                    print(f"[ISSUE] Job ID {job.id} | Field: {field_name}")
                    print(f"      Raw Value: '{value}'")
                    print(f"      Error: {str(e).splitlines()[0]}") # Just the first line of error
                    print("-" * 40)
        
        print(f"\nAudit Complete.")
        print(f"Total records checked: {len(jobs)}")
        print(f"Total email fields checked: {total_fields_checked}")
        print(f"Total issues identified: {issue_count}")
        
    finally:
        db.close()

if __name__ == "__main__":
    audit_emails()
