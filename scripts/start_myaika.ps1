$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$logDir = Join-Path $repoRoot "logs"
if (!(Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

function Stop-Port([int]$port) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($connections) {
    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $pids) {
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
  }
}

Stop-Port 8790
Stop-Port 3000

Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm","--prefix","apps/server","run","dev" -RedirectStandardOutput (Join-Path $logDir "server.dev.log") -RedirectStandardError (Join-Path $logDir "server.dev.err.log") -WindowStyle Hidden
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm","--prefix","apps/web","run","dev" -RedirectStandardOutput (Join-Path $logDir "web.dev.log") -RedirectStandardError (Join-Path $logDir "web.dev.err.log") -WindowStyle Hidden

Write-Host "Aika starting..."
Write-Host "Server: http://localhost:8790/health"
Write-Host "Web: http://localhost:3000"
