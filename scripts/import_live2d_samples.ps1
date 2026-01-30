param(
  [string]$SourceDir = "data/live2d_import",
  [string]$TargetDir = "apps/web/public/assets/aika/live2d"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$src = Join-Path $repoRoot $SourceDir
$dst = Join-Path $repoRoot $TargetDir
New-Item -ItemType Directory -Force -Path $src | Out-Null
New-Item -ItemType Directory -Force -Path $dst | Out-Null

$temp = Join-Path $repoRoot "data/_live2d_tmp"
if (Test-Path $temp) { Remove-Item -Recurse -Force $temp }
New-Item -ItemType Directory -Force -Path $temp | Out-Null

$zips = Get-ChildItem $src -Filter *.zip -ErrorAction SilentlyContinue
if (-not $zips) {
  Write-Host "No zip files found in $src"
  exit 0
}

function Detect-ModelId($path) {
  $lower = $path.ToLower()
  if ($lower -match "hiyori") { return "hiyori" }
  if ($lower -match "mao") { return "mao" }
  if ($lower -match "tororo") { return "tororo_hijiki" }
  if ($lower -match "shizuku") { return "shizuku" }
  if ($lower -match "hibiki") { return "hibiki" }
  return $null
}

foreach ($zip in $zips) {
  $zipOut = Join-Path $temp $zip.BaseName
  Expand-Archive -Path $zip.FullName -DestinationPath $zipOut -Force
  $models = Get-ChildItem $zipOut -Recurse -Filter *.model3.json
  foreach ($model in $models) {
    $modelId = Detect-ModelId $model.FullName
    if (-not $modelId) { continue }
    $modelDir = Split-Path $model.FullName -Parent
    $target = Join-Path $dst $modelId
    if (Test-Path $target) { Remove-Item -Recurse -Force $target }
    Copy-Item -Recurse -Force $modelDir $target
    $thumb = Join-Path $target "thumb.png"
    if (-not (Test-Path $thumb)) {
      $firstPng = Get-ChildItem $target -Recurse -Filter *.png | Select-Object -First 1
      if ($firstPng) {
        Copy-Item -Force $firstPng.FullName $thumb
      }
    }
    Write-Host "Installed $modelId from $($zip.Name)"
  }
}

Write-Host "Done."
