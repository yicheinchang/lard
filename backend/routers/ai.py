from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ai.graph import agent_app
import httpx
import json
import asyncio
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
    # Backward compatibility: Wait for stream to finish and return JSON
    result = {"extracted": None, "error": None}
    async for event in _extract_stream_generator(request, url=req.url):
        data = json.loads(event.replace("data: ", ""))
        if data["event"] == "final_result":
            result["extracted"] = data.get("extracted")
        elif data.get("event") == "error":
            result["error"] = data.get("msg")
    return result

async def _extract_stream_generator(request: Request, url: str = None, text: str = None):
    """Generator for SSE events during extraction."""
    _check_ai_enabled()
    
    # 1. Initial Status
    if url:
        yield f"data: {json.dumps({'event': 'progress', 'msg': f'Reading URL: {url[:60]}...'})}\n\n"
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, timeout=15)
                resp.raise_for_status()
                yield f"data: {json.dumps({'event': 'progress', 'msg': 'Cleaning HTML content...'})}\n\n"
                text = _clean_html(resp.text)
                snippet = _preprocess_text(text, max_chars=100)
                yield f"data: {json.dumps({'event': 'progress', 'msg': f'Processing text: {snippet[:60]}...'})}\n\n"
                text = _preprocess_text(text)
        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'msg': str(e)})}\n\n"
            return
    elif text:
        yield f"data: {json.dumps({'event': 'progress', 'msg': f'Processing input text...'})}\n\n"
        text = _preprocess_text(text)
        
    # 2. AI Execution with Progress Callback
    async def progress_callback(data: dict):
        # Translate graph events to SSE events
        await asyncio.sleep(0.1) # Smooth out updates
        # Ensure we yield string in the correct format for the outer loop's perspective
        # But this is a callback, so we need to put it into a queue or yield it.
        # Simplest: use a queue.
        await q.put(f"data: {json.dumps(data)}\n\n")

    q = asyncio.Queue()

    async def run_ai():
        try:
            result = await agent_app.ainvoke({"text": text, "url": url, "request": request, "progress_callback": progress_callback})
            await q.put(f"data: {json.dumps({'event': 'final_result', 'extracted': result['extracted_data'], 'error': result['error']})}\n\n")
        except Exception as e:
            await q.put(f"data: {json.dumps({'event': 'error', 'msg': str(e)})}\n\n")
        finally:
            await q.put(None)

    # Start AI in background
    ai_task = asyncio.create_task(run_ai())

    # Yield items from the queue until AI finish (None)
    try:
        while True:
            item = await q.get()
            if item is None:
                break
            yield item
    finally:
        # Strict termination: If the generator exits (client disconnect or manual stop), 
        # cancel the background AI task immediately to stop Ollama calls.
        if not ai_task.done():
            print("Client disconnected, canceling AI task...")
            ai_task.cancel()
            try:
                # Wait for cancellation to complete
                await ai_task
            except asyncio.CancelledError:
                print("AI task successfully canceled.")
            except Exception as e:
                print(f"Error during AI task cancellation: {e}")

@router.post("/extract-url-stream")
async def extract_url_stream(req: ExtractRequest, request: Request):
    return StreamingResponse(_extract_stream_generator(request, url=req.url), media_type="text/event-stream")

@router.post("/extract-text-stream")
async def extract_text_stream(req: TextExtractRequest, request: Request):
    return StreamingResponse(_extract_stream_generator(request, text=req.text), media_type="text/event-stream")

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

@router.post("/extract-pdf-stream")
async def extract_pdf_stream(request: Request, file: UploadFile = File(...)):
    _check_ai_enabled()
    # Save temporarily
    os.makedirs("tmp", exist_ok=True)
    temp_path = f"tmp/{file.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    async def pdf_gen():
        try:
            yield f"data: {json.dumps({'event': 'progress', 'msg': f'Parsing PDF: {file.filename}'})}\n\n"
            loader = PyPDFLoader(temp_path)
            pages = await asyncio.to_thread(loader.load) # Run blocking load in thread
            text = "\n".join([page.page_content for page in pages])
            text = _preprocess_text(text)
            
            async for event in _extract_stream_generator(request, text=text):
                yield event
        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'msg': str(e)})}\n\n"
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    return StreamingResponse(pdf_gen(), media_type="text/event-stream")

@router.post("/extract-pdf")
async def extract_from_pdf(request: Request, file: UploadFile = File(...)):
    # Backward compatibility
    res = {"extracted": None, "error": None}
    async for event in (await extract_pdf_stream(request, file)).body_iterator:
        data = json.loads(event.replace("data: ", ""))
        if data["event"] == "final_result":
            res["extracted"] = data.get("extracted")
        elif data.get("event") == "error":
            res["error"] = data.get("msg")
    return res

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
