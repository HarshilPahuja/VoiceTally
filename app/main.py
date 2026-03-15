import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logger import setup_logger
from app.api import nlp_routes, insight_routes, report_routes

setup_logger()

# Ensure reports directory exists before mounting
os.makedirs("reports", exist_ok=True)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
)

# Enable CORS for the Chrome Extension and Dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount reports for downloading
app.mount("/downloads", StaticFiles(directory="reports"), name="downloads")

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
