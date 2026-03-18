from pydantic import BaseModel
from typing import Optional, Dict, Any


# ---------- NLP ----------

class NLPRequest(BaseModel):
    query: str


class NLPResponse(BaseModel):
    intent: Optional[str]
    entities: Dict[str, Any]
    original_query: str
    language: Optional[str] = None
    error: Optional[str] = None
    answer: Optional[str] = None


# ---------- Insights ----------

class InsightRequest(BaseModel):
    intent: str
    data: Dict[str, Any]
    entities: Dict[str, Any]


class InsightResponse(BaseModel):
    text_response: str
    metadata: Optional[Dict[str, Any]] = None


# ---------- Reports ----------

class ReportRequest(BaseModel):
    title: str
    summary: str
    data: Dict[str, Any]


class ReportResponse(BaseModel):
    pdf_path: str
