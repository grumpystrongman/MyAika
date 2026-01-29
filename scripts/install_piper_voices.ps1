param(
  [string]$VoicesDir = "apps/server/piper_voices",
  [string[]]$Voices = @(
    "en_US-lessac-high",
    "en_US-lessac-medium",
    "en_US-ljspeech-high",
    "en_US-libritts-high",
    "en_US-amy-medium",
    "en_US-kristin-medium",
    "en_GB-southern_english_female-low",
    "en_US-ryan-high",
    "en_US-joe-medium",
    "en_US-john-medium"
  )
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$targetDir = Join-Path $repoRoot $VoicesDir
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

function Get-LangPath($voiceId) {
  $parts = $voiceId.Split("-")
  if ($parts.Length -lt 3) { return $null }
  $locale = $parts[0]
  $name = $parts[1]
  $quality = $parts[2]
  $lang = $locale.Split("_")[0]
  return @{ locale = $locale; name = $name; quality = $quality; lang = $lang }
}

foreach ($voice in $Voices) {
  $meta = Get-LangPath $voice
  if (-not $meta) {
    Write-Host "Skipping invalid voice id: $voice"
    continue
  }

  $base = "https://huggingface.co/rhasspy/piper-voices/resolve/main/$($meta.lang)/$($meta.locale)/$($meta.name)/$($meta.quality)/$voice"
  $onnx = Join-Path $targetDir "$voice.onnx"
  $json = Join-Path $targetDir "$voice.onnx.json"

  if (-not (Test-Path $onnx)) {
    Write-Host "Downloading $voice.onnx"
    curl.exe -L "$base.onnx?download=true" -o $onnx
  }
  if (-not (Test-Path $json)) {
    Write-Host "Downloading $voice.onnx.json"
    curl.exe -L "$base.onnx.json?download=true" -o $json
  }
}

Write-Host "Done. Voices downloaded to $targetDir"
