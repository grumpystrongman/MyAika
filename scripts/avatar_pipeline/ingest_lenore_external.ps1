param(
  [string]$SourceDir = 'c:\Users\grump\Repo\MyAika\data\avatar-pipeline\external\lenore-source',
  [string]$OutputGlb = 'c:\Users\grump\Repo\MyAika\apps\web\public\assets\aika\3d\external\lenore.glb',
  [string]$PreviewPng = 'c:\Users\grump\Repo\MyAika\data\avatar-pipeline\external\lenore-preview.png'
)

$ErrorActionPreference = 'Stop'
$blender = 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe'
if (!(Test-Path $blender)) { throw 'Blender not found.' }
if (!(Test-Path $SourceDir)) { throw "Source directory not found: $SourceDir" }

$expandedDir = Join-Path $SourceDir '_expanded'
if (Test-Path $expandedDir) { Remove-Item $expandedDir -Recurse -Force }
New-Item -ItemType Directory -Force $expandedDir | Out-Null

Get-ChildItem $SourceDir -File -Filter *.zip -ErrorAction SilentlyContinue | ForEach-Object {
  Expand-Archive -LiteralPath $_.FullName -DestinationPath (Join-Path $expandedDir $_.BaseName) -Force
}

$searchRoots = @($SourceDir)
if (Get-ChildItem $expandedDir -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1) {
  $searchRoots += $expandedDir
}

$glb = Get-ChildItem $searchRoots -Recurse -File -Include *.glb -ErrorAction SilentlyContinue |
  Sort-Object Length -Descending |
  Select-Object -First 1
$fbx = $null
$blend = $null
if (-not $glb) {
  $fbx = Get-ChildItem $searchRoots -Recurse -File -Include *.fbx -ErrorAction SilentlyContinue |
    Sort-Object Length -Descending |
    Select-Object -First 1
}
if (-not $glb -and -not $fbx) {
  $blend = Get-ChildItem $searchRoots -Recurse -File -Include *.blend -ErrorAction SilentlyContinue |
    Sort-Object Length -Descending |
    Select-Object -First 1
}

if ($glb) {
  Copy-Item $glb.FullName $OutputGlb -Force
  Write-Host "Copied GLB: $($glb.FullName) -> $OutputGlb"
  exit 0
}

if (-not $fbx -and -not $blend) {
  throw 'No .glb, .fbx, or .blend found in lenore-source.'
}

$sourcePath = if ($fbx) { $fbx.FullName } else { $blend.FullName }
$sourceType = if ($fbx) { 'fbx' } else { 'blend' }
$scriptPath = 'c:\Users\grump\Repo\MyAika\scripts\avatar_pipeline\ingest_external_lenore_blender.py'

& $blender -b --python $scriptPath -- --source-path $sourcePath --source-type $sourceType --output-glb $OutputGlb --preview-png $PreviewPng
if ($LASTEXITCODE -ne 0) { throw 'Blender import/export failed.' }
Write-Host "Built external Lenore asset: $OutputGlb"
