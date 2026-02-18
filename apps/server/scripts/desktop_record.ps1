param(
  [string]$StopKey = "F8",
  [int]$SampleMs = 30,
  [int]$MaxSeconds = 180,
  [switch]$IncludeMouseMoves
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public struct POINT {
  public int X;
  public int Y;
}
public static class RecorderNative {
  [DllImport("user32.dll")]
  public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")]
  public static extern bool GetCursorPos(out POINT pt);
}
"@ | Out-Null

function Is-KeyDown([int]$vk) {
  return ([RecorderNative]::GetAsyncKeyState($vk) -band 0x8000) -ne 0
}

function Get-CursorPos {
  $pt = New-Object POINT
  [RecorderNative]::GetCursorPos([ref]$pt) | Out-Null
  return $pt
}

function Get-StopKeyCode([string]$key) {
  try {
    return [int][System.Windows.Forms.Keys]::$key
  } catch {
    return [int][System.Windows.Forms.Keys]::F8
  }
}

$stopKeyCode = Get-StopKeyCode $StopKey

$specialKeys = @{
  8 = "BACKSPACE"
  9 = "TAB"
  13 = "ENTER"
  27 = "ESC"
  33 = "PAGEUP"
  34 = "PAGEDOWN"
  35 = "END"
  36 = "HOME"
  37 = "LEFT"
  38 = "UP"
  39 = "RIGHT"
  40 = "DOWN"
  45 = "INSERT"
  46 = "DELETE"
}
for ($i = 1; $i -le 12; $i += 1) {
  $specialKeys[111 + $i] = "F$i"
}

$punctuationMap = @{
  186 = @{ normal = ";"; shift = ":" }
  187 = @{ normal = "="; shift = "+" }
  188 = @{ normal = ","; shift = "<" }
  189 = @{ normal = "-"; shift = "_" }
  190 = @{ normal = "."; shift = ">" }
  191 = @{ normal = "/"; shift = "?" }
  192 = @{ normal = "``"; shift = "~" }
  219 = @{ normal = "["; shift = "{" }
  220 = @{ normal = "\"; shift = "|" }
  221 = @{ normal = "]"; shift = "}" }
  222 = @{ normal = "'"; shift = "`"" }
}

$events = New-Object System.Collections.Generic.List[object]
$startTime = Get-Date
$lastEventTime = $startTime
$lastMovePoint = Get-CursorPos

$prevKeys = @{}
$prevLeft = $false
$prevRight = $false
$prevStop = $false

$watchedKeys = @()
for ($i = 0x30; $i -le 0x5A; $i += 1) { $watchedKeys += $i }
$watchedKeys += $specialKeys.Keys
$watchedKeys += $punctuationMap.Keys
$watchedKeys += 0x20 # space

function Add-Event([hashtable]$event) {
  $now = Get-Date
  $delayMs = [int][Math]::Max(0, ($now - $lastEventTime).TotalMilliseconds)
  $lastEventTime = $now
  $event.delayMs = $delayMs
  $events.Add($event)
}

function Get-CharFromKey([int]$vk, [bool]$shiftDown) {
  if ($vk -ge 0x41 -and $vk -le 0x5A) {
    $char = [char]$vk
    if ($shiftDown) { return $char.ToString() }
    return $char.ToString().ToLower()
  }
  if ($vk -ge 0x30 -and $vk -le 0x39) {
    $digits = "0123456789"
    $shifted = ")!@#$%^&*("
    $index = $vk - 0x30
    if ($shiftDown) { return $shifted[$index] }
    return $digits[$index]
  }
  if ($vk -eq 0x20) { return " " }
  if ($punctuationMap.ContainsKey($vk)) {
    if ($shiftDown) { return $punctuationMap[$vk].shift }
    return $punctuationMap[$vk].normal
  }
  return $null
}

function Get-ComboKeyName([int]$vk) {
  if ($specialKeys.ContainsKey($vk)) { return $specialKeys[$vk] }
  if ($vk -ge 0x41 -and $vk -le 0x5A) { return ([char]$vk).ToString().ToUpper() }
  if ($vk -ge 0x30 -and $vk -le 0x39) { return ([char]$vk).ToString() }
  try {
    return ([System.Windows.Forms.Keys]$vk).ToString().ToUpper()
  } catch {
    return ""
  }
}

$running = $true
while ($running) {
  $elapsed = (Get-Date) - $startTime
  if ($elapsed.TotalSeconds -ge $MaxSeconds) { break }

  $stopDown = Is-KeyDown $stopKeyCode
  if ($stopDown -and -not $prevStop) { break }
  $prevStop = $stopDown

  $leftDown = Is-KeyDown 0x01
  if ($leftDown -and -not $prevLeft) {
    $pt = Get-CursorPos
    Add-Event @{ type = "mouseClick"; x = $pt.X; y = $pt.Y; button = "left"; count = 1 }
  }
  $prevLeft = $leftDown

  $rightDown = Is-KeyDown 0x02
  if ($rightDown -and -not $prevRight) {
    $pt = Get-CursorPos
    Add-Event @{ type = "mouseClick"; x = $pt.X; y = $pt.Y; button = "right"; count = 1 }
  }
  $prevRight = $rightDown

  if ($IncludeMouseMoves.IsPresent) {
    $pt = Get-CursorPos
    $dx = [Math]::Abs($pt.X - $lastMovePoint.X)
    $dy = [Math]::Abs($pt.Y - $lastMovePoint.Y)
    if ($dx -ge 12 -or $dy -ge 12) {
      Add-Event @{ type = "mouseMove"; x = $pt.X; y = $pt.Y }
      $lastMovePoint = $pt
    }
  }

  foreach ($vk in $watchedKeys) {
    if ($vk -eq $stopKeyCode) { continue }
    $down = Is-KeyDown $vk
    $prev = $prevKeys[$vk]
    if ($down -and -not $prev) {
      if ($vk -eq 0x10 -or $vk -eq 0x11 -or $vk -eq 0x12) {
        $prevKeys[$vk] = $down
        continue
      }
      $shiftDown = Is-KeyDown 0x10
      $ctrlDown = Is-KeyDown 0x11
      $altDown = Is-KeyDown 0x12

      if ($ctrlDown -or $altDown) {
        $comboParts = @()
        if ($ctrlDown) { $comboParts += "CTRL" }
        if ($altDown) { $comboParts += "ALT" }
        if ($shiftDown) { $comboParts += "SHIFT" }
        $keyName = Get-ComboKeyName $vk
        if ($keyName) {
          $comboParts += $keyName
          Add-Event @{ type = "key"; combo = ($comboParts -join "+") }
        }
      } elseif ($specialKeys.ContainsKey($vk)) {
        Add-Event @{ type = "key"; combo = $specialKeys[$vk] }
      } else {
        $char = Get-CharFromKey $vk $shiftDown
        if ($char -ne $null) {
          Add-Event @{ type = "char"; value = $char }
        }
      }
    }
    $prevKeys[$vk] = $down
  }

  Start-Sleep -Milliseconds $SampleMs
}

$endTime = Get-Date
$payload = @{
  ok = $true
  startedAt = $startTime.ToString("o")
  stoppedAt = $endTime.ToString("o")
  durationMs = [int]($endTime - $startTime).TotalMilliseconds
  stopKey = $StopKey
  sampleMs = $SampleMs
  events = $events
}

$payload | ConvertTo-Json -Compress
