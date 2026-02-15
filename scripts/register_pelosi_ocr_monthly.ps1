$ErrorActionPreference = "Stop"

$taskName = "MyAikaPelosiOCRMonthly"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$scriptPath = Join-Path $repoRoot "apps\\server\\scripts\\ingest_pelosi_disclosures.js"
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath) { $nodePath = "node.exe" }

try {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch {
  # ignore
}

$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$scriptPath`" --ocr"
$startTime = (Get-Date).Date.AddDays(1).AddHours(3)
$interval = New-TimeSpan -Days 30
$duration = New-TimeSpan -Days 3650
$trigger = New-ScheduledTaskTrigger -Once -At $startTime -RepetitionInterval $interval -RepetitionDuration $duration

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Force | Out-Null
Write-Host "Registered OCR task (every 30 days @ 03:00): $taskName"
