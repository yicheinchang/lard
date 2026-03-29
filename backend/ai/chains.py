from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

class JobDetails(BaseModel):
    company: str = Field(description="The name of the company.")
    role: str = Field(description="The job title or role.")
    location: str | None = Field(default=None, description="The location of the job, if specified.")
    salary_range: str | None = Field(default=None, description="The salary range, if specified.")
    description: str | None = Field(default=None, description="A detailed summary of the job description, fully formatted in Markdown (use ## headings, bullet points, and bold text).")

extraction_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are an expert at extracting job details from text or HTML/Markdown sources. "
               "Extract the company, role, location, salary, and a detailed description if available. "
               "For the 'description' field, heavily use Markdown structures (like headers and lists) to preserve readibility. "
               "Do not make up information if it is not present in the text."),
    ("user", "Here is the job specification:\n{text}")
])
