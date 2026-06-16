from datetime import date
from app.report_engine.pdf_generator import generate_pdf


def build_report(title: str, summary: str, data: dict) -> str:
    """
    Builds a simple PDF report using ReportLab.
    """

    today = date.today().isoformat()

    lines = []
    lines.append(f"Date: {today}")
    lines.append("")
    lines.append(summary)

    # Optional bullet points
    points = data.get("points")
    if points:
        lines.append("")
        lines.append("Key Points:")
        for p in points:
            lines.append(f"- {p}")

    filename = f"{title.replace(' ', '_').lower()}_{today}.pdf"
    return generate_pdf(title, lines, filename)
