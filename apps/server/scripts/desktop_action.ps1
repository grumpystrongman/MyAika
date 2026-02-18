param(
  [Parameter(Mandatory = $true)][string]$ActionJson,
  [Parameter(Mandatory = $true)][string]$ArtifactDir
)

$ErrorActionPreference = "Stop"

function Ensure-Assembly($name) {
  try {
    Add-Type -AssemblyName $name -ErrorAction Stop | Out-Null
  } catch {
    # ignore
  }
}

function Convert-KeyCombo($combo) {
  if (-not $combo) { return "" }
  if ($combo -match "^\{.+\}$") { return $combo }
  $parts = $combo -split "\+"
  if ($parts.Count -eq 1) { return $combo }
  $mods = ""
  for ($i = 0; $i -lt $parts.Count - 1; $i += 1) {
    $mod = $parts[$i].Trim().ToUpper()
    if ($mod -eq "CTRL" -or $mod -eq "CONTROL") { $mods += "^" }
    if ($mod -eq "ALT") { $mods += "%" }
    if ($mod -eq "SHIFT") { $mods += "+" }
  }
  $key = $parts[$parts.Count - 1].Trim().ToUpper()
  switch ($key) {
    "ENTER" { $key = "{ENTER}" }
    "TAB" { $key = "{TAB}" }
    "ESC" { $key = "{ESC}" }
    "ESCAPE" { $key = "{ESC}" }
    "BACKSPACE" { $key = "{BACKSPACE}" }
    "DELETE" { $key = "{DELETE}" }
    "UP" { $key = "{UP}" }
    "DOWN" { $key = "{DOWN}" }
    "LEFT" { $key = "{LEFT}" }
    "RIGHT" { $key = "{RIGHT}" }
  }
  return "$mods$key"
}

Ensure-Assembly "System.Windows.Forms"
Ensure-Assembly "System.Drawing"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class DesktopNative {
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")]
  public static extern void mouse_event(int flags, int dx, int dy, int data, int extraInfo);
}
"@ -ErrorAction SilentlyContinue | Out-Null

$MOUSEEVENTF_LEFTDOWN = 0x02
$MOUSEEVENTF_LEFTUP = 0x04
$MOUSEEVENTF_RIGHTDOWN = 0x08
$MOUSEEVENTF_RIGHTUP = 0x10

$action = $ActionJson | ConvertFrom-Json
$artifact = $null
$artifactType = $null

try {
  if (-not (Test-Path $ArtifactDir)) {
    New-Item -ItemType Directory -Path $ArtifactDir -Force | Out-Null
  }

  $type = $action.type
  switch ($type) {
    "launch" {
      if (-not $action.target) { throw "launch_target_missing" }
      Start-Process -FilePath $action.target | Out-Null
    }
    "wait" {
      $ms = [int]($action.ms)
      if ($ms -lt 0) { $ms = 0 }
      Start-Sleep -Milliseconds $ms
    }
    "type" {
      [System.Windows.Forms.SendKeys]::SendWait([string]$action.text)
    }
    "key" {
      $combo = Convert-KeyCombo $action.combo
      if (-not $combo) { throw "key_combo_missing" }
      [System.Windows.Forms.SendKeys]::SendWait($combo)
    }
    "mouseMove" {
      [DesktopNative]::SetCursorPos([int]$action.x, [int]$action.y) | Out-Null
    }
    "mouseClick" {
      [DesktopNative]::SetCursorPos([int]$action.x, [int]$action.y) | Out-Null
      $button = ([string]$action.button).ToLower()
      $count = [int]($action.count)
      if ($count -lt 1) { $count = 1 }
      for ($i = 0; $i -lt $count; $i += 1) {
        if ($button -eq "right") {
          [DesktopNative]::mouse_event($MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
          Start-Sleep -Milliseconds 50
          [DesktopNative]::mouse_event($MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
        } else {
          [DesktopNative]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
          Start-Sleep -Milliseconds 50
          [DesktopNative]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        }
        Start-Sleep -Milliseconds 80
      }
    }
    "clipboardSet" {
      [System.Windows.Forms.Clipboard]::SetText([string]$action.text)
    }
    "screenshot" {
      $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
      $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
      $safeName = ([string]$action.name).Trim()
      if (-not $safeName) { $safeName = "desktop" }
      $safeName = $safeName -replace "[^a-zA-Z0-9_-]", "-"
      $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
      $fileName = "desktop_${safeName}_${timestamp}.png"
      $filePath = Join-Path $ArtifactDir $fileName
      $bitmap.Save($filePath, [System.Drawing.Imaging.ImageFormat]::Png)
      $graphics.Dispose()
      $bitmap.Dispose()
      $artifact = $fileName
      $artifactType = "screenshot"
    }
    default {
      throw "unsupported_action_type"
    }
  }

  $payload = @{
    ok = $true
    artifact = $artifact
    artifactType = $artifactType
  }
  $payload | ConvertTo-Json -Compress
} catch {
  $payload = @{
    ok = $false
    error = $_.Exception.Message
  }
  $payload | ConvertTo-Json -Compress
  exit 1
}
