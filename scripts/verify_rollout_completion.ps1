param(
  [int]$UiPort = 3105,
  [switch]$SkipDailyBringup,
  [switch]$SkipUiCohorts
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$webDir = Join-Path $repoRoot "apps/web"
$steps = @()

function Test-PortInUse {
  param(
    [int]$Port
  )
  try {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
      return $true
    }
  } catch {
    # fallback to socket bind probe below
  }
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
    $listener.Start()
    $listener.Stop()
    return $false
  } catch {
    return $true
  }
}

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $port = $listener.LocalEndpoint.Port
  $listener.Stop()
  return [int]$port
}

if (Test-PortInUse -Port $UiPort) {
  $requestedPort = $UiPort
  $UiPort = Get-FreeTcpPort
  Write-Host "Requested UI port $requestedPort is in use. Using available port $UiPort instead." -ForegroundColor Yellow
}

$uiBaseUrl = "http://127.0.0.1:$UiPort"

function Add-StepResult {
  param(
    [string]$Step,
    [string]$Status,
    [string]$Detail
  )
  $script:steps += [pscustomobject]@{
    Step = $Step
    Status = $Status
    Detail = $Detail
  }
}

function Invoke-RepoCommand {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$StepName,
    [switch]$Silent
  )
  Write-Host "==> $StepName" -ForegroundColor Cyan
  Push-Location $repoRoot
  try {
    if ($Silent.IsPresent) {
      $null = & $FilePath @Arguments 2>&1
    } else {
      & $FilePath @Arguments
    }
    if ($LASTEXITCODE -ne 0) {
      throw "$StepName failed with exit code $LASTEXITCODE"
    }
    Add-StepResult -Step $StepName -Status "PASS" -Detail "ok"
  } finally {
    Pop-Location
  }
}

function Wait-HttpReady {
  param(
    [string]$Url,
    [int]$TimeoutSec = 180
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 | Out-Null
      return $true
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  return $false
}

function Stop-ProcessTree {
  param(
    [int]$ProcessId
  )
  try {
    & taskkill /PID $ProcessId /T /F | Out-Null
  } catch {
    # ignore cleanup failures
  }
}

Write-Host "== Rollout Tranche/Cohort Verification ==" -ForegroundColor Green
Write-Host "Repo: $repoRoot"
Write-Host "UI cohort base URL: $uiBaseUrl"

try {
  if (-not $SkipDailyBringup.IsPresent) {
    Invoke-RepoCommand -FilePath "npm.cmd" -Arguments @("run", "stack:daily:nobuild") -StepName "Daily runtime cohort"
  } else {
    Add-StepResult -Step "Daily runtime cohort" -Status "SKIP" -Detail "Skipped by -SkipDailyBringup"
  }

  Invoke-RepoCommand -FilePath "powershell" -Arguments @("-ExecutionPolicy", "Bypass", "-File", "scripts/verify_core_stack.ps1", "-IncludeWriteChecks") -StepName "Write-path verifier cohort"
  Invoke-RepoCommand -FilePath "docker" -Arguments @("compose", "-f", "docker-compose.aika-stack.yml", "--profile", "test", "config") -StepName "Compose cohort (test profile)" -Silent
  Invoke-RepoCommand -FilePath "docker" -Arguments @("compose", "-f", "docker-compose.aika-stack.yml", "--profile", "experimental", "config") -StepName "Compose cohort (experimental profile)" -Silent
  Invoke-RepoCommand -FilePath "node" -Arguments @("--test", "apps/server/tests/aika_intent_protocol.test.js", "apps/server/tests/aika_command_router.test.js") -StepName "Command grammar/lane cohort"
  Invoke-RepoCommand -FilePath "node" -Arguments @("--test", "apps/server/tests/aika_workflow_skills.test.js") -StepName "Workflow skill dispatch cohort"
  Invoke-RepoCommand -FilePath "node" -Arguments @("--test", "apps/server/tests/aika_digest.test.js", "apps/server/tests/safety_approvals.test.js", "apps/server/tests/email_send_with_context.test.js", "apps/server/tests/aika_intent_protocol.test.js", "apps/server/tests/aika_command_router.test.js") -StepName "Digest/approval cohort"
  Invoke-RepoCommand -FilePath "node" -Arguments @("--test", "apps/server/tests/aika_modules.test.js") -StepName "Module registry cohort"
  Invoke-RepoCommand -FilePath "npm.cmd" -Arguments @("run", "build", "-w", "apps/web") -StepName "Web build cohort"

  if (-not $SkipUiCohorts.IsPresent) {
    Write-Host "==> UI cohorts (isolated web instance on :$UiPort)" -ForegroundColor Cyan
    $nextBuildDir = Join-Path $webDir ".next"
    if (Test-Path $nextBuildDir) {
      Remove-Item -LiteralPath $nextBuildDir -Recurse -Force
    }
    $webProc = Start-Process -FilePath "npx.cmd" -ArgumentList @("next", "dev", "-p", "$UiPort") -WorkingDirectory $webDir -PassThru
    try {
      if (-not (Wait-HttpReady -Url $uiBaseUrl -TimeoutSec 360)) {
        throw "UI instance did not become ready at $uiBaseUrl"
      }

      $env:UI_BASE_URL = $uiBaseUrl
      Invoke-RepoCommand -FilePath "node" -Arguments @("scripts/ui_smoke.js") -StepName "UI navigation cohort"
      Invoke-RepoCommand -FilePath "node" -Arguments @("scripts/ui_chat_approval_smoke.js") -StepName "UI chat approval cohort"
      Invoke-RepoCommand -FilePath "node" -Arguments @("scripts/ui_wizard_chess_smoke.js") -StepName "UI wizard chess cohort"
    } finally {
      Remove-Item Env:UI_BASE_URL -ErrorAction SilentlyContinue
      if ($webProc -and -not $webProc.HasExited) {
        Stop-ProcessTree -ProcessId $webProc.Id
      }
    }
  } else {
    Add-StepResult -Step "UI cohorts" -Status "SKIP" -Detail "Skipped by -SkipUiCohorts"
  }
} catch {
  Add-StepResult -Step "Verification run" -Status "FAIL" -Detail ($_.Exception.Message)
}

Write-Host ""
$steps | Format-Table -AutoSize
Write-Host ""

$failCount = @($steps | Where-Object { $_.Status -eq "FAIL" }).Count
if ($failCount -gt 0) {
  Write-Host "Rollout verification FAILED ($failCount failing step(s))." -ForegroundColor Red
  exit 1
}

Write-Host "Rollout verification complete. All selected cohorts passed." -ForegroundColor Green
