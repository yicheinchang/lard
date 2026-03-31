from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from ai.graph import agent_app
import httpx
from bs4 import BeautifulSoup
from config import load_app_settings

router = APIRouter(prefix="/api/ai", tags=["AI"])


def _check_ai_enabled():
    """Raise 403 if the AI assistant is disabled in settings."""
    s = load_app_settings()
    if not s.get("ai_enabled", True):
        raise HTTPException(status_code=403, detail="AI assistant is disabled. Enable it in Settings.")

def _clean_html(html: str) -> str:
    """Generic HTML cleaning to extract main content while removing noise."""
    soup = BeautifulSoup(html, 'html.parser')
    
    # Remove script, style, nav, footer, header, and other common noise
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
        tag.decompose()
        
    # Look for common content-heavy tags to prioritize, but fall back to body
    # This remains generic while giving a boost to common patterns
    main_content = soup.find('main') or soup.find('article') or soup.find(id='content') or soup.find(class_='job-description')
    if main_content:
        text = main_content.get_text(separator='\n', strip=True)
    else:
        text = soup.get_text(separator='\n', strip=True)
        
    return text

def _preprocess_text(text: str, max_chars: int = 8000) -> str:
    """Common text preprocessing for all input types."""
    # Remove excessive blank lines
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    text = "\n".join(lines)
    return text[:max_chars]

class ExtractRequest(BaseModel):
    url: str

class TextExtractRequest(BaseModel):
    text: str

@router.post("/extract-url")
async def extract_from_url(req: ExtractRequest, request: Request):
    _check_ai_enabled()
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(req.url, timeout=10)
            resp.raise_for_status()
            text = _clean_html(resp.text)
            text = _preprocess_text(text)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
            
    result = await agent_app.ainvoke({"text": text, "url": req.url, "request": request})
    return {"extracted": result["extracted_data"], "error": result["error"]}

from fastapi import UploadFile, File
from langchain_community.document_loaders import PyPDFLoader
import shutil
import os

@router.post("/extract-text")
async def extract_from_text(req: TextExtractRequest, request: Request):
    _check_ai_enabled()
    text = _preprocess_text(req.text)
    result = await agent_app.ainvoke({"text": text, "url": None, "request": request})
    return {"extracted": result["extracted_data"], "error": result["error"]}

@router.post("/extract-pdf")
async def extract_from_pdf(request: Request, file: UploadFile = File(...)):
    _check_ai_enabled()
    # Save temporarily
    os.makedirs("tmp", exist_ok=True)
    temp_path = f"tmp/{file.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        loader = PyPDFLoader(temp_path)
        pages = loader.load()
        text = "\n".join([page.page_content for page in pages])
        text = _preprocess_text(text)
        result = await agent_app.ainvoke({"text": text, "url": None, "request": request})
        return {"extracted": result["extracted_data"], "error": result["error"]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

class ChatRequest(BaseModel):
    message: str
    job_id: int | None = None

@router.post("/chat")
def chat_with_assistant(req: ChatRequest):
    _check_ai_enabled()
    try:
        from ai.assistant import get_assistant_agent
        from langchain_core.messages import HumanMessage
        
        agent = get_assistant_agent()
        
        # If a job_id is provided, we hint the agent about it
        query = req.message
        if req.job_id:
            query = f"(Context: the user is currently looking at job ID {req.job_id}) {query}"
            
        result = agent.invoke({"messages": [HumanMessage(content=query)]})
        
        # The result of a react agent is the updated state, 
        # where the last message is the assistant's reply.
        reply = result["messages"][-1].content
        return {"reply": reply, "error": None}
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return {"reply": None, "error": str(e)}
