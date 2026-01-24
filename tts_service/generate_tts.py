import argparse
import json
import os
import subprocess
import sys
import tempfile
import wave


def wav_meta(path):
    with wave.open(path, "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        duration = frames / float(rate) if rate else 0
        return {"sample_rate": rate, "duration": duration}


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        payload = json.load(f)

    text = payload.get("text") or ""
    output_path = payload.get("output_path")
    model_id = payload.get("model_id") or os.environ.get(
        "TTS_MODEL_ID",
        "tts_models/multilingual/multi-dataset/xtts_v2",
    )
    fallback_model = os.environ.get("TTS_FALLBACK_MODEL_ID", "tts_models/en/ljspeech/tacotron2-DDC")
    fmt = payload.get("format", "wav")
    voice_path = payload.get("voice_path")

    if not output_path:
        raise SystemExit("output_path_required")

    try:
        from TTS.api import TTS
    except Exception as e:
        print(json.dumps({"error": "missing_tts_dependency", "detail": str(e)}))
        return 2

    warnings = []

    def synth(model_name, out_path):
        tts = TTS(model_name=model_name, progress_bar=False, gpu=False)
        if voice_path:
            tts.tts_to_file(text=text, file_path=out_path, speaker_wav=voice_path, language="en")
        else:
            tts.tts_to_file(text=text, file_path=out_path)

    if fmt == "mp3":
        if os.environ.get("TTS_ENABLE_MP3") != "1":
            print(json.dumps({"error": "mp3_not_enabled"}))
            return 3

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            wav_path = tmp.name
        try:
            try:
                synth(model_id, wav_path)
            except Exception:
                warnings.append("model_fallback_used")
                synth(fallback_model, wav_path)

            cmd = ["ffmpeg", "-y", "-i", wav_path, output_path]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode != 0:
                print(json.dumps({"error": "ffmpeg_failed", "detail": res.stderr}))
                return 4
        finally:
            if os.path.exists(wav_path):
                os.unlink(wav_path)
        meta = {}
    else:
        try:
            synth(model_id, output_path)
        except Exception:
            warnings.append("model_fallback_used")
            synth(fallback_model, output_path)
        meta = wav_meta(output_path)

    meta.update({"warnings": warnings})
    print(json.dumps(meta))
    return 0


if __name__ == "__main__":
    sys.exit(run())
