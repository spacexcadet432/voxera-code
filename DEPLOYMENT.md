# Voxera production deployment (Vercel + AWS EC2)

This document describes a **simple, maintainable** production layout:

| Layer | Role |
|--------|------|
| **Vercel** | Static / SSR TanStack Start frontend |
| **EC2 + Ubuntu** | FastAPI + Gunicorn/Uvicorn (HTTP + WebSocket) |
| **Nginx** | TLS termination, reverse proxy, WebSocket `Upgrade` |
| **Deepgram / OpenAI / ElevenLabs** | Called from the EC2 backend only |

Do **not** expose provider API keys in the Vercel build. For production, set keys on the server and turn on `VOXERA_DISALLOW_CLIENT_KEYS=true`.

---

## 1. Architecture (data flow)

1. Browser loads the app from **Vercel** (HTTPS).
2. Browser calls `https://api.yourdomain.com/api/*` and opens `wss://api.yourdomain.com/ws/voice` on **your EC2 public hostname** (via Nginx → Gunicorn → FastAPI).
3. Mic audio is **PCM16 16 kHz** over the WebSocket; the backend streams to Deepgram, then OpenAI, then ElevenLabs; JSON + MP3 events return to the client.

**Environment separation**

| Variable | Where | Purpose |
|----------|--------|---------|
| `VITE_VOXERA_BACKEND_URL` | Vercel | HTTPS base URL of the API (e.g. `https://api.example.com`) |
| `VITE_VOXERA_WS_URL` | Vercel (optional) | Override WebSocket URL if it differs from derived `wss://` |
| `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY` | EC2 `/etc/voxera/voxera.env` | Production keys (recommended) |
| `VOXERA_CORS_ORIGINS` | EC2 | Must include your Vercel origin(s), comma-separated |
| `VOXERA_DISALLOW_CLIENT_KEYS` | EC2 | `true` to ignore browser-supplied keys |

---

## 2. EC2 (Ubuntu) — first-time setup

### 2.1 Instance

- **AMI**: Ubuntu 22.04 or 24.04 LTS  
- **Security group inbound**
  - `22/tcp` — SSH (restrict to your IP)
  - `80/tcp`, `443/tcp` — HTTP/HTTPS from `0.0.0.0/0` (or CloudFront only, if you add it later)
- **Outbound**: allow all (default) so the instance can reach Deepgram/OpenAI/ElevenLabs.

### 2.2 System packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.12 python3.12-venv python3-pip nginx certbot python3-certbot-nginx git
```

(Use your Ubuntu’s Python 3 if not 3.12; `python3 --version` should be ≥ 3.11.)

### 2.3 Deploy application tree

```bash
sudo mkdir -p /opt/voxera
sudo chown -R ubuntu:ubuntu /opt/voxera
cd /opt/voxera
git clone <YOUR_REPO_URL> repo
ln -sfn /opt/voxera/repo/backend /opt/voxera/backend
cd /opt/voxera/backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 2.4 Production environment file

```bash
sudo mkdir -p /etc/voxera
sudo nano /etc/voxera/voxera.env
```

Minimal example (adjust hostnames and secrets):

```env
VOXERA_CORS_ORIGINS=https://your-app.vercel.app
VOXERA_CORS_ORIGIN_REGEX=https://.*\.vercel\.app$
VOXERA_DISALLOW_CLIENT_KEYS=true
VOXERA_ALLOWED_HOSTS=api.example.com

OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...

VOXERA_WS_IDLE_TIMEOUT_SECONDS=300
VOXERA_LOG_LEVEL=INFO
```

- **`VOXERA_CORS_ORIGINS`**: required for browser calls from Vercel.  
- **`VOXERA_DISALLOW_CLIENT_KEYS=true`**: verify endpoints and WebSocket ignore body keys (recommended).  
- **`VOXERA_WS_IDLE_TIMEOUT_SECONDS`**: optional; closes idle sockets after N seconds with **no** text/binary from client (PCM + ping count as traffic). Use `0` to disable.

```bash
sudo chmod 600 /etc/voxera/voxera.env
sudo chown root:root /etc/voxera/voxera.env
```

### 2.5 Systemd service

Copy the unit from the repo and enable it:

```bash
sudo cp /opt/voxera/repo/deploy/ec2/systemd/voxera-voice.service /etc/systemd/system/voxera-voice.service
# Edit paths if your WorkingDirectory differs
sudo systemctl daemon-reload
sudo systemctl enable --now voxera-voice.service
sudo systemctl status voxera-voice.service
```

**Why `-w 1` (single Gunicorn worker)?** WebSocket sessions are in-process memory. Multiple workers break sticky routing unless you add Redis/session affinity. Keep **one worker** per instance; scale the instance size first.

### 2.6 Nginx + TLS

```bash
sudo cp /opt/voxera/repo/deploy/ec2/nginx/voxera.conf /etc/nginx/sites-available/voxera
sudo nano /etc/nginx/sites-available/voxera   # set server_name + cert paths
sudo ln -sfn /etc/nginx/sites-available/voxera /etc/nginx/sites-enabled/voxera
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.example.com
```

Critical directives for WebSockets are already in `voxera.conf`: `Upgrade`, `Connection "upgrade"`, and long `proxy_read_timeout` on `/ws/`.

---

## 3. Vercel (frontend)

### 3.1 Project root

Import the **`voxera-frontend`** directory (or monorepo with that as root) in Vercel.

### 3.2 Environment variables (Vercel → Settings → Environment Variables)

| Name | Production value |
|------|-------------------|
| `VITE_VOXERA_BACKEND_URL` | `https://api.example.com` (no trailing slash) |

Optional:

| Name | When to use |
|------|-------------|
| `VITE_VOXERA_WS_URL` | If the WebSocket must use a different host/path than `wss://api.example.com/ws/voice` |

**Mixed content:** the frontend already upgrades `http://` API URLs to `https://` when the page is served over HTTPS in production (`src/config/backend.ts`). Prefer setting `VITE_VOXERA_BACKEND_URL` to **https** explicitly.

### 3.3 Build

Use the same `npm run build` / framework preset as local. No UI changes are required for deployment.

---

## 4. Smoke tests

From your laptop:

```bash
curl -sS https://api.example.com/health
curl -sS https://api.example.com/api/voice-capabilities
```

From the browser (Vercel app): open API Configuration → **Test** (hits `/api/verify/*`). Then **Start** and speak.

---

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| CORS errors in console | `VOXERA_CORS_ORIGINS` missing Vercel URL | Add exact origin `https://your-app.vercel.app` |
| WebSocket fails immediately | Nginx missing `Upgrade` headers, or wrong path | Use provided `voxera.conf`; path is `/ws/voice` |
| 403 / empty from API | `VOXERA_ALLOWED_HOSTS` mismatch | Set to public hostname or leave empty while debugging |
| Verify works but voice fails | Keys only on client while `VOXERA_DISALLOW_CLIENT_KEYS=true` | Set all three keys in `/etc/voxera/voxera.env` |
| Voice drops after ~N min | Idle timeout | Increase `VOXERA_WS_IDLE_TIMEOUT_SECONDS` or set `0` |
| `wss://` blocked | TLS not on Nginx | Terminate TLS on Nginx; do not expose plain HTTP to browsers |

---

## 6. File reference (this repo)

| Path | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app, CORS, trusted hosts |
| `backend/app/websocket/voice.py` | `/ws/voice`, idle watchdog, init |
| `backend/app/routes/verify.py` | Key verification (respects `VOXERA_DISALLOW_CLIENT_KEYS`) |
| `backend/app/routes/public.py` | `GET /api/voice-capabilities` |
| `deploy/ec2/nginx/voxera.conf` | Nginx template |
| `deploy/ec2/systemd/voxera-voice.service` | systemd unit |

---

## 7. Operational notes

- **Logs**: `journalctl -u voxera-voice -f`  
- **Deploy new code**: `git pull` in `/opt/voxera/repo`, then `sudo systemctl restart voxera-voice`  
- **Secrets rotation**: edit `/etc/voxera/voxera.env`, restart service  
- **Backups**: snapshot EC2 or automate AMI; no DB in this stack  

This setup is intentionally minimal: one EC2, one Nginx, one Python process group, HTTPS + WSS end-to-end.
