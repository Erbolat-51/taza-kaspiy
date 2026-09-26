<#
.SYNOPSIS
  Останавливает демо «Таза Каспий»: сервер (вместе с процессом CLIP) и cloudflared-туннель.
#>
param([switch]$Quiet)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = $PSScriptRoot
$pidsFile = Join-Path $root '.demo\pids.json'
$stopped = 0

function Kill-Tree([int]$processId) {
  if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
    # /T — вместе с дочерними (node → воркер CLIP)
    taskkill /PID $processId /T /F 2>$null | Out-Null
    $script:stopped++
  }
}

if (Test-Path $pidsFile) {
  $pids = Get-Content $pidsFile -Raw | ConvertFrom-Json
  Kill-Tree $pids.server
  Kill-Tree $pids.cloudflared
  Remove-Item $pidsFile
}

# Страховка: осиротевшие процессы демо (если pids.json потерян)
Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'tunnel --url http://127\.0\.0\.1:3000' } |
  ForEach-Object { Kill-Tree $_.ProcessId }
$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $listener) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue
  if ($proc -and $proc.CommandLine -match 'dist\\src\\index\.js') { Kill-Tree $p }
}

if (-not $Quiet) {
  if ($stopped) { Write-Host "✔ Демо остановлено (процессов: $stopped)" -ForegroundColor Green }
  else { Write-Host 'Демо не было запущено' -ForegroundColor Yellow }
}
