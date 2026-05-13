from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.verify import router as verify_router
from app.state.settings import get_settings
from app.websocket.voice import router as voice_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voxera")

app = FastAPI(title="Voxera Voice Backend", version="1.0.0")

settings = get_settings()
origins = [o.strip() for o in settings.voxera_cors_origins.split(",") if o.strip()]
if not origins:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(verify_router)
app.include_router(voice_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
