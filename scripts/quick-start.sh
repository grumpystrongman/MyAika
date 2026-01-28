#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "apps/server/.env" ]; then
  echo "Missing apps/server/.env. Copy apps/server/.env.example -> apps/server/.env and set OPENAI_API_KEY."
  exit 1
fi

if [ -f "apps/server/.env" ]; then
  if ! rg -q "^TTS_ENGINE=gptsovits" apps/server/.env; then
    echo "TTS_ENGINE is not set to gptsovits in apps/server/.env."
    echo "Update apps/server/.env to use GPT-SoVITS settings."
  fi
fi

echo "Starting GPT-SoVITS (requires GPTSOVITS_REPO_PATH and GPTSOVITS_PYTHON_BIN)..."
npm run gptsovits
