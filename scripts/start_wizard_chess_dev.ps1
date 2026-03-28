param(
  [int]$Port = 3105,
  [switch]$Foreground
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$webDir = Join-Path $repoRoot "apps/web"
$distDirName = ".next-wizard-$Port"
$distDir = Join-Path $webDir $distDirName
$outDir = Join-Path $repoRoot "output"
$outLog = Join-Path $outDir "wizard_next_$Port.out.log"
$errLog = Join-Path $outDir "wizard_next_$Port.err.log"

Write-Host "== Wizard Chess Dev Reset ==" -ForegroundColor Green
Write-Host "Repo: $repoRoot"
Write-Host "Web:  $webDir"
Write-Host "Port: $Port"
Write-Host "Dist: $distDirName"

try {
  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($connections) {
    $procIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $procIds) {
      try {
        Stop-Process -Id $procId -Force -ErrorAction Stop
        Write-Host "Stopped process on port ${Port}; PID $procId" -ForegroundColor Yellow
      } catch {
        Write-Warning "Failed to stop PID $procId. $($_.Exception.Message)"
      }
    }
  }
} catch {
  Write-Warning "Port cleanup warning: $($_.Exception.Message)"
}

$targetDistDir = $distDir
if (Test-Path $targetDistDir) {
  $cleared = $false
  for ($attempt = 1; $attempt -le 8; $attempt += 1) {
    try {
      Remove-Item -LiteralPath $targetDistDir -Recurse -Force -ErrorAction Stop
      $cleared = $true
      break
    } catch {
      Start-Sleep -Milliseconds 350
    }
  }
  if ($cleared) {
    Write-Host "Cleared $targetDistDir" -ForegroundColor Yellow
  } else {
    Write-Warning "Could not fully clear $targetDistDir (possibly locked). Continuing with startup."
  }
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

if ($Foreground.IsPresent) {
  Write-Host "Starting Next dev in foreground at http://127.0.0.1:$Port/wizard-chess" -ForegroundColor Cyan
  Push-Location $webDir
  $previousDistDir = $env:NEXT_DIST_DIR
  $env:NEXT_DIST_DIR = $distDirName
  try {
    & npx.cmd next dev -H 127.0.0.1 -p $Port
  } finally {
    if ([string]::IsNullOrWhiteSpace($previousDistDir)) {
      Remove-Item Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue
    } else {
      $env:NEXT_DIST_DIR = $previousDistDir
    }
    Pop-Location
  }
  exit $LASTEXITCODE
}

$childCommand = "`$env:NEXT_DIST_DIR = '$distDirName'; & npx.cmd next dev -H 127.0.0.1 -p $Port"
$proc = Start-Process -FilePath "powershell" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $childCommand) `
  -WorkingDirectory $webDir `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

$ready = $false
for ($i = 0; $i -lt 80; $i += 1) {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/wizard-chess" -UseBasicParsing -TimeoutSec 3
    if ($response.StatusCode -ge 200) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

if ($ready) {
  Write-Host "Ready: http://127.0.0.1:$Port/wizard-chess" -ForegroundColor Green
  Write-Host "Logs: $outLog | $errLog"
} else {
  Write-Host "Server not ready yet. Check logs:" -ForegroundColor Red
  Write-Host $outLog
  Write-Host $errLog
  exit 1
}
