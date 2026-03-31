from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

class JobDetails(BaseModel):
    company: str = Field(description="The name of the company.")
    role: str = Field(description="The job title or role.")
    location: str | None = Field(default=None, description="The location of the job, if specified.")
    salary_range: str | None = Field(default=None, description="The salary range, if specified.")
    company_job_id: str | None = Field(default=None, description="The internal Job ID or Reference Number (e.g., REQ-12345, R8822, or a simple number).")
    job_posted_date: str | None = Field(default=None, description="The date the job was posted, if visible.")
    application_deadline: str | None = Field(default=None, description="The application deadline, if visible.")
    description: str | None = Field(default=None, description="The FULL job description, extracted VERBATIM from the source and formatted in Markdown. Do not rephrase. Preserve original hierarchy and bullet points.")

extraction_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are an expert at extracting job details from text, HTML, or PDF sources. "
               "Extract the company, role, location, salary, Job ID, and the COMPLETE job description. "
               "For the 'description' field, use clean Markdown structure but PRESERVE VERBATIM text. "
               "Do NOT rephrase, do NOT add your own labels or categories (like 'Education' or 'Programming' if they aren't in the source). "
               "Include sections like 'About the Role', 'Responsibilities', and 'Qualifications' EXACTLY as they appear. "
               "SKIP legal boilerplate, EEO statements, and cookie notices. "
               "Do not make up information if it is not present in the text. "
               "\n\n### JOB ID GUIDANCE:\n"
               "- Look for labels like 'Job ID', 'Req #', 'Reference', or 'Pos ID'.\n"
               "- Prioritize finding the Job ID in the text body.\n"
               "- If and ONLY if no Job ID or reference number is found in the main text, check the provided URL for a reference number.\n"
               "- Examples of Job IDs: REQ-12345, R8822, 10074553."),
    ("user", "SOURCE URL: {url}\n\nCONTENT TO PROCESS:\n\"\"\"\n{text}\n\"\"\"")
])
