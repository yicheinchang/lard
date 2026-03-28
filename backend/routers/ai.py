from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ai.graph import agent_app
import httpx
from bs4 import BeautifulSoup

router = APIRouter(prefix="/api/ai", tags=["AI"])

class ExtractRequest(BaseModel):
    url: str

class TextExtractRequest(BaseModel):
    text: str

@router.post("/extract-url")
async def extract_from_url(req: ExtractRequest):
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(req.url, timeout=10)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, 'html.parser')
            text = soup.get_text(separator=' ', strip=True)
            text = text[:8000] # naive truncation
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
            
    result = agent_app.invoke({"text": text})
    return {"extracted": result["extracted_data"], "error": result["error"]}

@router.post("/extract-text")
def extract_from_text(req: TextExtractRequest):
    result = agent_app.invoke({"text": req.text})
    return {"extracted": result["extracted_data"], "error": result["error"]}
