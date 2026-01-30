#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:-data/live2d_import}"
TARGET_DIR="${2:-apps/web/public/assets/aika/live2d}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/$SOURCE_DIR"
DST="$REPO_ROOT/$TARGET_DIR"
TMP="$REPO_ROOT/data/_live2d_tmp"

mkdir -p "$SRC" "$DST" "$TMP"

shopt -s nullglob
ZIPS=("$SRC"/*.zip)
if [ ${#ZIPS[@]} -eq 0 ]; then
  echo "No zip files found in $SRC"
  exit 0
fi

detect_model_id () {
  local p="$1"
  local lower="${p,,}"
  if [[ "$lower" == *hiyori* ]]; then echo "hiyori"; return; fi
  if [[ "$lower" == *mao* ]]; then echo "mao"; return; fi
  if [[ "$lower" == *tororo* ]]; then echo "tororo_hijiki"; return; fi
  if [[ "$lower" == *shizuku* ]]; then echo "shizuku"; return; fi
  if [[ "$lower" == *hibiki* ]]; then echo "hibiki"; return; fi
  if [[ "$lower" == *miku* ]]; then echo "miku"; return; fi
  if [[ "$lower" == *kei* ]]; then echo "kei"; return; fi
  if [[ "$lower" == *mark* ]]; then echo "mark"; return; fi
  if [[ "$lower" == *epsilon* ]]; then echo "epsilon"; return; fi
  if [[ "$lower" == *simple* ]]; then echo "simple"; return; fi
  echo ""
}

rm -rf "$TMP"
mkdir -p "$TMP"

for zip in "${ZIPS[@]}"; do
  name="$(basename "$zip" .zip)"
  out="$TMP/$name"
  mkdir -p "$out"
  unzip -o "$zip" -d "$out" >/dev/null
  while IFS= read -r model; do
    modelId="$(detect_model_id "$model")"
    if [ -z "$modelId" ]; then continue; fi
    modelDir="$(dirname "$model")"
    target="$DST/$modelId"
    rm -rf "$target"
    cp -R "$modelDir" "$target"
    if [ ! -f "$target/thumb.png" ]; then
      thumb="$(find "$target" -name "*.png" | head -n 1 || true)"
      if [ -n "$thumb" ]; then
        cp "$thumb" "$target/thumb.png"
      fi
    fi
    echo "Installed $modelId from $zip"
  done < <(find "$out" -name "*.model3.json")
done

echo "Done."
