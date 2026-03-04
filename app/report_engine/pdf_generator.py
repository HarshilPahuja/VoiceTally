from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from pathlib import Path


OUTPUT_DIR = Path("reports")
OUTPUT_DIR.mkdir(exist_ok=True)


def generate_pdf(title: str, lines: list[str], output_name: str) -> str:
    """
    Generates a simple PDF using ReportLab.
    """

    output_path = OUTPUT_DIR / output_name
    c = canvas.Canvas(str(output_path), pagesize=A4)

    width, height = A4
    y = height - 50

    # Title
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, y, title)
    y -= 40

    # Body
    c.setFont("Helvetica", 12)
    for line in lines:
        c.drawString(50, y, line)
        y -= 20
        if y < 50:
            c.showPage()
            y = height - 50

    c.save()
    return str(output_path)
