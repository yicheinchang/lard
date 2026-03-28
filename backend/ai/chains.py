from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

class JobDetails(BaseModel):
    company: str = Field(description="The name of the company.")
    role: str = Field(description="The job title or role.")
    location: str | None = Field(default=None, description="The location of the job, if specified.")
    salary_range: str | None = Field(default=None, description="The salary range, if specified.")

extraction_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are an expert at extracting job details from text. Extract the company, role, location, and salary if available."),
    ("user", "{text}")
])
