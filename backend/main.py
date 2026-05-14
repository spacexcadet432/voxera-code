"""
Local entrypoint for the Voxera FastAPI backend.

From the `backend/` directory (with venv activated):

    pip install -r requirements.txt
    copy .env.example .env   # then add your API keys
    python main.py

Listens on 0.0.0.0:8000 by default so other devices on your LAN can reach the API
when you point the frontend at your machine's IP (see repo README).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("VOXERA_HOST", "0.0.0.0")
    port = int(os.environ.get("VOXERA_PORT", "8000"))
    reload = os.environ.get("VOXERA_RELOAD", "1").lower() not in ("0", "false", "no")

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=reload,
        ws_ping_interval=20.0,
        ws_ping_timeout=20.0,
    )
