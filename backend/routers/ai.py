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
import html
import re
from config import load_app_settings, settings
from ai.logger import agnt_log
from ai.status import is_ai_ready, wait_for_ai_ready

logger = logging.getLogger(__name__)

# --- Docling Global Singleton ---
_docling_converter = None

def get_docling_converter():
    """Lazy-initialize the Docling converter to avoid heavy load on module import."""
    global _docling_converter
    if _docling_converter is None:
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import ConvertPipelineOptions, AcceleratorOptions
        from docling.document_converter import DocumentConverter, HTMLFormatOption, WordFormatOption
        
        # Correct base for all conversion pipelines
        pipeline_options = ConvertPipelineOptions()
        pipeline_options.accelerator_options = AcceleratorOptions(device="cpu", num_threads=4)
        
        _docling_converter = DocumentConverter(
            allowed_formats=[InputFormat.HTML, InputFormat.DOCX],
            format_options={
                InputFormat.HTML: HTMLFormatOption(pipeline_options=pipeline_options),
                InputFormat.DOCX: WordFormatOption(pipeline_options=pipeline_options)
            }
        )
    return _docling_converter

router = APIRouter(prefix="/api/ai", tags=["AI"])


def _check_ai_enabled():
    """Raise 403 if the AI assistant is disabled in settings."""
    s = load_app_settings()
    if not s.get("ai_enabled", True):
        raise HTTPException(status_code=403, detail="AI assistant is disabled. Enable it in Settings.")

async def _ensure_ai_ready(progress_callback=None):
    """Wait for AI libraries to be fully loaded if they aren't ready yet."""
    if not is_ai_ready():
        msg = "Initializing AI libraries (First start takes 5-10 mins). Please wait..."
        logger.info(msg)
        if progress_callback:
            await progress_callback({"event": "progress", "msg": msg})
        
        # Block until ready (run wait in thread to avoid blocking loop)
        await asyncio.to_thread(wait_for_ai_ready)
        
        if progress_callback:
            await progress_callback({"event": "progress", "msg": "AI Libraries Loaded! Proceeding..."})

@router.get("/status")
async def get_ai_status():
    """Check if AI libraries are ready."""
    return {"ready": is_ai_ready()}

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

def _normalize_metadata(raw_extruct_data: dict) -> tuple[dict, bool]:
    """
    Standardizes disparate metadata syntaxes (Microdata, JSON-LD, OG) 
    into a flat, predictable schema for the AI agents.
    Returns (normalized_dict, is_official_json_ld).
    """
    is_official = False
    schema_map = {
        # Mapping common properties to internal names
        "jobTitle": "title",
        "hiringOrganization": "company",
        "jobLocation": "location",
        "baseSalary": "salary_range",
        "identifier": "job_id",
        "datePosted": "posted_date",
        "validThrough": "deadline",
        "description": "description",
        "industry": "industry",
        "employmentType": "employment_type",
        "job_type": "employment_type"
    }
    
    final_data = {}
    
    # Priority: First found valid value wins for each normalized key
    def _is_valid(val):
        if not val: return False
        s_val = str(val).strip()
        return s_val and s_val.lower() != "none"

    def _clean_val(val):
        """Decode HTML entities and strip CSS noise from strings."""
        if not isinstance(val, str):
            return val
        # 1. Decode entities (&lt; -> <)
        val = html.unescape(val)
        # 2. Strip CSS attributes but keep semantic tags (e.g. <p style="..."> -> <p>)
        # This preserves structure for the LLM while saving tokens
        val = re.sub(r'(<[a-zA-Z0-9]+)\s+[^>]*>', r'\1>', val)
        return val

    # Gather all properties from all syntax types
    all_props = {}
    
    # 1. Process Microdata (often fragmented on corporate sites)
    for node in raw_extruct_data.get('microdata', []):
        for k, v in node.get('properties', {}).items():
            if _is_valid(v):
                if k not in all_props: all_props[k] = _clean_val(v)
                
    # 2. Process JSON-LD (usually most reliable)
    for node in raw_extruct_data.get('json-ld', []):
        if isinstance(node, dict):
            # Check if this is an official JobPosting
            types = node.get("@type", "")
            if "JobPosting" in (types if isinstance(types, list) else [str(types)]):
                is_official = True
            
            # Flatten @graph if present
            if "@graph" in node:
                for g_node in node["@graph"]:
                    for k, v in g_node.items():
                        if _is_valid(v):
                            if k not in all_props: all_props[k] = _clean_val(v)
            else:
                for k, v in node.items():
                    if _is_valid(v):
                        if k not in all_props: all_props[k] = _clean_val(v)

    # 3. Process OpenGraph
    for node in raw_extruct_data.get('opengraph', []):
        if isinstance(node, dict) and "properties" in node:
            props = node["properties"]
            if isinstance(props, list):
                for k, v in props:
                    clean_k = k.replace("og:", "")
                    if _is_valid(v):
                        if clean_k not in all_props: all_props[clean_k] = _clean_val(v)

    # Now map gathered props to final_data
    for k, v in all_props.items():
        if k == "hiringOrganization" and isinstance(v, dict):
            final_data["company"] = v.get("name") or v.get("legalName")
        elif k == "jobLocation" and isinstance(v, dict):
            address = v.get("address", v)
            if isinstance(address, dict):
                final_data["location"] = address.get("addressLocality") or address.get("addressRegion")
            else:
                final_data["location"] = address
        elif k == "identifier" and isinstance(v, dict):
            final_data["job_id"] = v.get("value")
        elif k in schema_map:
            final_data[schema_map[k]] = v
        elif k in ["title", "description", "url", "company", "location"]:
            if k not in final_data or not final_data[k]:
                final_data[k] = v
        else:
            if k not in final_data:
                final_data[k] = v

    return final_data, is_official

def _extract_content(html: str, url: str | None = None) -> tuple[str, dict | None, bool]:
    """
    Tiered Extraction Strategy:
    Tier 1: Clean Body (Docling)
    Tier 2: Body + Furniture (Docling scale-up)
    Tier 3: Verbatim Metadata Swap (SuccessFactors/CSR Pattern)
    Returns (text, structured_data, is_official_json_ld).
    """
    # 1. Metadata Harvesting
    import extruct
    extruct_data = {}
    try:
        extruct_data = extruct.extract(html, base_url=url, syntaxes=['json-ld', 'microdata', 'opengraph', 'rdfa'])
    except Exception as e:
        logger.error(f"Extruct failed: {e}")
    
    normalized_meta, is_official = _normalize_metadata(extruct_data)
    
    # 2. Docling Extraction
    # Tier 1 Attempt
    converter = get_docling_converter()
    result = converter.convert(url)
    text = result.document.export_to_markdown()
    
    # Tier 2 Fallback Heuristic
    html_len = len(html)
    text_len = len(text)
    content_ratio = (text_len / html_len) * 100 if html_len > 0 else 0
    
    import re
    links = len(re.findall(r"\[.*?\]\(.*?\)", text))
    words = len(text.split())
    link_density = (links / words) * 100 if words > 0 else 0
    
    if content_ratio < 2.0 or link_density > 60.0:
        # If Tier 1 looks like nav noise, we scale up or just accept it (Docling is usually smart)
        pass

    # Tier 3: Verbatim Priority Rule
    meta_desc = normalized_meta.get("description", "")
    if isinstance(meta_desc, str) and len(meta_desc) > 1000:
        if len(meta_desc) > (len(text) * 0.8):
             logger.info(f"Verbatim Priority Swap: Meta ({len(meta_desc)}) > Docling ({len(text)})")
             text = meta_desc

    return text, normalized_meta, is_official

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
    await _ensure_ai_ready(progress_callback)
    
    structured_data = None
    if url:
        if progress_callback:
            await progress_callback({"event": "progress", "msg": f"Reading URL: {url[:60]}..."})
        try:
            # Add browser-standard headers to avoid being blocked by anti-bot systems
            headers = {
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate",
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Cache-Control": "max-age=0",
            }
            async with httpx.AsyncClient(follow_redirects=True) as client:
                resp = await client.get(url, timeout=20, headers=headers)
                resp.raise_for_status()
                if progress_callback:
                    await progress_callback({"event": "progress", "msg": "Extracting content and metadata..."})
                text, structured_data, is_official = _extract_content(resp.text, url=url)
                
                # Preprocess and log snippet
                text = _preprocess_text(text)
                snippet = text[:100]
                if progress_callback:
                    await progress_callback({"event": "progress", "msg": f"Processing text: {snippet[:60]}..."})
                
                # Log cleaned text for manual investigation
                try:
                    os.makedirs(settings.TMP_DIR, exist_ok=True)
                    with open(os.path.join(settings.TMP_DIR, "last_extracted_content.txt"), "w", encoding="utf-8") as f:
                        f.write(text)
                except Exception as log_err:
                    print(f"Failed to log extracted content: {log_err}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch content from URL: {str(e)}")
            
    elif text:
        if progress_callback:
            await progress_callback({"event": "progress", "msg": "Processing input text..."})
        text = _preprocess_text(text)
        structured_data = None
        is_official = False
        # Log input text for manual investigation
        try:
            os.makedirs(settings.TMP_DIR, exist_ok=True)
            with open(os.path.join(settings.TMP_DIR, "last_extracted_content.txt"), "w", encoding="utf-8") as f:
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
        "is_official_json_ld": is_official,
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
            try:
                # Wait for data from the queue with a 15s timeout to send heartbeats
                # This prevents BodyTimeoutError in proxies (like Next.js's undici fetch)
                item = await asyncio.wait_for(q.get(), timeout=15.0)
                if item is None:
                    break
                yield item
            except asyncio.TimeoutError:
                # Send SSE comment as heartbeat to keep the connection alive
                yield ": heartbeat\n\n"
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
async def chat_with_assistant(req: ChatRequest):
    _check_ai_enabled()
    await _ensure_ai_ready()
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
