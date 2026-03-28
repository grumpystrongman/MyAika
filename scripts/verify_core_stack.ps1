param(
  [string]$BaseUrl = "",
  [string]$WebUrl = "",
  [string]$ComposeFile = "docker-compose.aika-stack.yml",
  [string]$ComposeProfile = "daily",
  [switch]$SkipApi,
  [switch]$SkipWeb,
  [switch]$IncludeWriteChecks
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$results = @()

function Resolve-BaseUrl {
  param([string]$ConfiguredBaseUrl)
  if ($ConfiguredBaseUrl) {
    return $ConfiguredBaseUrl.Trim()
  }

  $hostPort = $env:AIKA_HOST_PORT
  if (-not $hostPort) {
    $hostPort = "8790"
  }
  return "http://127.0.0.1:$hostPort"
}

function Resolve-WebUrl {
  param([string]$ConfiguredWebUrl)
  if ($ConfiguredWebUrl) {
    return $ConfiguredWebUrl.Trim()
  }
  return "http://127.0.0.1:3000"
}

function Add-CheckResult {
  param(
    [string]$Check,
    [string]$Status,
    [string]$Detail
  )
  $script:results += [pscustomobject]@{
    Check  = $Check
    Status = $Status
    Detail = $Detail
  }
}

function Invoke-NativeCommand {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )
  $nativePrefSupported = $false
  $previousNativePref = $null
  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
      $nativePrefSupported = $true
      $previousNativePref = $global:PSNativeCommandUseErrorActionPreference
      $global:PSNativeCommandUseErrorActionPreference = $false
    }
    $output = & $FilePath @Arguments 2>&1
    return @{
      Output = @($output)
      ExitCode = $LASTEXITCODE
    }
  } finally {
    $ErrorActionPreference = $previousErrorAction
    if ($nativePrefSupported) {
      $global:PSNativeCommandUseErrorActionPreference = $previousNativePref
    }
  }
}

function Test-Command {
  param(
    [string]$Check,
    [string]$FilePath,
    [string[]]$Arguments
  )
  try {
    $nativeResult = Invoke-NativeCommand -FilePath $FilePath -Arguments $Arguments
    $output = $nativeResult.Output
    $outputText = ($output | ForEach-Object { [string]$_ }) -join "`n"
    $warningOnly = ($outputText -match "(?i)attribute.+obsolete") -and -not ($outputText -match "(?i)\berror\b")
    $configLikeSuccess = ($FilePath -eq "docker") -and ($Arguments -contains "compose") -and ($Arguments -contains "config") -and ($outputText -match "(?m)^name:\s")
    if ($nativeResult.ExitCode -eq 0 -or $warningOnly -or $configLikeSuccess) {
      $preview = ($output | Select-Object -First 1)
      $status = if ($warningOnly) { "WARN" } else { "PASS" }
      Add-CheckResult -Check $Check -Status $status -Detail ([string]$preview).Trim()
      return $true
    }
    $detail = ($output | Select-Object -First 2) -join " "
    Add-CheckResult -Check $Check -Status "FAIL" -Detail $detail.Trim()
    return $false
  } catch {
    Add-CheckResult -Check $Check -Status "FAIL" -Detail ($_.Exception.Message)
    return $false
  }
}

function Test-Endpoint {
  param(
    [string]$Check,
    [string]$Method,
    [string]$Uri,
    [string]$BodyJson = "",
    [switch]$AllowAuthFailure
  )
  try {
    $params = @{
      Method      = $Method
      Uri         = $Uri
      TimeoutSec  = 15
      ErrorAction = "Stop"
    }
    if ($BodyJson) {
      $params["ContentType"] = "application/json"
      $params["Body"] = $BodyJson
    }
    $res = Invoke-RestMethod @params
    $detail = ""
    if ($res -is [string]) {
      $detail = $res
    } elseif ($res.PSObject.Properties.Name -contains "status") {
      $detail = "status=$($res.status)"
    } else {
      $detail = "ok"
    }
    Add-CheckResult -Check $Check -Status "PASS" -Detail $detail
    return $true
  } catch {
    $statusCode = $null
    try {
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
        $statusCode = [int]$_.Exception.Response.StatusCode
      }
    } catch {}
    if ($AllowAuthFailure -and ($statusCode -eq 401 -or $statusCode -eq 403)) {
      Add-CheckResult -Check $Check -Status "WARN" -Detail "Auth required for this endpoint in current mode."
      return $true
    }
    Add-CheckResult -Check $Check -Status "FAIL" -Detail ($_.Exception.Message)
    return $false
  }
}

function Test-ComposeConfig {
  param(
    [string]$Check,
    [string]$ComposeFilePath,
    [string[]]$Profiles = @()
  )
  try {
    $args = @("compose", "-f", $ComposeFilePath)
    foreach ($profile in $Profiles) {
      $args += @("--profile", $profile)
    }
    $args += "config"

    $nativeResult = Invoke-NativeCommand -FilePath "docker" -Arguments $args
    $output = $nativeResult.Output
    $text = ($output | ForEach-Object { [string]$_ }) -join "`n"
    $hasName = $text -match "(?m)^name:\s"
    $hasVersionWarning = $text -match "(?i)attribute.+obsolete"
    if ($nativeResult.ExitCode -eq 0 -and $hasName) {
      $status = if ($hasVersionWarning) { "WARN" } else { "PASS" }
      $preview = ($output | Select-Object -First 1)
      Add-CheckResult -Check $Check -Status $status -Detail ([string]$preview).Trim()
      return $true
    }
    $detail = ($output | Select-Object -First 2) -join " "
    Add-CheckResult -Check $Check -Status "FAIL" -Detail $detail.Trim()
    return $false
  } catch {
    Add-CheckResult -Check $Check -Status "FAIL" -Detail ($_.Exception.Message)
    return $false
  }
}

function Get-ComposePsRows {
  param(
    [string]$ComposeFilePath,
    [string]$Profile
  )
  $args = @("compose", "-f", $ComposeFilePath)
  if ($Profile) {
    $args += @("--profile", $Profile)
  }
  $args += @("ps", "--format", "json")
  $nativeResult = Invoke-NativeCommand -FilePath "docker" -Arguments $args
  return $nativeResult
}

function ConvertFrom-ComposeJsonLines {
  param(
    [object[]]$Lines
  )

  $items = @()
  foreach ($line in $Lines) {
    $trimmed = ([string]$line).Trim()
    if (-not $trimmed) {
      continue
    }

    if ($trimmed.StartsWith("[")) {
      try {
        $parsed = $trimmed | ConvertFrom-Json
        if ($parsed -is [System.Array]) {
          foreach ($entry in $parsed) {
            $items += $entry
          }
        } else {
          $items += $parsed
        }
      } catch {}
      continue
    }

    if ($trimmed.StartsWith("{")) {
      try {
        $items += ($trimmed | ConvertFrom-Json)
      } catch {}
    }
  }

  return $items
}

function Test-ComposeRuntime {
  param(
    [string]$ComposeFilePath,
    [string]$Profile,
    [string[]]$RequiredServices
  )
  try {
    $nativeResult = Get-ComposePsRows -ComposeFilePath $ComposeFilePath -Profile $Profile
    $output = $nativeResult.Output
    if ($nativeResult.ExitCode -ne 0) {
      $detail = ($output | Select-Object -First 2) -join " "
      Add-CheckResult -Check "Compose service state" -Status "FAIL" -Detail $detail.Trim()
      return $false
    }

    $rows = ConvertFrom-ComposeJsonLines -Lines $output

    if ($rows.Count -eq 0) {
      Add-CheckResult -Check "Compose service state" -Status "FAIL" -Detail "No service rows returned by docker compose ps."
      return $false
    }

    $allGood = $true
    foreach ($service in $RequiredServices) {
      $row = $rows | Where-Object { $_.Service -eq $service } | Select-Object -First 1
      if (-not $row) {
        Add-CheckResult -Check "Compose service $service" -Status "FAIL" -Detail "Service missing from compose runtime state."
        $allGood = $false
        continue
      }

      $state = [string]$row.State
      $health = ""
      if ($row.PSObject.Properties.Name -contains "Health") {
        $health = [string]$row.Health
      }

      if ($state -ne "running") {
        Add-CheckResult -Check "Compose service $service" -Status "FAIL" -Detail "state=$state health=$health"
        $allGood = $false
        continue
      }

      if ($health -and $health -ne "healthy") {
        if ($health -eq "unhealthy") {
          Add-CheckResult -Check "Compose service $service" -Status "FAIL" -Detail "state=$state health=$health"
          $allGood = $false
          continue
        }
        Add-CheckResult -Check "Compose service $service" -Status "WARN" -Detail "state=$state health=$health"
        continue
      }

      Add-CheckResult -Check "Compose service $service" -Status "PASS" -Detail "state=$state health=$health"
    }

    return $allGood
  } catch {
    Add-CheckResult -Check "Compose service state" -Status "FAIL" -Detail ($_.Exception.Message)
    return $false
  }
}

function Test-WebUiRuntimeBootstrap {
  param(
    [string]$ComposeFilePath,
    [string]$Profile
  )
  try {
    $args = @("compose", "-f", $ComposeFilePath)
    if ($Profile) {
      $args += @("--profile", $Profile)
    }
    $args += @("logs", "--tail=200", "web-ui")
    $nativeResult = Invoke-NativeCommand -FilePath "docker" -Arguments $args
    $text = ($nativeResult.Output | ForEach-Object { [string]$_ }) -join "`n"
    if ($nativeResult.ExitCode -ne 0) {
      $detail = ($nativeResult.Output | Select-Object -First 2) -join " "
      Add-CheckResult -Check "Web UI runtime bootstrap" -Status "WARN" -Detail "Could not inspect web-ui logs: $detail"
      return $true
    }

    if ($text -match "(?i)Installing dependencies" -or $text -match "(?i)trying to use TypeScript but do not have the required package") {
      Add-CheckResult -Check "Web UI runtime bootstrap" -Status "WARN" -Detail "Runtime dependency install marker detected in web-ui logs."
      return $true
    }

    Add-CheckResult -Check "Web UI runtime bootstrap" -Status "PASS" -Detail "No runtime dependency bootstrap marker detected."
    return $true
  } catch {
    Add-CheckResult -Check "Web UI runtime bootstrap" -Status "WARN" -Detail ($_.Exception.Message)
    return $true
  }
}

Write-Host "== Core Stack Verification ==" -ForegroundColor Cyan
$BaseUrl = Resolve-BaseUrl -ConfiguredBaseUrl $BaseUrl
$WebUrl = Resolve-WebUrl -ConfiguredWebUrl $WebUrl
Write-Host "API Base URL: $BaseUrl"
Write-Host "Web URL: $WebUrl"

$dockerOk = Test-Command -Check "Docker version" -FilePath "docker" -Arguments @("--version")
$composeOk = Test-Command -Check "Docker Compose version" -FilePath "docker" -Arguments @("compose", "version")

if ($dockerOk -and $composeOk) {
  Test-ComposeConfig -Check "Legacy compose config" -ComposeFilePath "docker-compose.yml" | Out-Null
  Test-ComposeConfig -Check "Architecture compose config ($ComposeProfile profile)" -ComposeFilePath $ComposeFile -Profiles @($ComposeProfile) | Out-Null
  Test-ComposeConfig -Check "Architecture compose config (experimental profile)" -ComposeFilePath $ComposeFile -Profiles @("experimental") | Out-Null
  Test-ComposeRuntime -ComposeFilePath $ComposeFile -Profile $ComposeProfile -RequiredServices @("aika-shell", "mcp-worker", "web-ui") | Out-Null
  if (-not $SkipWeb) {
    Test-WebUiRuntimeBootstrap -ComposeFilePath $ComposeFile -Profile $ComposeProfile | Out-Null
  }
}

if (-not $SkipWeb) {
  Test-Endpoint -Check "Web UI endpoint" -Method "GET" -Uri $WebUrl | Out-Null
} else {
  Add-CheckResult -Check "Web UI checks" -Status "WARN" -Detail "Skipped by -SkipWeb."
}

if (-not $SkipApi) {
  $healthOk = Test-Endpoint -Check "API health" -Method "GET" -Uri "$BaseUrl/health"
  if ($healthOk) {
    Test-Endpoint -Check "MCP tools list" -Method "GET" -Uri "$BaseUrl/api/tools" | Out-Null
    Test-Endpoint -Check "Audit chain verify" -Method "GET" -Uri "$BaseUrl/api/audit/verify" -AllowAuthFailure | Out-Null
    if ($IncludeWriteChecks) {
      Test-Endpoint -Check "Daily digest build" -Method "POST" -Uri "$BaseUrl/api/aika/digests" -BodyJson '{"type":"daily"}' | Out-Null
    } else {
      Add-CheckResult -Check "Daily digest build" -Status "PASS" -Detail "Skipped (read-only mode). Use -IncludeWriteChecks to run."
    }
  } else {
    Add-CheckResult -Check "API-dependent checks" -Status "WARN" -Detail "Skipped because API health failed."
  }
} else {
  Add-CheckResult -Check "API checks" -Status "WARN" -Detail "Skipped by -SkipApi."
}

Write-Host ""
$results | Format-Table -AutoSize

$failCount = @($results | Where-Object { $_.Status -eq "FAIL" }).Count
$warnCount = @($results | Where-Object { $_.Status -eq "WARN" }).Count
$passCount = @($results | Where-Object { $_.Status -eq "PASS" }).Count

Write-Host ""
Write-Host "Summary: PASS=$passCount WARN=$warnCount FAIL=$failCount"

if ($failCount -gt 0) {
  exit 1
}

exit 0
