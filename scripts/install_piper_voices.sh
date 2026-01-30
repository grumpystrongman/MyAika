#!/usr/bin/env bash
set -euo pipefail

VOICES_DIR="${1:-apps/server/piper_voices}"
shift || true

VOICES=(
  "en_US-lessac-high"
  "en_US-lessac-medium"
  "en_US-ljspeech-high"
  "en_US-libritts-high"
  "en_US-amy-medium"
  "en_US-kristin-medium"
  "en_GB-southern_english_female-low"
  "en_GB-semaine-medium"
  "en_US-ryan-high"
  "en_US-joe-medium"
  "en_US-john-medium"
)

if [ "$#" -gt 0 ]; then
  VOICES=("$@")
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$REPO_ROOT/$VOICES_DIR"
mkdir -p "$TARGET_DIR"

for voice in "${VOICES[@]}"; do
  IFS='-' read -r locale name quality <<<"$voice"
  lang="${locale%%_*}"
  base="https://huggingface.co/rhasspy/piper-voices/resolve/main/${lang}/${locale}/${name}/${quality}/${voice}"
  onnx="$TARGET_DIR/$voice.onnx"
  json="$TARGET_DIR/$voice.onnx.json"
  if [ ! -f "$onnx" ]; then
    echo "Downloading $voice.onnx"
    curl -L "${base}.onnx?download=true" -o "$onnx"
  fi
  if [ ! -f "$json" ]; then
    echo "Downloading $voice.onnx.json"
    curl -L "${base}.onnx.json?download=true" -o "$json"
  fi
done

echo "Done. Voices downloaded to $TARGET_DIR"
