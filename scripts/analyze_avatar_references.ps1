param(
  [Parameter(Mandatory = $true)]
  [string[]]$Urls,

  [string]$OutputDir = "data/avatar-reference-analysis"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-Executable {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CommandName,

    [Parameter(Mandatory = $true)]
    [string[]]$FallbackPatterns
  )

  $cmd = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  foreach ($pattern in $FallbackPatterns) {
    $matches = Get-ChildItem -Path $pattern -File -ErrorAction SilentlyContinue
    if ($matches) {
      return $matches[0].FullName
    }
  }

  throw "Unable to resolve executable for $CommandName"
}

function Ensure-Directory {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

$ytDlp = Resolve-Executable -CommandName "yt-dlp" -FallbackPatterns @(
  "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\yt-dlp.yt-dlp_*\yt-dlp.exe"
)

$ffmpeg = Resolve-Executable -CommandName "ffmpeg" -FallbackPatterns @(
  "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg.Essentials_*\*\bin\ffmpeg.exe",
  "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\yt-dlp.FFmpeg_*\*\bin\ffmpeg.exe"
)

$ffprobe = Resolve-Executable -CommandName "ffprobe" -FallbackPatterns @(
  "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg.Essentials_*\*\bin\ffprobe.exe",
  "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\yt-dlp.FFmpeg_*\*\bin\ffprobe.exe"
)

$resolvedOutputDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
  $OutputDir
} else {
  Join-Path (Get-Location) $OutputDir
}

$metadataDir = Join-Path $resolvedOutputDir "metadata"
$captionsDir = Join-Path $resolvedOutputDir "captions"
$subsDir = Join-Path $resolvedOutputDir "subtitle-lists"

Ensure-Directory -Path $resolvedOutputDir
Ensure-Directory -Path $metadataDir
Ensure-Directory -Path $captionsDir
Ensure-Directory -Path $subsDir

$versionLog = Join-Path $resolvedOutputDir "tool-versions.txt"
@(
  "yt-dlp: $(& $ytDlp --version)",
  "ffmpeg: $((& $ffmpeg -version)[0])",
  "ffprobe: $((& $ffprobe -version)[0])"
) | Set-Content -LiteralPath $versionLog -Encoding utf8

$summaryPath = Join-Path $resolvedOutputDir "summary.tsv"
"id`turl`ttitle`tchannel`tduration`tupload_date`tview_count`tlike_count`tcomment_count" | Set-Content -LiteralPath $summaryPath -Encoding utf8

foreach ($url in $Urls) {
  $id = (& $ytDlp --print "%(id)s" --no-warnings $url).Trim()
  if (-not $id) {
    throw "Failed to resolve video id for $url"
  }

  $summaryRow = (& $ytDlp --print "%(id)s`t%(webpage_url)s`t%(title)s`t%(channel)s`t%(duration_string)s`t%(upload_date)s`t%(view_count)s`t%(like_count)s`t%(comment_count)s" --no-warnings $url).Trim()
  Add-Content -LiteralPath $summaryPath -Value $summaryRow -Encoding utf8

  $metadataPath = Join-Path $metadataDir "$id.json"
  & $ytDlp --dump-single-json --no-warnings $url | Set-Content -LiteralPath $metadataPath -Encoding utf8

  $subsListPath = Join-Path $subsDir "$id.txt"
  & $ytDlp --list-subs --no-warnings $url | Set-Content -LiteralPath $subsListPath -Encoding utf8

  & $ytDlp --skip-download --write-auto-sub --sub-langs "en.*" --sub-format "vtt" --output (Join-Path $captionsDir "$id.%(ext)s") --no-warnings $url | Out-Null
}

Write-Host "Wrote analysis outputs to $resolvedOutputDir"
