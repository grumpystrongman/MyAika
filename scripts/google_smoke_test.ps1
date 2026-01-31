$ErrorActionPreference = "Stop"

$base = "http://localhost:8790"
$docId = $env:GOOGLE_SMOKE_DOC_ID

Write-Host "Google status"
Invoke-WebRequest -Uri "$base/api/integrations/google/status" -UseBasicParsing | Select-Object -ExpandProperty Content | Write-Host

Write-Host "Drive list"
Invoke-WebRequest -Uri "$base/api/integrations/google/drive/list?limit=5" -UseBasicParsing | Select-Object -ExpandProperty Content | Write-Host

Write-Host "Calendar next"
Invoke-WebRequest -Uri "$base/api/integrations/google/calendar/next?max=5" -UseBasicParsing | Select-Object -ExpandProperty Content | Write-Host

if ($docId) {
  Write-Host "Docs get"
  Invoke-WebRequest -Uri "$base/api/integrations/google/docs/get?docId=$docId" -UseBasicParsing | Select-Object -ExpandProperty Content | Write-Host
} else {
  Write-Host "Skip docs get (set GOOGLE_SMOKE_DOC_ID)"
}
