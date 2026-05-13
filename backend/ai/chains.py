from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field, ConfigDict

from .prompts import DEFAULT_SYSTEM_PROMPTS, FIELD_FORMAT_DESCRIPTIONS
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
 
def get_custom_guidance(key: str, settings: dict | None = None) -> str:
    """Helper to retrieve custom guidance for a specific prompt key."""
    if not settings or "custom_prompts" not in settings:
        return ""
    
    target = settings["custom_prompts"].get(key, "")
    if target and isinstance(target, str) and target.strip():
        return f"\n\nADDITIONAL USER INSTRUCTIONS:\n{target}"
    return ""

# --- Single Agent (Base Baseline) ---

class JobDetails(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    is_job_post: bool = Field(description=FIELD_FORMAT_DESCRIPTIONS["is_job_post"])
    likelihood: float = Field(description=FIELD_FORMAT_DESCRIPTIONS["likelihood"], ge=0, le=1)
    company: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["company"])
    role: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["role"])
    location: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["location"])
    salary_range: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["salary_range"])
    company_job_id: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["company_job_id"])
    job_posted_date: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["job_posted_date"])
    application_deadline: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["application_deadline"])
    description: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["description"])
    detected_category: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["detected_category"])

# --- Multi-Agent (Granular Splits) ---

class JobCompany(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    company: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["company"])

class JobRole(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    role: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["role"])

class JobLocation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    location: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["location"])

class JobSalary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    salary_range: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["salary_range"])

class JobId(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    company_job_id: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["company_job_id"])

class PostedDate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    job_posted_date: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["job_posted_date"])

class DeadlineDate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    application_deadline: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["application_deadline"])

class JobDescription(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    description: str | None = Field(default=None, description=FIELD_FORMAT_DESCRIPTIONS["description"])

# --- Verification (Multi-Agent Entry) ---

class JobPostCheck(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    is_job_post: bool = Field(description="True if the provided content is likely a job description or position advertisement.")
    likelihood: float = Field(description="The confidence level that the content is a job post, from 0.0 to 1.0.", ge=0, le=1)
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

def get_description_text_prompt(settings: dict | None = None):
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
def get_json_ld_extraction_prompt(settings: dict | None = None):
    """Prompt for JSON-LD extraction (Single-Agent)."""
    base = escape_braces(get_base_prompt("json_ld", settings))
    
    return ChatPromptTemplate.from_messages([
        ("system", base + "{validation_feedback}{custom_guidance}"),
        ("human", "{json_ld_data}")
    ])

# Helper to create JSON-LD QA validation prompt
def get_json_validation_prompt(settings: dict | None = None):
    base = escape_braces(get_base_prompt("qa_json", settings))
    return ChatPromptTemplate.from_messages([
        ("system", base + "{custom_guidance}"),
        ("user", "SOURCE TYPE: JSON-LD\n\nRAW SOURCE FRAGMENT:\n\"\"\"\n{source_text}\n\"\"\"\n\nGENERATED DESCRIPTION:\n\"\"\"\n{generated_description}\n\"\"\"")
    ])

# Helper to create Raw Text QA validation prompt
def get_text_validation_prompt(settings: dict | None = None):
    base = escape_braces(get_base_prompt("qa_text", settings))
    return ChatPromptTemplate.from_messages([
        ("system", base + "{custom_guidance}"),
        ("user", "SOURCE TYPE: RAW TEXT\n\nRAW SOURCE PAGE:\n\"\"\"\n{source_text}\n\"\"\"\n\nGENERATED DESCRIPTION:\n\"\"\"\n{generated_description}\n\"\"\"")
    ])

# Helper to create Job Post Check prompt
def get_job_post_check_prompt(settings: dict | None = None):
    custom_guidance = get_custom_guidance("job_post_check", settings)
    base = escape_braces(get_base_prompt("job_post_check", settings) + custom_guidance)
        
    return ChatPromptTemplate.from_messages([
        ("system", base),
        ("user", "CONTENT TO ANALYZE:\n\"\"\"\n{text}\n\"\"\"")
    ])

# --- JSON Metadata Support ---

def get_json_field_prompt(field_name: str, settings: dict | None = None):
    """Helper to create a dynamic metadata prompt for Structured Metadata fragment extraction."""
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
        ("user", "METADATA FRAGMENT:\n{json_fragment}")
    ])

def get_description_json_prompt(settings: dict | None = None):
    """Helper to create a dynamic metadata prompt for Structured Metadata description extraction."""
    base = escape_braces(get_base_prompt("json_description", settings))
    return ChatPromptTemplate.from_messages([
        ("system", base + "{validation_feedback}{custom_guidance}"),
        ("user", "METADATA FRAGMENT TO PROCESS (Markdown Output Required):\n\"\"\"\n{json_fragment}\n\"\"\"\n\nProduce the verbatim Markdown description now. Do NOT include any preamble or commentary:")
    ])

def get_qa_prompt(mode: str = "json", settings: dict | None = None):
    """Prompt for QA Validation agent."""
    key = "qa_json" if mode == "json" else "qa_text"
    custom_guidance = get_custom_guidance(key, settings)
    base = escape_braces(get_base_prompt(key, settings) + custom_guidance)
    
    return ChatPromptTemplate.from_messages([
        ("system", base),
        ("human", "SOURCE TEXT:\n{source_text}\n\nEXTRACTED DESCRIPTION:\n{extracted_content}")
    ])

def get_assistant_prompt(settings: dict | None = None):
    """Dynamic system prompt for the Chat Assistant."""
    key = "assistant_system_prompt"
    custom_guidance = get_custom_guidance(key, settings)
    base = get_base_prompt(key, settings)
    
    # We import SCHEMA_DESCRIPTION here to avoid circular imports
    from ai.assistant import SCHEMA_DESCRIPTION
    
    full_prompt = f"{base}\n\n{custom_guidance}\n\n{SCHEMA_DESCRIPTION}"
    return full_prompt

# --- Aliases for Graph Compatibility ---

def description_extraction_prompt(settings: dict | None = None):
    return _create_description_prompt(settings)

def description_json_prompt(settings: dict | None = None):
    return _create_description_json_prompt(settings)

# --- End of Prompt Factories ---

# --- Static wrappers removed in favor of dynamic get_* functions ---

class DescriptionValidation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    is_valid: bool = Field(description="True if the description is formatted correctly as clean Markdown and does NOT contain AI filler/conversational wrappers.")
    is_complete: bool = Field(description="True if the generated description contains ALL relevant information from the source, specifically ensuring the LAST items in lists and sections are present. True for JSON-LD if everything is present.")
    failure_reason: str | None = Field(default=None, description="If is_valid or is_complete is False, provide a concise explanation (e.g. 'Missing the final responsibility item', 'Includes AI conversational filler').")
