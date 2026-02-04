param(
  [int]$ServerPort = 8790,
  [int]$WebPort = 3000,
  [ValidateSet("cloudflared", "localhostrun", "localtunnel")] [string]$TunnelProvider = "cloudflared",
  [string]$TunnelSubdomain = ""
)

$ErrorActionPreference = "Stop"

function Stop-PortProcess {
  param([int]$Port)
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  $killed = @()
  foreach ($conn in $conns) {
    $procId = $conn.OwningProcess
    if ($procId -and -not ($killed -contains $procId)) {
      try {
        Stop-Process -Id $procId -Force -ErrorAction Stop
        $killed += $procId
      } catch {}
    }
  }
  return $killed
}

function Wait-Port {
  param(
    [int]$Port,
    [int]$TimeoutSec = 40
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Stop-TunnelProcesses {
  $patterns = @("localtunnel", "localhost.run", "a.pinggy.io", "cloudflared", "trycloudflare.com")
  $killed = @()
  $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
  foreach ($proc in $procs) {
    $cmd = [string]$proc.CommandLine
    if (-not $cmd) { continue }
    if ($patterns | Where-Object { $cmd -match [regex]::Escape($_) }) {
      $procId = [int]$proc.ProcessId
      if ($procId -and -not ($killed -contains $procId)) {
        try {
          Stop-Process -Id $procId -Force -ErrorAction Stop
          $killed += $procId
        } catch {}
      }
    }
  }
  return $killed
}

function Resolve-CloudflaredPath {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) {
    return $cmd.Source
  }

  $toolsDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) ".tools"
  New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
  $cfPath = Join-Path $toolsDir "cloudflared.exe"
  if (Test-Path $cfPath) {
    return $cfPath
  }

  Write-Host "cloudflared not found. Downloading portable binary..." -ForegroundColor Yellow
  $downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $cfPath -TimeoutSec 90
  } catch {
    Write-Host "Failed to download cloudflared: $($_.Exception.Message)" -ForegroundColor Red
    return $null
  }
  if (Test-Path $cfPath) {
    return $cfPath
  }
  return $null
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$logDir = Join-Path $repoRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$serverLog = Join-Path $logDir "server_dev.log"
$webLog = Join-Path $logDir "web_dev.log"
$tunnelLog = Join-Path $logDir "ipad_tunnel.log"

Write-Host "Stopping existing listeners on common Aika ports..."
$allKilled = @()
foreach ($port in @($ServerPort, $WebPort, 8787, 9880, 9881, 9882)) {
  $allKilled += Stop-PortProcess -Port $port
}
$allKilled += Stop-TunnelProcesses
if ($allKilled.Count -gt 0) {
  $unique = ($allKilled | Sort-Object -Unique) -join ", "
  Write-Host "Stopped PIDs: $unique"
} else {
  Write-Host "No running listeners found."
}

Set-Content -Path $serverLog -Value ""
Set-Content -Path $webLog -Value ""
Set-Content -Path $tunnelLog -Value ""

Write-Host "Starting Aika server on :$ServerPort ..."
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev -w apps/server > `"$serverLog`" 2>&1" -WorkingDirectory $repoRoot -WindowStyle Hidden

Write-Host "Starting Aika web on :$WebPort ..."
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev -w apps/web > `"$webLog`" 2>&1" -WorkingDirectory $repoRoot -WindowStyle Hidden

if (-not (Wait-Port -Port $ServerPort -TimeoutSec 45)) {
  Write-Host "Server did not start on :$ServerPort. See $serverLog" -ForegroundColor Red
  exit 1
}
if (-not (Wait-Port -Port $WebPort -TimeoutSec 45)) {
  Write-Host "Web did not start on :$WebPort. See $webLog" -ForegroundColor Red
  exit 1
}

Write-Host "Starting HTTPS tunnel for iPad access ($TunnelProvider)..."
if ($TunnelProvider -eq "cloudflared") {
  $cloudflaredPath = Resolve-CloudflaredPath
  if (-not $cloudflaredPath) {
    Write-Host "Falling back to localtunnel because cloudflared is unavailable." -ForegroundColor Yellow
    $TunnelProvider = "localtunnel"
  } else {
    Start-Process `
      -FilePath $cloudflaredPath `
      -ArgumentList @("tunnel", "--url", "http://localhost:$WebPort", "--no-autoupdate", "--logfile", "$tunnelLog", "--loglevel", "info") `
      -WorkingDirectory $repoRoot `
      -WindowStyle Hidden
  }
}
if ($TunnelProvider -eq "localhostrun") {
  $sshCmd = "ssh -o StrictHostKeyChecking=no -R 80:localhost:$WebPort nokey@localhost.run > `"$tunnelLog`" 2>&1"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $sshCmd -WorkingDirectory $repoRoot -WindowStyle Hidden
}
if ($TunnelProvider -eq "localtunnel") {
  $ltCmd = if ($TunnelSubdomain) {
    "npx --yes localtunnel --port $WebPort --subdomain $TunnelSubdomain > `"$tunnelLog`" 2>&1"
  } else {
    "npx --yes localtunnel --port $WebPort > `"$tunnelLog`" 2>&1"
  }
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $ltCmd -WorkingDirectory $repoRoot -WindowStyle Hidden
}

$tunnelUrl = ""
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline -and -not $tunnelUrl) {
  Start-Sleep -Milliseconds 750
  if (Test-Path $tunnelLog) {
    $content = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
    if ($content -match "tunneled with tls termination,\s*(https://[^\s]+)") {
      $tunnelUrl = $Matches[1]
      break
    }
    if ($content -match "your url is:\s*(https://[^\s]+)") {
      $tunnelUrl = $Matches[1]
      break
    }
    if ($content -match "https://[a-zA-Z0-9.-]+\.loca\.lt") {
      $tunnelUrl = $Matches[0]
      break
    }
    if ($content -match "https://[a-zA-Z0-9-]+\.trycloudflare\.com") {
      $tunnelUrl = $Matches[0]
      break
    }
  }
}

$healthOk = $false
try {
  $health = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$ServerPort/health" -TimeoutSec 6
  $healthOk = $health.StatusCode -eq 200
} catch {}

Write-Host ""
Write-Host "Aika is running." -ForegroundColor Green
Write-Host "Server: http://localhost:$ServerPort (health: $healthOk)"
Write-Host "Web:    http://localhost:$WebPort"
if ($tunnelUrl) {
  Write-Host "iPad HTTPS URL: $tunnelUrl" -ForegroundColor Cyan
} else {
  Write-Host "Tunnel URL not detected yet. Check: $tunnelLog" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Logs:"
Write-Host "  $serverLog"
Write-Host "  $webLog"
Write-Host "  $tunnelLog"
