from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

class JobDetails(BaseModel):
    company: str = Field(description="The name of the company.")
    role: str = Field(description="The job title or role.")
    location: str | None = Field(default=None, description="The location of the job, if specified.")
    salary_range: str | None = Field(default=None, description="The salary range, if specified.")
    description: str | None = Field(default=None, description="The FULL job description, fully formatted in Markdown (use ## headings, bullet points, and bold text). Include responsibilities and requirements.")

extraction_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are an expert at extracting job details from text, HTML, or PDF sources. "
               "Extract the company, role, location, salary, and the COMPLETE job description. "
               "For the 'description' field, use clean Markdown structure. "
               "Include sections like 'About the Role', 'Responsibilities', and 'Qualifications'. "
               "SKIP legal boilerplate, EEO statements, and cookie notices. "
               "Do not make up information if it is not present in the text."),
    ("user", "Here is the job specification:\n{text}")
])
