param(
  [string]$ComposeFile = "docker-compose.aika-stack.yml",
  [string]$Profile = "daily",
  [string]$BaseUrl = "",
  [string]$WebUrl = "http://127.0.0.1:3000",
  [int]$WaitTimeoutSec = 180,
  [switch]$NoBuild,
  [switch]$DownOnFailure
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Resolve-BaseUrl {
  param(
    [string]$ConfiguredBaseUrl
  )

  if ($ConfiguredBaseUrl) {
    return $ConfiguredBaseUrl.Trim()
  }

  $hostPort = $env:AIKA_HOST_PORT
  if (-not $hostPort) {
    $hostPort = "8790"
  }

  return "http://127.0.0.1:$hostPort"
}

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [switch]$AllowNonZeroExit
  )

  $previousErrorAction = $ErrorActionPreference
  $nativePrefSupported = $false
  $previousNativePref = $null
  try {
    $ErrorActionPreference = "Continue"
    if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
      $nativePrefSupported = $true
      $previousNativePref = $global:PSNativeCommandUseErrorActionPreference
      $global:PSNativeCommandUseErrorActionPreference = $false
    }

    $output = & $FilePath @Arguments 2>&1
    if (-not $AllowNonZeroExit.IsPresent -and $LASTEXITCODE -ne 0) {
      $detail = ($output | ForEach-Object { [string]$_ }) -join "`n"
      throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE.`n$detail"
    }

    return @($output | Where-Object { $null -ne $_ })
  } finally {
    $ErrorActionPreference = $previousErrorAction
    if ($nativePrefSupported) {
      $global:PSNativeCommandUseErrorActionPreference = $previousNativePref
    }
  }
}

function Invoke-Compose {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  return Invoke-NativeCommand -FilePath "docker" -Arguments (@("compose") + $Arguments)
}

function ConvertFrom-ComposeJsonLines {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Lines
  )

  $items = @()
  foreach ($line in $Lines) {
    $trimmed = ([string]$line).Trim()
    if (-not $trimmed) {
      continue
    }

    if ($trimmed.StartsWith("[")) {
      $parsed = $trimmed | ConvertFrom-Json
      if ($parsed -is [System.Array]) {
        foreach ($entry in $parsed) {
          $items += $entry
        }
      } else {
        $items += $parsed
      }
      continue
    }

    $items += ($trimmed | ConvertFrom-Json)
  }

  return $items
}

function Get-ComposeServiceSnapshot {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ComposeFile,
    [Parameter(Mandatory = $true)]
    [string]$Profile
  )

  $lines = Invoke-Compose -Arguments @("-f", $ComposeFile, "--profile", $Profile, "ps", "--format", "json")
  if (-not $lines -or @($lines).Count -eq 0) {
    return @()
  }

  return ConvertFrom-ComposeJsonLines -Lines @($lines)
}

function Get-NormalizedServiceState {
  param(
    [Parameter(Mandatory = $true)]
    $Entry
  )

  $service = $null
  foreach ($name in @("Service", "service", "Name", "name")) {
    if ($Entry.PSObject.Properties.Name -contains $name) {
      $service = [string]$Entry.$name
      if ($service) { break }
    }
  }

  $state = $null
  foreach ($name in @("State", "state", "Status", "status")) {
    if ($Entry.PSObject.Properties.Name -contains $name) {
      $state = [string]$Entry.$name
      if ($state) { break }
    }
  }

  $health = $null
  foreach ($name in @("Health", "health")) {
    if ($Entry.PSObject.Properties.Name -contains $name) {
      $health = [string]$Entry.$name
      if ($null -ne $health) { break }
    }
  }

  [pscustomobject]@{
    Service = $service
    State   = $state
    Health  = $health
    Raw     = $Entry
  }
}

function Test-ServiceReady {
  param(
    [Parameter(Mandatory = $true)]
    $StatusEntry
  )

  $stateText = ([string]$StatusEntry.State).Trim().ToLowerInvariant()
  $healthText = ([string]$StatusEntry.Health).Trim().ToLowerInvariant()

  if ($stateText -match "exited|dead") {
    return [pscustomobject]@{ Ready = $false; Failed = $true; Reason = "state=$($StatusEntry.State)" }
  }

  if ($stateText -match "restarting") {
    return [pscustomobject]@{ Ready = $false; Failed = $false; Reason = "state=$($StatusEntry.State)" }
  }

  if ($healthText -and $healthText -ne "none") {
    if ($healthText -eq "healthy") {
      return [pscustomobject]@{ Ready = $true; Failed = $false; Reason = "healthy" }
    }

    if ($healthText -eq "unhealthy") {
      return [pscustomobject]@{ Ready = $false; Failed = $true; Reason = "health=unhealthy" }
    }

    return [pscustomobject]@{ Ready = $false; Failed = $false; Reason = "health=$($StatusEntry.Health)" }
  }

  if ($stateText -match "running|up|healthy") {
    return [pscustomobject]@{ Ready = $true; Failed = $false; Reason = "running" }
  }

  if ($stateText) {
    return [pscustomobject]@{ Ready = $false; Failed = $false; Reason = "state=$($StatusEntry.State)" }
  }

  return [pscustomobject]@{ Ready = $false; Failed = $false; Reason = "unknown" }
}

function Wait-ForComposeServices {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ComposeFile,
    [Parameter(Mandatory = $true)]
    [string]$Profile,
    [Parameter(Mandatory = $true)]
    [string[]]$TargetServices,
    [Parameter(Mandatory = $true)]
    [int]$TimeoutSec
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $lastSnapshotText = ""

  while ($true) {
    $snapshot = @()
    try {
      $snapshot = @(Get-ComposeServiceSnapshot -ComposeFile $ComposeFile -Profile $Profile | ForEach-Object {
        Get-NormalizedServiceState -Entry $_
      })
    } catch {
      throw "Failed to inspect compose state: $($_.Exception.Message)"
    }

    $statusByService = @{}
    foreach ($entry in $snapshot) {
      if ($entry.Service) {
        $statusByService[$entry.Service] = $entry
      }
    }

    $lines = foreach ($service in $TargetServices) {
      if ($statusByService.ContainsKey($service)) {
        $current = $statusByService[$service]
        $healthSuffix = ""
        if ($current.Health -and ([string]$current.Health).Trim()) {
          $healthSuffix = " / health=$($current.Health)"
        }
        "{0}: {1}{2}" -f $service, $current.State, $healthSuffix
      } else {
        "{0}: not reported" -f $service
      }
    }

    $snapshotText = ($lines -join "; ")
    if ($snapshotText -ne $lastSnapshotText) {
      Write-Host "Waiting for daily stack: $snapshotText"
      $lastSnapshotText = $snapshotText
    }

    $allReady = $true
    foreach ($service in $TargetServices) {
      if (-not $statusByService.ContainsKey($service)) {
        $allReady = $false
        continue
      }

      $readiness = Test-ServiceReady -StatusEntry $statusByService[$service]
      if ($readiness.Failed) {
        throw "Service '$service' failed readiness check: $($readiness.Reason)"
      }
      if (-not $readiness.Ready) {
        $allReady = $false
      }
    }

    if ($allReady) {
      return
    }

    if ((Get-Date) -ge $deadline) {
      throw "Timed out after $TimeoutSec seconds waiting for services: $($TargetServices -join ', ')"
    }

    Start-Sleep -Seconds 3
  }
}

function Invoke-Verifier {
  param(
    [Parameter(Mandatory = $true)]
    [string]$VerifierPath,
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [Parameter(Mandatory = $true)]
    [string]$WebUrl
  )

  $firstRun = Invoke-NativeCommand -FilePath "powershell" -Arguments @(
    "-ExecutionPolicy", "Bypass",
    "-File", $VerifierPath,
    "-BaseUrl", $BaseUrl,
    "-WebUrl", $WebUrl
  ) -AllowNonZeroExit

  if ($LASTEXITCODE -eq 0) {
    if ($firstRun.Count -gt 0) {
      $firstRun | ForEach-Object { Write-Host $_ }
    }
    return 0
  }

  $firstOutput = ($firstRun | ForEach-Object { [string]$_ }) -join "`n"
  if ($firstOutput -match "A parameter cannot be found that matches parameter name 'WebUrl'") {
    Write-Host "Verifier does not accept -WebUrl in this repo; retrying with -BaseUrl only." -ForegroundColor Yellow
    $secondRun = Invoke-NativeCommand -FilePath "powershell" -Arguments @(
      "-ExecutionPolicy", "Bypass",
      "-File", $VerifierPath,
      "-BaseUrl", $BaseUrl
    ) -AllowNonZeroExit
    if ($LASTEXITCODE -eq 0) {
      if ($secondRun.Count -gt 0) {
        $secondRun | ForEach-Object { Write-Host $_ }
      }
      return 0
    }

    $secondOutput = ($secondRun | ForEach-Object { [string]$_ }) -join "`n"
    throw "Verifier failed after fallback.`n$secondOutput"
  }

  throw "Verifier failed.`n$firstOutput"
}

function Invoke-ComposeDown {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ComposeFile,
    [Parameter(Mandatory = $true)]
    [string]$Profile
  )

  try {
    Write-Host "Running compose down for recovery..." -ForegroundColor Yellow
    Invoke-Compose -Arguments @("-f", $ComposeFile, "--profile", $Profile, "down") | Out-Null
  } catch {
    Write-Warning "Compose down failed: $($_.Exception.Message)"
  }
}

function Write-RollbackGuidance {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ComposeFile,
    [Parameter(Mandatory = $true)]
    [string]$Profile,
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [Parameter(Mandatory = $true)]
    [string]$WebUrl
  )

  Write-Host ""
  Write-Host "Rollback / recovery guidance:" -ForegroundColor Cyan
  Write-Host "1. Inspect stack state:"
  Write-Host "   docker compose -f $ComposeFile --profile $Profile ps"
  Write-Host "2. Review service logs:"
  Write-Host "   docker compose -f $ComposeFile --profile $Profile logs --tail 200"
  Write-Host "3. If this was a bad rollout, stop the profile:"
  Write-Host "   docker compose -f $ComposeFile --profile $Profile down"
  Write-Host "4. Re-run verification directly after fixes:"
  Write-Host "   powershell -ExecutionPolicy Bypass -File scripts/verify_core_stack.ps1 -BaseUrl $BaseUrl"
  Write-Host "5. Web UI target for manual check: $WebUrl"
}

try {
  $BaseUrl = Resolve-BaseUrl -ConfiguredBaseUrl $BaseUrl

  if (-not (Test-Path -LiteralPath $ComposeFile)) {
    throw "Compose file not found: $ComposeFile"
  }

  $verifierPath = Join-Path $PSScriptRoot "verify_core_stack.ps1"
  if (-not (Test-Path -LiteralPath $verifierPath)) {
    throw "Verifier script not found: $verifierPath"
  }

  Write-Host "== Daily Stack Bring-Up + Verification ==" -ForegroundColor Cyan
  Write-Host "Compose file: $ComposeFile"
  Write-Host "Profile: $Profile"
  Write-Host "Base URL: $BaseUrl"
  Write-Host "Web URL: $WebUrl"
  Write-Host "Timeout: $WaitTimeoutSec sec"
  Write-Host ("Build: {0}" -f (-not $NoBuild.IsPresent))

  $composeArgs = @("-f", $ComposeFile, "--profile", $Profile, "up", "-d")
  if (-not $NoBuild.IsPresent) {
    $composeArgs += "--build"
  }

  Write-Host "Bringing up compose stack..." -ForegroundColor Cyan
  Invoke-Compose -Arguments $composeArgs | Out-Null

  Wait-ForComposeServices -ComposeFile $ComposeFile -Profile $Profile -TargetServices @("aika-shell", "mcp-worker", "web-ui") -TimeoutSec $WaitTimeoutSec

  Write-Host "Running core stack verification..." -ForegroundColor Cyan
  $verifyExitCode = Invoke-Verifier -VerifierPath $verifierPath -BaseUrl $BaseUrl -WebUrl $WebUrl
  if ($verifyExitCode -ne 0) {
    throw "Verification failed with exit code $verifyExitCode."
  }

  Write-Host "Daily bring-up and verification succeeded." -ForegroundColor Green
  exit 0
} catch {
  $errorMessage = $_.Exception.Message
  Write-Host ""
  Write-Error $errorMessage
  Write-RollbackGuidance -ComposeFile $ComposeFile -Profile $Profile -BaseUrl $BaseUrl -WebUrl $WebUrl

  if ($DownOnFailure.IsPresent) {
    Invoke-ComposeDown -ComposeFile $ComposeFile -Profile $Profile
  }

  exit 1
}
