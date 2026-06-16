from fastapi import APIRouter
from app.shared.schemas import ReportRequest, ReportResponse
from app.report_engine.report_builder import build_report

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.post("/generate-pdf", response_model=ReportResponse)
async def generate_pdf(payload: ReportRequest):
    pdf_path = build_report(
        title=payload.title,
        summary=payload.summary,
        data=payload.data
    )

    return ReportResponse(pdf_path=pdf_path)
