from fastapi import APIRouter
from app.shared.schemas import InsightRequest, InsightResponse
from app.insight_engine.insight_pipeline import run_insight_pipeline
from app.insight_engine.response_formatter import format_insight_response

router = APIRouter(prefix="/insights", tags=["Insights"])


@router.post("/generate", response_model=InsightResponse)
async def generate_insight(payload: InsightRequest):
    """
    Generates human-readable insights from structured business data.
    """

    # 1. Run insight logic (numbers → facts)
    insights = run_insight_pipeline(
        intent=payload.intent,
        data=payload.data
    )

    # 2. Convert facts → human-readable language
    text_response = format_insight_response(insights)

    return InsightResponse(
        text_response=text_response,
        metadata={
            "intent": payload.intent,
            "entities": payload.entities,
            "raw_insights": insights
        }
    )
