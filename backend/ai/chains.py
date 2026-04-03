from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

# --- DEFAULT SYSTEM PROMPTS (Base Strings) ---

DEFAULT_SYSTEM_PROMPTS = {
    "extraction_base": (
        "You are an expert at extracting job details from text, HTML, or PDF sources. "
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
        "- Examples of Job IDs: REQ-12345, R8822, 10074553.\n\n"
    ),
    "extraction_description": (
        "You are an expert at extracting job details from a job posting."
        "Reformat the COMPLETE job/position description, use clean Markdown structure but PRESERVE VERBATIM text. "
        "Include existing sections (e.g., 'About the Role', 'Responsibilities', 'Qualifications' etc.) ONLY if they are explicitly present in the source. "
        "Do NOT rephrase, do NOT add your own labels or categories, and do NOT invent new headers. "
        "CRITICAL: Ensure the summary is COMPLETE. Do NOT truncate lists or skip items at the end of sections. "
        "Verify that the LAST items in any 'Responsibilities' or 'Requirements' lists are captured verbatim. "
        "SKIP legal boilerplate, EEO statements, and cookie notices ONLY if they are clearly separate from the job-related content."
        "Do not make up information if it is not present in the text.\n"
        "CRITICAL: Do NOT wrap the output in ```markdown blocks.\n\n"
    ),
    "json_ld": (
        "You are an expert at processing Schema.org JobPosting data. "
        "You will be given raw JSON data extracted from a webpage. "
        "Map and clean these fields into the target schema. "
        "GUIDANCE:\n"
        "- 'role': Use the JSON 'title' field. Extract the job title verbatim. Do not truncate the text or remove words, even if they are separated by commas.\n"
        "- 'company': Use 'hiringOrganization.name'.\n"
        "- 'location': Use 'jobLocation' (city, region, country).\n"
        "- 'salary_range': Look for 'baseSalary' fields (currency, min, max).\n"
        "- 'description': This is likely HTML. Convert it to clean Markdown. PRESERVE VERBATIM text. Do NOT invent new headers or categories.\n"
        "- 'job_posted_date': Convert 'datePosted' to YYYY-MM-DD.\n"
        "- 'application_deadline': Use 'validThrough'. Convert to YYYY-MM-DD.\n"
        "Return ONLY the valid JSON matching the schema.\n\n"
    ),
    "qa_validator": (
        "You are an expert QA agent. Your job is to validate a generated Job Description against its original source. "
        "You must check for both HALLUCINATIONS (added info) and COMPLETENESS (missing info). "
        "RULES:\n"
        "1. AI HALLUCINATION: set is_valid=False if the LLM invented information not in the RAW SOURCE.\n"
        "2. COMPLETENESS: set is_complete=False if the LLM truncated items or missed content. "
        "Check specifically if the LAST items in each section of the RAW SOURCE (even if in HTML) are present in the GENERATED DESCRIPTION.\n"
        "3. CONTEXT: If the source is 'JSON-LD', it contains HTML. Ignore the tags and focus on the text content. Everything must be included.\n"
        "4. VERBATIM: While formatting is flexible, the text content itself must remain verbatim. Minor punctuation/whitespace fixes are fine.\n"
        "5. FENCING: MUST NOT contain ```markdown blocks.\n"
        "CRITICAL: If is_valid or is_complete is False, you MUST provide a detailed failure_reason explaining what is missing or wrong."
    ),
    # --- Multi-Agent Field Basics (Text) ---
    "field_company": "You are an expert at extracting job details. Extract ONLY the 'company' name verbatim from the text. Look for the employer or organization name. If not explicitly found, return null.",
    "field_role": "You are an expert at extracting job details. Extract ONLY the 'role' verbatim from the text. Extract the professional job title verbatim. Do not truncate the text or remove words, even if they are separated by commas. If not explicitly found, return null.",
    "field_location": "You are an expert at extracting job details. Extract ONLY the 'location' verbatim from the text. Extract the city, state/region, and country if available. If not explicitly found, return null.",
    "field_salary": "You are an expert at extracting job details. Extract ONLY the 'salary_range' verbatim from the text. Extract the compensation range (e.g., '$100k - $150k per year'). If not explicitly found, return null.",
    "field_id": "You are an expert at extracting job details. Extract ONLY the 'company_job_id' verbatim from the text. Look for 'Job ID', 'Req #', or 'Reference'. Prioritize text content. Fallback to URL only if text is missing it. If not explicitly found, return null.",
    "field_posted": "You are an expert at extracting job details. Extract ONLY the 'job_posted_date' verbatim from the text. Extract the date the job was published. Return in YYYY-MM-DD format. If not explicitly found, return null.",
    "field_deadline": "You are an expert at extracting job details. Extract ONLY the 'application_deadline' verbatim from the text. Extract the date applications close. Return in YYYY-MM-DD format. If not explicitly found, return null.",
    # --- Multi-Agent Field Basics (JSON) ---
    "json_company": "You are an expert at extracting job details from Schema.org JSON-LD data. Extract ONLY the 'company' from the provided JSON snippet. Use the embedded name or text. Return just the company name. If the specific detail is not found or empty, return null.",
    "json_role": "You are an expert at extracting job details from Schema.org JSON-LD data. Extract ONLY the 'role' from the provided JSON snippet. Extract the professional job title verbatim. Do not truncate the text or remove words, even if they are separated by commas. If the specific detail is not found or empty, return null.",
    "json_location": "You are an expert at extracting job details from Schema.org JSON-LD data. Extract ONLY the 'location' from the provided JSON snippet. Extract the city, state/region, and country. Format it simply (e.g., 'Cambridge, MA'). If the specific detail is not found or empty, return null.",
    "json_salary": "You are an expert at extracting job details from Schema.org JSON-LD data. Extract ONLY the 'salary_range' from the provided JSON snippet. Extract the currency, min, and max values and format them cleanly. If the specific detail is not found or empty, return null.",
    "json_id": "You are an expert at extracting job details from Schema.org JSON-LD data. Extract ONLY the 'company_job_id' from the provided JSON snippet. Extract the value of the identifier or reference number. If the specific detail is not found or empty, return null.",
    "json_posted": "You are an expert at extracting job details from Schema.org JSON-LD data. Extract ONLY the 'job_posted_date' from the provided JSON snippet. Convert the date to YYYY-MM-DD format. If the specific detail is not found or empty, return null.",
    "json_deadline": "You are an expert at extracting job details from Schema.org JSON-LD data. Extract ONLY the 'application_deadline' from the provided JSON snippet. Convert the date to YYYY-MM-DD format. If the specific detail is not found or empty, return null."
}

def get_base_prompt(key: str, settings: dict | None = None) -> str:
    """Helper to retrieve a base system prompt from settings or fallback to default."""
    if settings and "system_prompts" in settings and key in settings["system_prompts"]:
        custom = settings["system_prompts"][key]
        if custom and custom.strip():
            return custom
    return DEFAULT_SYSTEM_PROMPTS.get(key, "")

# --- Single Agent (Base Baseline) ---

class JobDetails(BaseModel):
    company: str = Field(description="The name of the company.")
    role: str = Field(description="The job title or role.")
    location: str | None = Field(default=None, description="The job location (e.g., 'Cambridge, MA').")
    salary_range: str | None = Field(default=None, description="The salary range, if specified (e.g., '$100k-$150k').")
    company_job_id: str | None = Field(default=None, description="The internal Job ID (REQ-1234, R09384, or a simple number). Use URL ONLY if text does not contain it.")
    job_posted_date: str | None = Field(default=None, description="The date the job was posted (YYYY-MM-DD or null).")
    application_deadline: str | None = Field(default=None, description="The application deadline (YYYY-MM-DD or null).")
    description: str = Field(description="The FULL job description, extracted VERBATIM from the source and formatted in clean Markdown.")

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
    base = get_base_prompt(key, settings) if key else ""
    
    return ChatPromptTemplate.from_messages([
        ("system", base + "{custom_guidance}"),
        ("user", "SOURCE URL: {url}\n\nCONTENT:\n\"\"\"\n{text}\n\"\"\"")
    ])

def _create_description_prompt(settings: dict | None = None):
    return ChatPromptTemplate.from_messages([
        ("system", get_base_prompt("extraction_description", settings) + "{validation_feedback}{custom_guidance}"),
        ("user", "CONTENT TO PROCESS:\n\"\"\"\n{text}\n\"\"\"")
    ])

# Helper to create extraction prompt
def get_extraction_prompt(settings: dict | None = None):
    return ChatPromptTemplate.from_messages([
        ("system", get_base_prompt("extraction_base", settings) + "{custom_guidance}"),
        ("user", "SOURCE URL: {url}\n\nCONTENT TO PROCESS:\n\"\"\"\n{text}\n\"\"\"")
    ])

# Helper to create JSON-LD prompt
def get_json_ld_prompt(settings: dict | None = None):
    return ChatPromptTemplate.from_messages([
        ("system", get_base_prompt("json_ld", settings) + "{custom_guidance}"),
        ("user", "RAW JSON-LD DATA:\n{json_ld_data}")
    ])

# Helper to create QA validation prompt
def get_validation_prompt(settings: dict | None = None):
    return ChatPromptTemplate.from_messages([
        ("system", get_base_prompt("qa_validator", settings)),
        ("user", "SOURCE TYPE: {source_type}\n\nRAW SOURCE:\n\"\"\"\n{source_text}\n\"\"\"\n\nGENERATED DESCRIPTION:\n\"\"\"\n{generated_description}\n\"\"\"")
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
    base = get_base_prompt(key, settings) if key else ""

    return ChatPromptTemplate.from_messages([
        ("system", base + "{custom_guidance}"),
        ("user", "JSON FRAGMENT:\n{json_fragment}")
    ])

# --- Aliases for Graph Compatibility ---

def description_extraction_prompt(settings: dict | None = None):
    return _create_description_prompt(settings)

def description_json_prompt(settings: dict | None = None):
    # This matches the legacy name used in graph.py
    return _create_description_prompt(settings)

# --- Static wrappers removed in favor of dynamic get_* functions ---

class DescriptionValidation(BaseModel):
    is_valid: bool = Field(description="True if the description is formatted correctly as clean Markdown and does NOT contain AI filler/conversational wrappers.")
    is_complete: bool = Field(description="True if the generated description contains ALL relevant information from the source, specifically ensuring the LAST items in lists and sections are present. True for JSON-LD if everything is present.")
    failure_reason: str | None = Field(default=None, description="If is_valid or is_complete is False, provide a concise explanation (e.g. 'Missing the final responsibility item', 'Includes AI conversational filler').")
