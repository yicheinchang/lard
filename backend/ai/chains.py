from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from .prompts import DEFAULT_SYSTEM_PROMPTS
import re

def escape_braces(s: str) -> str:
    """Helper to escape literal curly braces in a string so they aren't treated as LangChain variables."""
    if not s:
        return ""
    return s.replace("{", "{{").replace("}", "}}")

def get_base_prompt(key: str, settings: dict | None = None) -> str:
    """Helper to retrieve a base system prompt from settings or fallback to default."""
    if settings and "system_prompts" in settings and key in settings["system_prompts"]:
        custom = settings["system_prompts"][key]
        if custom and custom.strip():
            return custom
    return DEFAULT_SYSTEM_PROMPTS.get(key, "")

# --- Single Agent (Base Baseline) ---

class JobDetails(BaseModel):
    is_job_post: bool = Field(description="Boolean: True if content is a job advertisement.")
    likelihood: float = Field(description="Float (0.0-1.0): Confidence that this is a job post.")
    company: str | None = Field(default=None, description="Name from hiringOrganization, brand, organization, or publisher.")
    role: str | None = Field(default=None, description="Official title verbatim from 'title' field or main header.")
    location: str | None = Field(default=None, description="City, State, Country from 'jobLocation' or header.")
    salary_range: str | None = Field(default=None, description="From baseSalary or jobBenefits. Format: '$100k-$150k' or '$50/hr'.")
    company_job_id: str | None = Field(default=None, description="From identifier, jobID, job_id, or positionID.")
    job_posted_date: str | None = Field(default=None, description="From datePosted or text. Format: YYYY-MM-DD.")
    application_deadline: str | None = Field(default=None, description="From validThrough or expires. Format: YYYY-MM-DD.")
    description: str | None = Field(default=None, description="Full verbatim description in clean Markdown.")
    detected_category: str | None = Field(default=None, description="Identify: 'Job Post', 'Resume', 'Blog', 'Error Page', etc.")

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

# --- Verification (Multi-Agent Entry) ---

class JobPostCheck(BaseModel):
    is_job_post: bool = Field(description="True if the provided content is likely a job description or position advertisement.")
    likelihood: float = Field(description="The confidence level that the content is a job post, from 0.0 to 1.0.")
    reason: str | None = Field(default=None, description="Optional brief reason if it's unlikely to be a job post.")
    detected_category: str | None = Field(default=None, description="The identified category of the content (e.g., 'Job Post', 'Resume', 'Blog Post', 'News Article', 'Error Page').")

# --- Specialized Multi-Agent Prompts ---

def get_field_prompt(field_name: str, settings: dict | None = None):
    """Helper to create a dynamic metadata prompt for standard text extraction."""
    # Map field name to system prompt key
    mapping = {
        "company": "field_company",
        "role": "field_role",
        "location": "field_location",
        "salary_range": "field_salary",
        "company_job_id": "field_id",
        "job_posted_date": "field_posted",
        "application_deadline": "field_deadline"
    }
    key = mapping.get(field_name)
    base = escape_braces(get_base_prompt(key, settings) if key else "")
    
    return ChatPromptTemplate.from_messages([
        ("system", base + "{validation_feedback}{custom_guidance}"),
        ("user", "SOURCE URL: {url}\n\nCONTENT:\n\"\"\"\n{text}\n\"\"\"")
    ])

def _create_description_prompt(settings: dict | None = None):
    base = escape_braces(get_base_prompt("extraction_description", settings))
    return ChatPromptTemplate.from_messages([
        ("system", base + "{validation_feedback}{custom_guidance}"),
        ("user", "CONTENT TO PROCESS:\n\"\"\"\n{text}\n\"\"\"\n\nProduce the verbatim Markdown description now. Do NOT include any preamble or commentary:")
    ])

# Helper to create extraction prompt
def get_extraction_prompt(settings: dict | None = None):
    base = escape_braces(get_base_prompt("extraction_base", settings))
    return ChatPromptTemplate.from_messages([
        ("system", base + "{validation_feedback}{custom_guidance}"),
        ("user", "SOURCE URL: {url}\n\nCONTENT TO PROCESS:\n\"\"\"\n{text}\n\"\"\"")
    ])

# Helper to create JSON-LD prompt
def get_json_ld_prompt(settings: dict | None = None):
    base = escape_braces(get_base_prompt("json_ld", settings))
    return ChatPromptTemplate.from_messages([
        ("system", base + "{validation_feedback}{custom_guidance}"),
        ("user", "RAW JSON-LD DATA:\n{json_ld_data}")
    ])

# Helper to create JSON-LD QA validation prompt
def get_json_validation_prompt(settings: dict | None = None):
    base = escape_braces(get_base_prompt("qa_validator_json", settings))
    return ChatPromptTemplate.from_messages([
        ("system", base + "{custom_guidance}"),
        ("user", "SOURCE TYPE: JSON-LD\n\nRAW SOURCE FRAGMENT:\n\"\"\"\n{source_text}\n\"\"\"\n\nGENERATED DESCRIPTION:\n\"\"\"\n{generated_description}\n\"\"\"")
    ])

# Helper to create Raw Text QA validation prompt
def get_text_validation_prompt(settings: dict | None = None):
    base = escape_braces(get_base_prompt("qa_validator_text", settings))
    return ChatPromptTemplate.from_messages([
        ("system", base + "{custom_guidance}"),
        ("user", "SOURCE TYPE: RAW TEXT\n\nRAW SOURCE PAGE:\n\"\"\"\n{source_text}\n\"\"\"\n\nGENERATED DESCRIPTION:\n\"\"\"\n{generated_description}\n\"\"\"")
    ])

# Helper to create Job Post Check prompt
def get_job_post_check_prompt(settings: dict | None = None):
    custom_guidance = ""
    if settings and "custom_prompts" in settings:
        cg = settings["custom_prompts"].get("job_post_check", "")
        if cg: custom_guidance = f"\n\nADDITIONAL USER INSTRUCTIONS:\n{cg}"
        
    base = escape_braces(get_base_prompt("job_post_check", settings) + custom_guidance)
        
    return ChatPromptTemplate.from_messages([
        ("system", base),
        ("user", "CONTENT TO ANALYZE:\n\"\"\"\n{text}\n\"\"\"")
    ])

# --- JSON-LD Metadata Support ---

def get_json_field_prompt(field_name: str, settings: dict | None = None):
    """Helper to create a dynamic metadata prompt for JSON-LD fragment extraction."""
    # Map field name to system prompt key
    mapping = {
        "company": "json_company",
        "role": "json_role",
        "location": "json_location",
        "salary_range": "json_salary",
        "company_job_id": "json_id",
        "job_posted_date": "json_posted",
        "application_deadline": "json_deadline"
    }
    key = mapping.get(field_name)
    base = escape_braces(get_base_prompt(key, settings) if key else "")

    return ChatPromptTemplate.from_messages([
        ("system", base + "{validation_feedback}{custom_guidance}"),
        ("user", "JSON FRAGMENT:\n{json_fragment}")
    ])

def _create_description_json_prompt(settings: dict | None = None):
    """Helper to create a dynamic metadata prompt for JSON-LD description extraction."""
    base = escape_braces(get_base_prompt("json_description", settings))
    return ChatPromptTemplate.from_messages([
        ("system", base + "{validation_feedback}{custom_guidance}"),
        ("user", "JSON FRAGMENT TO PROCESS (Markdown Output Required):\n\"\"\"\n{json_fragment}\n\"\"\"\n\nProduce the verbatim Markdown description now. Do NOT include any preamble or commentary:")
    ])

# --- Aliases for Graph Compatibility ---

def description_extraction_prompt(settings: dict | None = None):
    return _create_description_prompt(settings)

def description_json_prompt(settings: dict | None = None):
    # This matches the legacy name used in graph.py
    return _create_description_json_prompt(settings)

# --- Static wrappers removed in favor of dynamic get_* functions ---

class DescriptionValidation(BaseModel):
    is_valid: bool = Field(description="True if the description is formatted correctly as clean Markdown and does NOT contain AI filler/conversational wrappers.")
    is_complete: bool = Field(description="True if the generated description contains ALL relevant information from the source, specifically ensuring the LAST items in lists and sections are present. True for JSON-LD if everything is present.")
    failure_reason: str | None = Field(default=None, description="If is_valid or is_complete is False, provide a concise explanation (e.g. 'Missing the final responsibility item', 'Includes AI conversational filler').")
