from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx
import json
import asyncio
import os
import shutil
from config import load_app_settings
from ai.logger import agnt_log

router = APIRouter(prefix="/api/ai", tags=["AI"])


def _check_ai_enabled():
    """Raise 403 if the AI assistant is disabled in settings."""
    s = load_app_settings()
    if not s.get("ai_enabled", True):
        raise HTTPException(status_code=403, detail="AI assistant is disabled. Enable it in Settings.")

def _resolve_json_ld_references(all_data):
    """
    Traverses list of JSON-LD objects to build an ID map and resolve cross-references.
    This helps the AI extract fields from complex @graph structures like Novartis.
    """
    id_map = {}
    
    def collect_ids(obj):
        if isinstance(obj, dict):
            node_id = obj.get("@id")
            node_type = obj.get("@type")
            if node_id:
                if node_id not in id_map or node_type:
                    id_map[node_id] = obj
            for val in obj.values():
                collect_ids(val)
        elif isinstance(obj, list):
            for item in obj:
                collect_ids(item)

    collect_ids(all_data)
    
    def expand_references(obj, visited=None):
        if visited is None: visited = set()
        obj_id = id(obj)
        if obj_id in visited: return obj
        visited.add(obj_id)

        if isinstance(obj, dict):
            # If it's a reference only link: {"@id": "some_id"}
            if len(obj) == 1 and "@id" in obj:
                ref_id = obj["@id"]
                if ref_id in id_map:
                    resolved = id_map[ref_id]
                    if resolved is not obj:
                        return resolved
            return {k: expand_references(v, visited) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [expand_references(item, visited) for item in obj]
        return obj

    return expand_references(all_data)

def _clean_html(html: str) -> tuple[str, dict | None]:
    """Generic HTML cleaning to extract main content while removing noise, with JSON-LD support."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')

    # 1. Look for application/ld+json (Schema.org JobPosting)
    json_ld_blocks = []
    for ld_script in soup.find_all("script", type="application/ld+json"):
        try:
            content = ld_script.get_text().strip()
            if not content:
                continue
            data = json.loads(content)
            json_ld_blocks.append(data)
        except Exception as e:
            print(f"Error parsing JSON-LD: {e}")

    # 2. Resolve references across all JSON-LD blocks and find the JobPosting
    structured_data = None
    if json_ld_blocks:
        resolved_all = _resolve_json_ld_references(json_ld_blocks)
        
        # Flatten: Search for the (now resolved) JobPosting node
        def find_job_posting(data):
            if isinstance(data, dict):
                types = data.get("@type", "")
                is_job = "JobPosting" in (types if isinstance(types, list) else [str(types)])
                if is_job: 
                    return data
                # Recurse into dict values (like @graph)
                for v in data.values():
                    res = find_job_posting(v)
                    if res: return res
            elif isinstance(data, list):
                for item in data:
                    res = find_job_posting(item)
                    if res: return res
            return None
            
        structured_data = find_job_posting(resolved_all)

    # 2. Decompose generic noise (scripts, styles, etc.)
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
        tag.decompose()
        
    # 3. Standard Text Extraction
    main_content = soup.find('main') or soup.find('article') or soup.find(id='content') or soup.find(class_='job-description')
    if main_content:
        text = main_content.get_text(separator='\n', strip=True)
    else:
        text = soup.get_text(separator='\n', strip=True)
        
    return text, structured_data

def _preprocess_text(text: str, max_chars: int | None = None) -> str:
    """Common text preprocessing for all input types."""
    # Remove excessive blank lines
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    text = "\n".join(lines)
    return text[:max_chars] if max_chars else text

class ExtractRequest(BaseModel):
    url: str

class TextExtractRequest(BaseModel):
    text: str

async def _run_extraction_core(request: Request, url: str | None = None, text: str | None = None, progress_callback = None):
    """Core logic to run the extraction graph. Used by both streaming and atomic endpoints."""
    _check_ai_enabled()
    
    structured_data = None
    if url:
        if progress_callback:
            await progress_callback({"event": "progress", "msg": f"Reading URL: {url[:60]}..."})
        try:
            # Add browser-standard headers to avoid being blocked by anti-bot systems
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }
            async with httpx.AsyncClient(follow_redirects=True) as client:
                resp = await client.get(url, timeout=20, headers=headers)
                resp.raise_for_status()
                if progress_callback:
                    await progress_callback({"event": "progress", "msg": "Cleaning HTML content..."})
                text, structured_data = _clean_html(resp.text)
                
                # Preprocess and log snippet
                text = _preprocess_text(text)
                snippet = text[:100]
                if progress_callback:
                    await progress_callback({"event": "progress", "msg": f"Processing text: {snippet[:60]}..."})
                
                # Log cleaned text for manual investigation
                try:
                    os.makedirs("tmp", exist_ok=True)
                    with open("tmp/last_extracted_content.txt", "w", encoding="utf-8") as f:
                        f.write(text)
                except Exception as log_err:
                    print(f"Failed to log extracted content: {log_err}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch content from URL: {str(e)}")
            
    elif text:
        if progress_callback:
            await progress_callback({"event": "progress", "msg": "Processing input text..."})
        text = _preprocess_text(text)
        # Log input text for manual investigation
        try:
            os.makedirs("tmp", exist_ok=True)
            with open("tmp/last_extracted_content.txt", "w", encoding="utf-8") as f:
                f.write(text)
        except Exception as log_err:
            print(f"Failed to log extracted content: {log_err}")

    # Standard AI Graph invocation
    from ai.graph import get_agent_app
    agnt_log("Router", task="Extraction", result="Starting fresh AI Graph run...")
    
    result = await get_agent_app().ainvoke({
        "text": text, 
        "url": url, 
        "request": request, 
        "progress_callback": progress_callback,
        "structured_data": structured_data,
        "extracted_data": None,
        "error": None,
        "retries": 0,
        "validation_feedback": None,
        "use_text_fallback": False,
        "previous_json_results": None
    })
    
    if result.get("error"):
         raise Exception(result["error"])
         
    return result.get("extracted_data")

@router.post("/extract-url")
async def extract_from_url(req: ExtractRequest, request: Request):
    """Direct, non-streaming extraction from a URL."""
    try:
        data = await _run_extraction_core(request, url=req.url)
        return {"extracted": data, "error": None}
    except Exception as e:
        return {"extracted": None, "error": str(e)}

async def _extract_stream_generator(request: Request, url: str | None = None, text: str | None = None):
    """Generator for SSE events during extraction."""
    _check_ai_enabled()
    q = asyncio.Queue()

    async def progress_callback(data: dict):
        await asyncio.sleep(0.05) # Tiny throttle for smooth UI
        await q.put(f"data: {json.dumps(data)}\n\n")

    async def run_ai():
        try:
            data = await _run_extraction_core(request, url=url, text=text, progress_callback=progress_callback)
            await q.put(f"data: {json.dumps({'event': 'final_result', 'extracted': data, 'error': None})}\n\n")
        except Exception as e:
            await q.put(f"data: {json.dumps({'event': 'error', 'msg': str(e)})}\n\n")
        finally:
            await q.put(None)

    ai_task = asyncio.create_task(run_ai())
    try:
        while True:
            item = await q.get()
            if item is None:
                break
            yield item
    finally:
        if not ai_task.done():
            ai_task.cancel()
            try:
                await ai_task
            except (asyncio.CancelledError, Exception):
                pass

@router.post("/extract-url-stream")
async def extract_url_stream(req: ExtractRequest, request: Request):
    return StreamingResponse(_extract_stream_generator(request, url=req.url), media_type="text/event-stream")

@router.post("/extract-text-stream")
async def extract_text_stream(req: TextExtractRequest, request: Request):
    return StreamingResponse(_extract_stream_generator(request, text=req.text), media_type="text/event-stream")


@router.post("/extract-text")
async def extract_from_text(req: TextExtractRequest, request: Request):
    """Direct, non-streaming extraction from text."""
    try:
        data = await _run_extraction_core(request, text=req.text)
        return {"extracted": data, "error": None}
    except Exception as e:
        return {"extracted": None, "error": str(e)}

@router.post("/extract-file-stream")
async def extract_file_stream(request: Request, file: UploadFile = File(...)):
    _check_ai_enabled()
    os.makedirs("tmp", exist_ok=True)
    temp_path = f"tmp/{file.filename}"
    
    async def file_gen():
        try:
            content = await file.read()
            with open(temp_path, "wb") as buffer:
                buffer.write(content)

            filename = file.filename or "unknown"
            ext = filename.split('.')[-1].lower() if '.' in filename else ''
            
            if ext == 'pdf':
                yield f"data: {json.dumps({'event': 'progress', 'msg': f'Parsing PDF: {filename}'})}\n\n"
                from langchain_community.document_loaders import PyPDFLoader
                loader = PyPDFLoader(temp_path)
                pages = await asyncio.to_thread(loader.load) # Run blocking load in thread
                text = "\n".join([page.page_content for page in pages])
            else:
                yield f"data: {json.dumps({'event': 'progress', 'msg': f'Reading File: {filename}'})}\n\n"
                try:
                    with open(temp_path, "r", encoding="utf-8") as f:
                        text = f.read()
                except UnicodeDecodeError:
                    raise Exception(f"Failed to read file as UTF-8. Non-text binaries are not supported.")

            async for event in _extract_stream_generator(request, text=text):
                yield event
        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'msg': str(e)})}\n\n"
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    return StreamingResponse(file_gen(), media_type="text/event-stream")

# Keep alias for backward compatibility
@router.post("/extract-pdf-stream")
async def extract_pdf_stream(request: Request, file: UploadFile = File(...)):
    return await extract_file_stream(request, file)

@router.post("/extract-file")
async def extract_from_file(request: Request, file: UploadFile = File(...)):
    """Direct, non-streaming extraction from file."""
    _check_ai_enabled()
    os.makedirs("tmp", exist_ok=True)
    temp_path = f"tmp/{file.filename}"
    try:
        content = await file.read()
        with open(temp_path, "wb") as buffer:
            buffer.write(content)
            
        filename = file.filename or "unknown"
        ext = filename.split('.')[-1].lower() if '.' in filename else ''
        
        if ext == 'pdf':
            from langchain_community.document_loaders import PyPDFLoader
            loader = PyPDFLoader(temp_path)
            pages = await asyncio.to_thread(loader.load)
            text = "\n".join([page.page_content for page in pages])
        else:
            try:
                with open(temp_path, "r", encoding="utf-8") as f:
                    text = f.read()
            except UnicodeDecodeError:
                raise Exception("Failed to read file as UTF-8.")

        data = await _run_extraction_core(request, text=text)
        return {"extracted": data, "error": None}
    except Exception as e:
        return {"extracted": None, "error": str(e)}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.post("/extract-pdf")
async def extract_from_pdf(request: Request, file: UploadFile = File(...)):
    return await extract_from_file(request, file)

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
