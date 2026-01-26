import os
import sys
import traceback
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from dotenv import load_dotenv

# Force UTF-8 for console output to avoid Windows cp1252 errors
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("PYTHONUTF8", "1")
try:
  sys.stdout.reconfigure(encoding="utf-8")
  sys.stderr.reconfigure(encoding="utf-8")
except Exception:
  pass

# Load .env from apps/server if present
repo_root = Path(__file__).resolve().parents[1]
load_dotenv(str(repo_root / "apps" / "server" / ".env"))
import numpy as np
import soundfile as sf


class TTSRequest(BaseModel):
  text: str
  output_path: str
  ref_wav_path: str | None = None
  prompt_text: str | None = None
  language: str = "en"


app = FastAPI()
app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)
_gptsovits_inf = None


def load_gptsovits():
  global _gptsovits_inf
  if _gptsovits_inf is not None:
    return _gptsovits_inf
  repo = os.environ.get("GPTSOVITS_REPO_PATH")
  if not repo:
    raise RuntimeError("GPTSOVITS_REPO_PATH not set")
  repo_path = Path(repo)
  if not repo_path.exists():
    raise RuntimeError("GPTSOVITS_REPO_PATH not found")
  pretrained_dir = repo_path / "GPT_SoVITS" / "pretrained_models"
  if not pretrained_dir.exists():
    raise RuntimeError("missing_pretrained_models_dir")
  pretrained_files = [p for p in pretrained_dir.rglob("*") if p.is_file() and p.name != ".gitignore"]
  if len(pretrained_files) == 0:
    raise RuntimeError("missing_pretrained_models_files")
  os.chdir(str(repo_path))
  repo_root = str(repo_path)
  gpt_sovits_pkg = str(repo_path / "GPT_SoVITS")
  if repo_root not in sys.path:
    sys.path.insert(0, repo_root)
  if gpt_sovits_pkg not in sys.path:
    sys.path.insert(0, gpt_sovits_pkg)
  try:
    from GPT_SoVITS import inference_webui as inf
  except Exception as e:
    raise RuntimeError(f"failed_import_gptsovits: {e}")
  _gptsovits_inf = inf
  return _gptsovits_inf


@app.post("/tts")
def tts(req: TTSRequest):
  if not req.text:
    raise HTTPException(400, "text_required")
  if not req.output_path:
    raise HTTPException(400, "output_path_required")

  try:
    inf = load_gptsovits()
  except Exception as e:
    detail = f"{e}"
    tb = traceback.format_exc()
    raise HTTPException(500, detail=f"gptsovits_load_failed: {detail}\n{tb}")

  out_path = Path(req.output_path)
  out_path.parent.mkdir(parents=True, exist_ok=True)

  # Minimal call: GPT-SoVITS get_tts_wav typically returns generator of audio chunks
  try:
    wav_generator = inf.get_tts_wav(
      ref_wav_path=req.ref_wav_path,
      prompt_text=req.prompt_text or "",
      prompt_language=req.language,
      text=req.text,
      text_language=req.language,
      top_k=5,
      top_p=0.8,
      temperature=0.8
    )
    first = None
    for chunk in wav_generator:
      first = chunk
      break
    if first is None:
      raise RuntimeError("gptsovits_no_audio_returned")

    if isinstance(first, (bytes, bytearray)):
      with open(out_path, "wb") as f:
        f.write(first)
    elif isinstance(first, tuple) and len(first) >= 2:
      sr, audio = first[0], first[1]
      if isinstance(audio, (bytes, bytearray)):
        with open(out_path, "wb") as f:
          f.write(audio)
      else:
        audio_np = np.asarray(audio, dtype=np.float32)
        sf.write(out_path, audio_np, int(sr))
    else:
      raise RuntimeError(f"gptsovits_unhandled_output: {type(first)}")
  except Exception as e:
    detail = f"{e}"
    tb = traceback.format_exc()
    raise HTTPException(500, detail=f"gptsovits_inference_failed: {detail}\n{tb}")

  return {"ok": True, "output_path": str(out_path)}


if __name__ == "__main__":
  port = int(os.environ.get("GPTSOVITS_PORT", "9881"))
  uvicorn.run(app, host="0.0.0.0", port=port)
