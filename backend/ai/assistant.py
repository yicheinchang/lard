import sqlite3
import os
from contextlib import asynccontextmanager
from langchain_core.tools import tool
from langchain.agents import create_agent
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
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

# Assistant schema and instructions are now centralized in prompts.py

@asynccontextmanager
async def get_assistant_agent():
    """Async context manager for the assistant agent, ensuring checkpointer is properly managed."""
    log_llm_info()
    llm = get_llm()
    tools = [query_database, search_documents]
    
    from ai.chains import get_assistant_prompt
    from config import load_app_settings
    app_settings = load_app_settings()
    
    # Use AsyncSqliteSaver as a context manager (LangGraph 1.0 standard)
    async with AsyncSqliteSaver.from_conn_string(HISTORY_DB_PATH) as checkpointer:
        # LangChain v1.0 Standard Agent
        agent = create_agent(
            llm, 
            tools=tools,
            system_prompt=get_assistant_prompt(app_settings),
            checkpointer=checkpointer
        )
        yield agent
