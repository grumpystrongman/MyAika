$ErrorActionPreference = "Stop"

$base = "http://localhost:8790"
$docId = $env:GOOGLE_SMOKE_DOC_ID
$userId = $env:GOOGLE_SMOKE_USER_ID
$headers = @{}
if ($userId) { $headers["x-user-id"] = $userId }

function Invoke-Json($url) {
  try {
    $resp = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing
    if ($resp.Content) {
      Write-Host $resp.Content
      return ($resp.Content | ConvertFrom-Json)
    }
    return $null
  } catch {
    $detail = $_.ErrorDetails.Message
    if ($detail) {
      Write-Host $detail
    } else {
      Write-Host $_.Exception.Message
    }
    return $null
  }
}

Write-Host "Google status"
$status = Invoke-Json "$base/api/integrations/google/status"
if (-not $status -or -not $status.connected) {
  Write-Host "SKIP: google_not_connected (connect via UI or set GOOGLE_SMOKE_USER_ID)"
  exit 0
}

Write-Host "Drive list"
Invoke-Json "$base/api/integrations/google/drive/list?limit=5" | Out-Null

Write-Host "Calendar next"
Invoke-Json "$base/api/integrations/google/calendar/next?max=5" | Out-Null

if ($docId) {
  Write-Host "Docs get"
  Invoke-Json "$base/api/integrations/google/docs/get?docId=$docId" | Out-Null
} else {
  Write-Host "Skip docs get (set GOOGLE_SMOKE_DOC_ID)"
}
