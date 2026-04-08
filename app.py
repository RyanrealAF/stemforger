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
