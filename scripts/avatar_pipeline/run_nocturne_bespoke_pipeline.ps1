param(
  [string]$SourceGlb = 'c:\Users\grump\Repo\MyAika\apps\web\public\assets\aika\3d\alternates\avaturn.glb',
  [string]$ReferenceImage = 'c:\Users\grump\Repo\MyAika\data\simli-upload\aika-nocturne\AIKA_Nocturne_Simli_Upload_Primary.png',
  [string]$SourceTextureDir = 'c:\Users\grump\Repo\MyAika\data\avatar-pipeline\avaturn-source-images',
  [string]$WorkingDir = 'c:\Users\grump\Repo\MyAika\data\avatar-pipeline\nocturne-bespoke',
  [string]$OutputGlb = 'c:\Users\grump\Repo\MyAika\apps\web\public\assets\aika\3d\bespoke\nocturne-bespoke.glb'
)

$ErrorActionPreference = 'Stop'
$repoRoot = 'c:\Users\grump\Repo\MyAika'
$texturesDir = Join-Path $WorkingDir 'textures'
$rendersDir = Join-Path $WorkingDir 'renders'
$renderPath = Join-Path $rendersDir 'nocturne-bespoke-preview.png'
$pythonScript = Join-Path $repoRoot 'scripts\avatar_pipeline\generate_nocturne_textures.py'
$blenderScript = Join-Path $repoRoot 'scripts\avatar_pipeline\build_nocturne_bespoke_blender.py'
$blenderExe = 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe'

New-Item -ItemType Directory -Force $texturesDir | Out-Null
New-Item -ItemType Directory -Force $rendersDir | Out-Null
New-Item -ItemType Directory -Force ([System.IO.Path]::GetDirectoryName($OutputGlb)) | Out-Null

python $pythonScript --source-dir $SourceTextureDir --reference $ReferenceImage --output-dir $texturesDir
if ($LASTEXITCODE -ne 0) { throw 'Texture generation failed.' }

& $blenderExe -b --python $blenderScript -- --source-glb $SourceGlb --textures-dir $texturesDir --output-glb $OutputGlb --render-path $renderPath
if ($LASTEXITCODE -ne 0) { throw 'Blender build failed.' }

Write-Host "Built bespoke avatar: $OutputGlb"
Write-Host "Preview render: $renderPath"
