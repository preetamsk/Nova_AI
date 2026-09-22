from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from chat import router
from services.history_service import initialize_database
from settings import get_settings, validate_production_settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    validate_production_settings()
    initialize_database()
    yield


settings = get_settings()
app = FastAPI(title="NOVA AI API", docs_url=None if settings.is_production else "/docs", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.frontend_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "x-nova-session", "authorization"],
    expose_headers=["x-nova-session"],
    max_age=600,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(self)"
    response.headers["Cache-Control"] = response.headers.get("Cache-Control", "no-store")
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


app.include_router(router)


@app.get("/")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "NOVA AI API"}
