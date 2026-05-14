# Voxera backend (FastAPI)

Python service that powers the browser voice loop: **microphone PCM → Deepgram (live STT) → OpenAI (streaming chat) → ElevenLabs (MP3 TTS) → browser playback**, with **real latency metrics** and **orb/transcript events** over a single WebSocket.

## Requirements

- Python 3.11+
- API keys for **OpenAI**, **Deepgram**, and **ElevenLabs** — either in the browser (dev) or on the server via environment variables (recommended for production; see repo `DEPLOYMENT.md`).

## Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env` if you need custom CORS origins or model defaults.

## Run (development)

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check: `GET http://127.0.0.1:8000/health`

## Frontend wiring

In `voxera-frontend`, set:

```env
VITE_VOXERA_BACKEND_URL=http://127.0.0.1:8000
```

In dev, the app defaults to `http://127.0.0.1:8000` if this variable is omitted. Production builds should set it explicitly (HTTPS URL of your API).

## Production (Vercel + AWS EC2)

See the repository root **[DEPLOYMENT.md](../DEPLOYMENT.md)** for Nginx, systemd, Gunicorn, TLS, CORS, and environment variable setup.

The UI connects to `ws(s)://<host>/ws/voice` derived from that base URL.

## Architecture

- `app/main.py` — FastAPI app, CORS, routers
- `app/routes/verify.py` — `POST /api/verify/{openai,deepgram,elevenlabs}` for real key checks
- `app/websocket/voice.py` — `/ws/voice` session: init JSON + binary PCM16 mono 16kHz frames
- `app/services/*` — provider integrations
- `app/state/settings.py` — env-backed defaults (OpenAI model, Deepgram model, default ElevenLabs voice id)

## WebSocket protocol (summary)

**Client → server (text JSON)**

- `{ "type": "init", "keys": { ... }, "aiSettings": { ... } }` — required before audio
- `{ "type": "ping" }` — keepalive
- `{ "type": "reset_context" }` — clears server-side conversation memory

**Client → server (binary)**

- Raw **little-endian PCM16**, mono, **16000 Hz** (the frontend downsamples microphone audio to this format).

**Server → client (text JSON)**

- `ready`, `error`, `pong`
- `interim` — live partial transcript
- `orb` — `idle | listening | processing | thinking | speaking`
- `user_turn` / `assistant_turn` / `assistant_delta`
- `metrics` — `{ stt, llm, tts, total }` in milliseconds (measured server-side)
- `audio` — `{ "format": "mp3", "base64": "..." }` assistant speech

## Production notes

- Prefer **HTTPS/WSS** and restrict `VOXERA_CORS_ORIGINS` to your deployed web origin.
- Keys are held **in memory for the WebSocket session** only; they are not written to disk by this service.
- Tune `DEEPGRAM_MODEL`, `OPENAI_MODEL`, and `ELEVENLABS_DEFAULT_VOICE_ID` in `.env` for cost/latency tradeoffs.
