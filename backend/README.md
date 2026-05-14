# Voxera backend

FastAPI service: **PCM (16 kHz mono) → Deepgram → OpenAI → ElevenLabs → JSON + MP3** over **`/ws/voice`**.

## Run locally

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # or Windows: .\.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Windows: copy .env.example .env
python main.py
```

Defaults: **`http://127.0.0.1:8000`**, WebSocket at **`ws://127.0.0.1:8000/ws/voice`**.

Equivalent:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Full setup, keys, LAN testing, and architecture: see the repository **[README.md](../README.md)** in the project root.
