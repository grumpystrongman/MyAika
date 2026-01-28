@echo off
setlocal

if not exist apps\server\.env (
  echo Missing apps\server\.env. Copy apps\server\.env.example to apps\server\.env and set OPENAI_API_KEY.
  exit /b 1
)

findstr /b /c:"TTS_ENGINE=gptsovits" apps\server\.env >nul
if errorlevel 1 (
  echo TTS_ENGINE is not set to gptsovits in apps\server\.env.
  echo Update apps\server\.env to use GPT-SoVITS settings.
)

echo Starting GPT-SoVITS (requires GPTSOVITS_REPO_PATH and GPTSOVITS_PYTHON_BIN)...
call npm run gptsovits
endlocal
