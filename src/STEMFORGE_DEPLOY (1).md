# StemForge — Full Stack Deployment Guide

**Stack:** Hugging Face Docker Space (backend) + Cloudflare Pages (frontend)  
**Backend URL:** `https://ryanrealaf-stemforge.hf.space`  
**Model:** Demucs `htdemucs` — 4-stem separation (vocals, drums, bass, other)

---

## Architecture Overview

```
Android Browser
      │
      │  POST /separate  (multipart — audio file)
      ▼
Cloudflare Pages
  stemforge.html
      │
      │  fetch() to HF Space
      ▼
HF Docker Space
  app.py + Demucs
      │
      │  subprocess → demucs.separate
      ▼
  stems.zip (vocals, drums, bass, other)
      │
      └──► FileResponse → browser download
```

No polling. No storage. One request in, one ZIP out.

---

## Part 1 — Backend (Hugging Face Space)

### 1.1 File Structure

Your HF Space repo must contain exactly these three files:

```
requirements.txt
Dockerfile
app.py
```

### 1.2 requirements.txt

```text
--extra-index-url https://download.pytorch.org/whl/cpu
torch==2.2.2+cpu
torchaudio==2.2.2+cpu
fastapi
uvicorn
python-multipart
numpy<2
soundfile
demucs
```

**Critical pins:**
- `torch==2.2.2+cpu` — CPU-only wheel, avoids CUDA dependencies bloating the image
- `numpy<2` — Demucs compiled extensions are incompatible with NumPy 2.x
- `soundfile` — provides the WAV write backend torchaudio needs on CPU

### 1.3 Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download model weights at build time
# Prevents cold-start timeout on first request
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs')"

COPY app.py .

RUN mkdir -p /app/workdir

EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
```

**Why pre-download the model:**  
HF free tier Docker spaces have no outbound internet at runtime. If the model isn't baked into the image at build time, the first request will hang and fail. The `RUN python -c` line forces the download during `docker build`.

**Model name must match exactly** between the Dockerfile pre-download and the `MODEL_NAME` variable in `app.py`. Both use `htdemucs`.

### 1.4 app.py

```python
import asyncio
import os
import uuid
import shutil
import zipfile
from pathlib import Path
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import subprocess

MODEL_NAME = "htdemucs"
BASE_DIR = Path(__file__).resolve().parent
WORK_DIR = BASE_DIR / "workdir"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(WORK_DIR, exist_ok=True)


@app.get("/")
async def health():
    return {"status": "ok"}


@app.post("/separate")
async def separate(file: UploadFile = File(...)):
    job_id = str(uuid.uuid4())
    job_dir = WORK_DIR / job_id
    os.makedirs(job_dir, exist_ok=True)

    # Sanitize filename — spaces break subprocess path handling
    safe_name = file.filename.replace(" ", "_")
    input_path = job_dir / safe_name

    with open(input_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    result = subprocess.run(
        [
            "python3", "-m", "demucs.separate",
            "-n", MODEL_NAME,
            "-d", "cpu",
            "-o", str(job_dir),
            str(input_path)
        ],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        shutil.rmtree(job_dir, ignore_errors=True)
        return JSONResponse(
            status_code=500,
            content={"error": result.stderr[-500:]}
        )

    # Locate output directory (Demucs nests: job_dir/htdemucs/filename/)
    stems_dir = None
    for root, dirs, files in os.walk(job_dir):
        if "vocals.wav" in files:
            stems_dir = Path(root)
            break

    if not stems_dir:
        shutil.rmtree(job_dir, ignore_errors=True)
        return JSONResponse(
            status_code=500,
            content={"error": "Stems not found after separation"}
        )

    # Package all four stems into a single ZIP
    zip_path = job_dir / "stems.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for stem in ["vocals.wav", "drums.wav", "bass.wav", "other.wav"]:
            stem_file = stems_dir / stem
            if stem_file.exists():
                zf.write(stem_file, stem)

    response = FileResponse(
        path=str(zip_path),
        media_type="application/zip",
        filename=f"stems_{safe_name.replace('.mp3','').replace('.wav','')}.zip"
    )

    # Clean up job directory 30s after response is sent
    asyncio.create_task(cleanup(job_dir))
    return response


async def cleanup(path: Path):
    await asyncio.sleep(30)
    shutil.rmtree(path, ignore_errors=True)
```

### 1.5 Deploying to HF Space

**Option A — HF Web UI**

1. Go to `huggingface.co/spaces/Ryanrealaf/stemforge`
2. Click **Files** tab
3. Upload or edit each of the three files directly in the browser editor
4. Every save triggers a rebuild automatically

**Option B — Git (recommended for repeatability)**

```bash
# Clone your space repo
git clone https://huggingface.co/spaces/Ryanrealaf/stemforge
cd stemforge

# Replace the three files, then:
git add requirements.txt Dockerfile app.py
git commit -m "fix: soundfile, numpy pin, streaming zip response"
git push
```

HF will rebuild the Docker image on every push to main. Build takes 4–8 minutes due to PyTorch wheel size.

### 1.6 Verifying the Backend

Once the Space shows **Running** status:

**Health check:**
```
GET https://ryanrealaf-stemforge.hf.space/
Expected: {"status": "ok"}
```

**Separation test (curl):**
```bash
curl -X POST https://ryanrealaf-stemforge.hf.space/separate \
  -F "file=@your_track.mp3" \
  --output stems.zip
```

If `stems.zip` downloads and contains `vocals.wav`, `drums.wav`, `bass.wav`, `other.wav` — the backend is fully operational.

### 1.7 HF Free Tier Constraints

| Constraint | Detail |
|---|---|
| CPU only | No GPU — Demucs runs in CPU mode. A 3-minute track takes ~3–5 min to process |
| Cold start | Space sleeps after inactivity. First request after sleep takes 30–60s to wake |
| Ephemeral storage | `/app/workdir` is wiped on restart — fine since we stream and clean up immediately |
| No outbound internet at runtime | All model weights must be baked into image at build time |
| Concurrent requests | Single worker — simultaneous requests will queue |

---

## Part 2 — Frontend (Cloudflare Pages)

### 2.1 The Frontend File

The file `stemforge.html` is the complete frontend. It is self-contained — no build step, no npm, no dependencies. One HTML file.

**The only line that connects it to the backend:**

```javascript
const API = 'https://ryanrealaf-stemforge.hf.space';
```

This is at the top of the `<script>` block. If you ever change your HF Space URL or move to a different backend, update this one constant.

### 2.2 Deploying to Cloudflare Pages

**Option A — Direct Upload (fastest)**

1. Go to `dash.cloudflare.com` → Pages → Create a project
2. Choose **Direct Upload**
3. Upload `stemforge.html`
4. Cloudflare assigns a `.pages.dev` URL instantly
5. Optionally connect your custom domain `buildwhilebleeding.com`

**Option B — GitHub Actions (recommended for updates)**

Create this repo structure:

```
stemforge-frontend/
├── stemforge.html
└── .github/
    └── workflows/
        └── deploy.yml
```

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}        # ENTRY POINT: Cloudflare API token
          accountId: ${{ secrets.CF_ACCOUNT_ID }}      # ENTRY POINT: Cloudflare account ID
          projectName: stemforge
          directory: .
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

Set `CF_API_TOKEN` and `CF_ACCOUNT_ID` in your GitHub repo's Settings → Secrets.

Get these values from:
- `CF_ACCOUNT_ID` — Cloudflare dashboard → right sidebar on any page
- `CF_API_TOKEN` — Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template

### 2.3 CORS

CORS is already configured wide open on the backend (`allow_origins=["*"]`). The frontend can call the HF Space from any domain including `.pages.dev` or your custom domain. No additional configuration needed.

### 2.4 Custom Domain

In Cloudflare Pages → your project → Custom Domains → Add domain.  
Point `stemforge.buildwhilebleeding.com` (or root) at the Pages project. Cloudflare handles SSL automatically.

---

## Part 3 — How the Frontend Calls the Backend

The entire integration is a single `fetch()` call in `stemforge.html`:

```javascript
const fd = new FormData();
fd.append('file', selectedFile);       // The audio file from the file input

const r = await fetch(`${API}/separate`, {
    method: 'POST',
    body: fd                           // Multipart form — no Content-Type header needed
});

// Response is the ZIP file as a binary blob
const blob = await r.blob();
const url = URL.createObjectURL(blob);

// Trigger browser download
const a = document.createElement('a');
a.href = url;
a.download = 'stems_' + filename + '.zip';
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
```

**There is no polling.** The `fetch()` stays open while Demucs runs (3–8 minutes). When separation finishes the response arrives as a ZIP and the download triggers immediately. The browser handles the wait natively.

**Timeout risk:** Default browser fetch timeout is typically 5 minutes. Demucs on a long track can approach this. If you encounter timeouts on tracks longer than 5 minutes, either switch to a polling model or use `htdemucs_ft` (fine-tuned, slightly faster on some material).

---

## Part 4 — End-to-End Test Checklist

Run through this after every backend change:

- [ ] HF Space status shows **Running** (not Building or Error)
- [ ] `GET /` returns `{"status": "ok"}`
- [ ] Frontend loads and shows **ONLINE** in the top right
- [ ] Upload a short MP3 (under 2 minutes for fast testing)
- [ ] SEPARATE button animates, VU meters run, progress bar advances
- [ ] After 3–5 minutes, ZIP downloads automatically
- [ ] ZIP contains: `vocals.wav`, `drums.wav`, `bass.wav`, `other.wav`
- [ ] Each WAV plays back in isolation with audible separation quality

---

## Part 5 — Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Frontend shows OFFLINE | HF Space is sleeping or errored | Check Space status page; wait for wake or rebuild |
| Upload succeeds but fetch hangs forever | Space crashed mid-job | Check HF Space logs tab for Python traceback |
| ZIP downloads but is empty | Demucs ran but `stems_dir` walk failed | Verify model name matches in Dockerfile and app.py |
| `RuntimeError: Numpy is not available` | NumPy 2.x installed | Add `numpy<2` to requirements.txt, rebuild |
| `Couldn't find appropriate backend` WAV error | soundfile missing | Add `soundfile` to requirements.txt, rebuild |
| CORS error in browser console | Backend CORS not configured | Verify `allow_origins=["*"]` in app.py middleware |
| First request after idle takes 60s | HF cold start | Normal — Space wakes on first request |
| Track over 5 min times out | Browser fetch timeout | Use shorter tracks, or implement polling fallback |

---

## Part 6 — File Reference

| File | Location | Purpose |
|---|---|---|
| `requirements.txt` | HF Space repo | Python dependencies with pinned versions |
| `Dockerfile` | HF Space repo | Container definition, model pre-download |
| `app.py` | HF Space repo | FastAPI server, Demucs runner, ZIP response |
| `stemforge.html` | Cloudflare Pages | Complete frontend, connects to `API` constant |
| `deploy.yml` | GitHub Actions | Auto-deploy frontend on push to main |

---

*StemForge — buildwhilebleeding.com*
