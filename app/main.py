from fastapi import FastAPI
from app.core.config import settings
from app.core.logger import setup_logger
from app.api import nlp_routes, insight_routes, report_routes

setup_logger()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
)

# Register routes
app.include_router(nlp_routes.router)
app.include_router(insight_routes.router)
app.include_router(report_routes.router)


@app.get("/")
def health_check():
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running"
    }
