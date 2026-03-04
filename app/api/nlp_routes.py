from fastapi import APIRouter
from app.shared.schemas import NLPRequest, NLPResponse
from app.nlp_engine.query_builder import build_structured_query

router = APIRouter(prefix="/nlp", tags=["NLP"])


@router.post("/parse-query", response_model=NLPResponse)
async def parse_query(payload: NLPRequest):
    """
    Parses user query (text) and returns structured intent and entities.
    """
    result = build_structured_query(payload.query)
    return result
