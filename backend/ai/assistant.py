import sqlite3
import os
from langchain_core.tools import tool
from langchain.agents import create_agent
from langgraph.checkpoint.sqlite import SqliteSaver
from ai.llm_factory import get_llm
from ai.logger import agnt_log, log_llm_info
from database.relational import run_query
from database.vector_store import get_vector_store_manager
import json

from config import settings

# --- Persistence Setup --- #

HISTORY_DB_PATH = os.path.join(settings.DB_DIR, "ai_history.db")

def init_history_db():
    conn = sqlite3.connect(HISTORY_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id TEXT PRIMARY KEY,
            title TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    conn.close()

init_history_db()

# Initialize SqliteSaver checkpointer
# Using check_same_thread=False for FastAPI compatibility
sqlite_conn = sqlite3.connect(HISTORY_DB_PATH, check_same_thread=False)
sqlite_saver = SqliteSaver(sqlite_conn)

# --- SQL Database Tool --- #

@tool
def query_database(sql_query: str):
    """
    Execute a read-only SQL SELECT query against the **Lard** database.
    Use this to filter jobs by status (Wishlist, Applied, etc.), company, role, dates, or other structured fields.
    The table name is 'job_applications'.
    Important: Only perform SELECT operations. No updates or deletes.
    """
    try:
        agnt_log("Assistant", task="Database Query", input_data=sql_query[:60])
        if not sql_query.strip().lower().startswith("select"):
            return "Error: Only SELECT queries are allowed."
        results = run_query(sql_query)
        res_str = json.dumps(results, default=str)
        agnt_log("Assistant", task="DB Result", result=f"Found {len(results)} rows")
        return res_str
    except Exception as e:
        agnt_log("Assistant", task="DB Error", result=str(e))
        return f"Error executing query: {str(e)}"

# --- RAG / Document Search Tool --- #

from typing import Optional
@tool
def search_documents(query: str, job_id: Optional[int] = None):
    """
    Search through job descriptions and uploaded documents (resumes, notes) using semantic search.
    Use this to find specific requirements (like "10 years experience", "Python", "Remote") or details buried in the text.
    The 'job_id' is optional. ONLY provide it if you are looking for information about a specific job ID already known from database results. If searching across all jobs, omit 'job_id' or set it to null.
    """
    try:
        agnt_log("Assistant", task="Document Search", input_data=query[:60])
        search_kwargs = {"k": 5}
        if job_id:
            search_kwargs["filter"] = {"job_id": job_id}
        store = get_vector_store_manager().get_store()
        docs = store.similarity_search(query, **search_kwargs)
        formatted_docs = []
        for doc in docs:
            formatted_docs.append({
                "source": doc.metadata.get("source", "Unknown"),
                "job_id": doc.metadata.get("job_id"),
                "content": doc.page_content
            })
        agnt_log("Assistant", task="RAG Result", result=f"Found {len(docs)} docs")
        return json.dumps(formatted_docs)
    except Exception as e:
        agnt_log("Assistant", task="RAG Error", result=str(e))
        return f"Error searching documents: {str(e)}"

# --- Agent Setup --- #

SCHEMA_DESCRIPTION = r"""
You have access to a SQLite database with the following schema:

Table: job_applications
- id: INTEGER (Primary Key)
- company: TEXT (Company name)
- role: TEXT (Job title)
- status: TEXT (One of: 'Wishlist', 'Applied', 'Interviewing', 'Offered', 'Rejected')
- location: TEXT
- salary_range: TEXT
- description: TEXT (Markdown format, use this with search_documents tool for detailed analysis)
- applied_date: DATETIME
- job_posted_date: DATETIME
- application_deadline: DATETIME

Table: interview_steps
- id: INTEGER (Primary Key)
- job_application_id: INTEGER (Foreign Key to job_applications.id)
- step_type_id: INTEGER (Foreign Key to step_types.id)
- step_date: DATETIME
- status: TEXT ('Scheduled', 'Completed', 'Passed', 'Requested')
- notes: TEXT

Table: step_types
- id: INTEGER (Primary Key)
- name: TEXT (e.g., 'Phone Screen', 'Technical Interview', 'Onsite', 'HR Round')

When the user asks a question:
1. Use 'query_database' for structured filters (status, company, date). 
2. Use 'search_documents' for semantic details (skills, experience, culture) or to analyze descriptions of specific jobs.
3. You can use both tools in sequence! For example, find wishlist jobs via SQL, then search their descriptions via RAG.
4. IMPORTANT: Always use the provided tools to get data before answering. Do NOT describe the tool call you are about to make. Just call the tool.
5. If you need to use a tool, output ONLY the tool call. Do not add any "I will now call..." or other explanation.
6. Always provide a clear, helpful answer based on the data retrieved.
7. For any mathematical formulas or equations, you MUST use LaTeX notation with \[ ... \] for block math and \( ... \) for inline math. Do NOT use single $ signs for math to avoid conflict with currency symbols.
"""

def get_assistant_agent():
    log_llm_info()
    llm = get_llm()
    tools = [query_database, search_documents]
    
    # LangChain v1.0 Standard Agent
    agent = create_agent(
        llm, 
        tools=tools,
        system_prompt=f"You are a helpful AI job assistant. {SCHEMA_DESCRIPTION}",
        checkpointer=sqlite_saver
    )
    return agent
