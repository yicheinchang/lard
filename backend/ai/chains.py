from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

# --- Single Agent (Base Baseline) ---
class JobDetails(BaseModel):
    company: str = Field(description="The name of the company.")
    role: str = Field(description="The job title or role.")
    location: str | None = Field(default=None, description="The location of the job, if specified.")
    salary_range: str | None = Field(default=None, description="The salary range, if specified.")
    company_job_id: str | None = Field(default=None, description="The internal Job ID or Reference Number (e.g., REQ-12345, R8822, or a simple number).")
    job_posted_date: str | None = Field(default=None, description="The date the job was posted. Use YYYY-MM-DD format if possible, otherwise null.")
    application_deadline: str | None = Field(default=None, description="The application deadline. Use YYYY-MM-DD format if possible, otherwise null.")
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

# --- Multi-Agent (Granular Splits) ---

class JobCompany(BaseModel):
    company: str = Field(description="The name of the company.")

class JobRole(BaseModel):
    role: str = Field(description="The job title or role.")

class JobLocation(BaseModel):
    location: str | None = Field(default=None, description="The job location (e.g., 'Cambridge, MA').")

class JobSalary(BaseModel):
    salary_range: str | None = Field(default=None, description="The salary range, if specified.")

class JobId(BaseModel):
    company_job_id: str | None = Field(default=None, description="The internal Job ID (e.g., REQ-1234, R09384, or a simple number). Use URL ONLY if text does not contain it.")

class PostedDate(BaseModel):
    job_posted_date: str | None = Field(default=None, description="The date the job was posted (YYYY-MM-DD format preferred, or null).")

class DeadlineDate(BaseModel):
    application_deadline: str | None = Field(default=None, description="The application deadline (YYYY-MM-DD format preferred, or null).")

class JobDescription(BaseModel):
    description: str | None = Field(default=None, description="The FULL job description, extracted VERBATIM from the source and formatted in Markdown.")

# --- Specialized Multi-Agent Prompts ---

def _create_metadata_prompt(field_name: str, guidance: str = ""):
    return ChatPromptTemplate.from_messages([
        ("system", f"You are an expert at extracting job details. Extract ONLY the '{field_name}' verbatim from the text. "
                   f"{guidance} "
                   "If not explicitly found, return null."),
        ("user", "SOURCE URL: {url}\n\nCONTENT:\n\"\"\"\n{text}\n\"\"\"")
    ])

company_prompt = _create_metadata_prompt("company", "Look for the employer or organization name.")
role_prompt = _create_metadata_prompt("role", "Extract the professional job title only (e.g., 'Senior Software Engineer'). Skip internal codes unless they are part of the title.")
location_prompt = _create_metadata_prompt("location", "Extract the city, state/region, and country if available.")
salary_prompt = _create_metadata_prompt("salary_range", "Extract the compensation range (e.g., '$100k - $150k per year').")
job_id_prompt = _create_metadata_prompt("company_job_id", 
    "Look for 'Job ID', 'Req #', or 'Reference'. "
    "Prioritize text content. Fallback to URL only if text is missing it.")

posted_date_prompt = _create_metadata_prompt("job_posted_date", "Extract the date the job was published. Return in YYYY-MM-DD format.")
deadline_date_prompt = _create_metadata_prompt("application_deadline", "Extract the date applications close. Return in YYYY-MM-DD format.")

description_extraction_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are an expert at extracting job details from a job posting."
               "Reformat the COMPLETE job/position description, use clean Markdown structure but PRESERVE VERBATIM text. "
               "Do NOT rephrase, do NOT add your own labels or categories (like 'Education' or 'Programming' if they aren't in the source). "
               "Include sections like 'About the Role', 'Responsibilities', 'Qualifications' etc. EXACTLY as they appear. "
               "SKIP legal boilerplate, EEO statements, and cookie notices. "
               "Do not make up information if it is not present in the text."),
    ("user", "CONTENT TO PROCESS:\n\"\"\"\n{text}\n\"\"\"")
])

# --- JSON-LD Support ---

structured_data_validation_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are an expert at processing Schema.org JobPosting data. "
               "You will be given raw JSON data extracted from a webpage. "
               "Map and clean these fields into the target schema. "
               "GUIDANCE:\n"
               "- 'role': Use the JSON 'title' field. Clean it by removing obvious job codes if they are redundant.\n"
               "- 'company': Use 'hiringOrganization.name'.\n"
               "- 'location': Use 'jobLocation' (city, region, country).\n"
               "- 'salary_range': Look for 'baseSalary' fields (currency, min, max).\n"
               "- 'description': This is likely HTML. Convert it to clean Markdown, preserving hierarchy.\n"
               "- 'job_posted_date': Convert 'datePosted' to YYYY-MM-DD.\n"
               "- 'application_deadline': Use 'validThrough'. Convert to YYYY-MM-DD.\n"
               "Return ONLY the valid JSON matching the schema."),
    ("user", "RAW JSON-LD DATA:\n{json_ld_data}")
])
