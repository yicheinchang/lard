from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx
import json
import asyncio
import os
import shutil
import logging
import io
from config import load_app_settings
from ai.logger import agnt_log

logger = logging.getLogger(__name__)

# --- Docling Global Singleton ---
_docling_converter = None

def get_docling_converter():
    """Lazy-initialize the Docling converter to avoid heavy load on module import."""
    global _docling_converter
    if _docling_converter is None:
        from docling.document_converter import DocumentConverter
        # Default initialization loads models from HuggingFace on first use
        _docling_converter = DocumentConverter()
    return _docling_converter

router = APIRouter(prefix="/api/ai", tags=["AI"])


def _check_ai_enabled():
    """Raise 403 if the AI assistant is disabled in settings."""
    s = load_app_settings()
    if not s.get("ai_enabled", True):
        raise HTTPException(status_code=403, detail="AI assistant is disabled. Enable it in Settings.")

def _find_job_posting(data):
    """Deep search for a JobPosting node in structured data dictionaries or lists."""
    if isinstance(data, dict):
        types = data.get("@type", "")
        is_job = "JobPosting" in (types if isinstance(types, list) else [str(types)])
        if is_job: 
            return data
        for v in data.values():
            res = _find_job_posting(v)
            if res: return res
    elif isinstance(data, list):
        for item in data:
            res = _find_job_posting(item)
            if res: return res
    return None

def _clean_json_ld(data: dict) -> dict:
    """Strip non-job nodes and metadata noise to keep the AI focused."""
    if not data: return {}
    
    # We focus on the JobPosting itself and its immediate children.
    # We remove @context and large sibling nodes like WebSite or BreadcrumbList.
    keys_to_keep = {
        "title", "description", "datePosted", "employmentType", "hiringOrganization",
        "jobLocation", "baseSalary", "salaryRange", "identifier", "validThrough",
        "responsibilities", "skills", "qualifications", "educationRequirements",
        "experienceRequirements", "occupationalCategory", "industry", "workHours",
        "@type", "@id"
    }
    
    cleaned = {k: v for k, v in data.items() if k in keys_to_keep or not k.startswith("@")}
    # Ensure @type is preserved
    if "@type" in data: cleaned["@type"] = data["@type"]
    
    return cleaned

def _extract_content(html: str, url: str | None = None) -> tuple[str, dict | None]:
    """
    State-of-the-art extraction using extruct (Metadata) and Docling (Clean Markdown).
    """
    # 1. Extract JSON-LD (Metadata Path)
    import extruct
    structured_data = None
    try:
        data = extruct.extract(html, base_url=url, syntaxes=['json-ld'])
        json_ld_blocks = data.get('json-ld', [])
        found_job = _find_job_posting(json_ld_blocks)
        if found_job:
            structured_data = _clean_json_ld(found_job)
    except Exception as e:
        logger.error(f"Extruct failed: {e}")

    # 2. Extract Markdown (Text Path)
    text = ""
    from routers.ai import get_docling_converter
    from docling.datamodel.base_models import DocumentStream
    
    # Use in-memory stream to avoid Disk I/O overhead
    content_stream = io.BytesIO(html.encode("utf-8"))
    doc_stream = DocumentStream(name="extraction.html", stream=content_stream)
    
    converter = get_docling_converter()
    result = converter.convert(doc_stream)
    text = result.document.export_to_markdown()

    # 3. Robust CSR/Noise Detection Heuristic
    # Most corporate Job Portals (BMS, etc.) use CSR/SPA. Even if they don't serve the full body,
    # they often serve several thousand characters of language selectors and navigation noise.
    # We detect this via Link Density (percentage of characters used in Markdown links).
    
    import re
    def _is_noisy_page(t: str) -> bool:
        t_clean = t.strip()
        if not t_clean: return True
        if len(t_clean) < 500: return True # Extremely short is always noise/loading
        
        # Calculate Link Density: characters inside [text](url) vs total characters
        # Matches Markdown links: [label](url)
        link_pattern = re.compile(r'\[.*?\]\(.*?\)')
        links = link_pattern.findall(t_clean)
        link_chars = sum(len(m) for m in links)
        density = link_chars / len(t_clean)
        
        # If text is < 6000 chars and > 60% links, it is likely navigation boilerplate (CSR noise)
        if len(t_clean) < 6000 and density > 0.6:
            return True
            
        return False

    if _is_noisy_page(text) and structured_data and structured_data.get("description"):
        logger.info(f"Noise/CSR detected (Length: {len(text)}, Link Density: {len(re.findall(r'\[.*?\]\(.*?\)', text))/len(text):.2f}). Falling back to JSON-LD description.")
        text = f"# Job Description (Extracted from Metadata)\n\n{structured_data['description']}"

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
                    await progress_callback({"event": "progress", "msg": "Extracting content and metadata..."})
                text, structured_data = _extract_content(resp.text, url=url)
                
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
                yield f"data: {json.dumps({'event': 'progress', 'msg': f'Extracting PDF text: {filename}'})}\n\n"
                from pypdf import PdfReader
                reader = PdfReader(temp_path)
                text = ""
                for page in reader.pages:
                    text += (page.extract_text() or "") + "\n"
            elif ext in ['docx', 'html']:
                label = ext.upper() if ext != 'html' else 'Web Page'
                yield f"data: {json.dumps({'event': 'progress', 'msg': f'Parsing {label} with Docling: {filename}'})}\n\n"
                
                # Execute Docling conversion in a thread to avoid blocking the event loop
                def run_docling():
                    from routers.ai import get_docling_converter
                    converter = get_docling_converter()
                    res = converter.convert(temp_path)
                    return res.document.export_to_markdown()
                
                text = await asyncio.to_thread(run_docling)
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
            from pypdf import PdfReader
            reader = PdfReader(temp_path)
            text = ""
            for page in reader.pages:
                text += (page.extract_text() or "") + "\n"
        elif ext in ['docx', 'html']:
            def run_docling():
                from routers.ai import get_docling_converter
                converter = get_docling_converter()
                res = converter.convert(temp_path)
                return res.document.export_to_markdown()
            text = await asyncio.to_thread(run_docling)
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
