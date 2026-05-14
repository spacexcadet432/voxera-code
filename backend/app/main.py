from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.routes.public import router as public_router
from app.routes.verify import router as verify_router
from app.state.settings import get_settings
from app.websocket.voice import router as voice_router

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.voxera_log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("voxera")

app = FastAPI(title="Voxera Voice Backend", version="1.0.0")

hosts = [h.strip() for h in settings.voxera_allowed_hosts.split(",") if h.strip()]
if hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts)

origins = [o.strip() for o in settings.voxera_cors_origins.split(",") if o.strip()]
if not origins:
    origins = ["*"]

cors_regex = (settings.voxera_cors_origin_regex or "").strip() or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=cors_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(public_router)
app.include_router(verify_router)
app.include_router(voice_router)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "service": "voxera-backend", "ts": int(time.time())}


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
