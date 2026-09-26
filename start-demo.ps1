<#
.SYNOPSIS
  «Таза Каспий»: запуск демо с этого ноутбука через Cloudflare quick tunnel.

.DESCRIPTION
  1. Останавливает предыдущий запуск (stop-demo.ps1).
  2. Собирает web и server, если сборки нет (или с флагом -Rebuild).
  3. Поднимает cloudflared quick tunnel на http://127.0.0.1:3000 и вытаскивает выданный
     https://*.trycloudflare.com адрес (каждый запуск — новый).
  4. Прописывает его в PUBLIC_URL (.env) — ссылки «Картада» в боте ведут на публичный адрес.
  5. Запускает сервер в прод-режиме (NODE_ENV=production, слушает только 127.0.0.1 —
     снаружи доступ только через туннель). Бот работает в polling.
  6. Проверяет health локально и через туннель, печатает ссылки.

.EXAMPLE
  .\start-demo.ps1            # обычный запуск
  .\start-demo.ps1 -Rebuild   # пересобрать web и server перед запуском
#>
param([switch]$Rebuild, [switch]$ServerOnly)
# -ServerOnly: перезапустить только сервер (например, после npm run db:clean);
#              туннель и публичная ссылка остаются прежними.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = $PSScriptRoot
$demoDir = Join-Path $root '.demo'
$envFile = Join-Path $root '.env'
$port = 3000
$localUrl = "http://127.0.0.1:$port"

function Step($text) { Write-Host "▸ $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "✖ $text" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $envFile)) { Fail '.env не найден — скопируйте .env.example в .env и заполните.' }
New-Item -ItemType Directory -Force $demoDir | Out-Null

# 0. Предыдущий запуск
$pidsFile = Join-Path $demoDir 'pids.json'
if ($ServerOnly) {
  # Туннель оставляем, перезапускаем только сервер — ссылка не меняется
  if (-not (Test-Path $pidsFile)) { Fail 'Демо не запущено — запустите без -ServerOnly' }
  $prev = Get-Content $pidsFile -Raw | ConvertFrom-Json
  if (-not (Get-Process -Id $prev.cloudflared -ErrorAction SilentlyContinue)) {
    Fail 'Туннель не работает — запустите без -ServerOnly'
  }
  if (Get-Process -Id $prev.server -ErrorAction SilentlyContinue) {
    taskkill /PID $prev.server /T /F 2>$null | Out-Null
  }
  Start-Sleep -Milliseconds 500
} else {
  & (Join-Path $root 'stop-demo.ps1') -Quiet
}

# 1. cloudflared
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) {
  foreach ($p in 'C:\Program Files (x86)\cloudflared\cloudflared.exe', 'C:\Program Files\cloudflared\cloudflared.exe') {
    if (Test-Path $p) { $cf = $p; break }
  }
}
if (-not $cf) { Fail 'cloudflared не найден. Установите: winget install Cloudflare.cloudflared' }

# 2. Сборка
Push-Location $root
try {
  if ($Rebuild -or -not (Test-Path (Join-Path $root 'web\dist\index.html'))) {
    Step 'Сборка web…'
    npm run -s build:web | Out-Host
    if ($LASTEXITCODE) { Fail 'Сборка web не удалась' }
  }
  if ($Rebuild -or -not (Test-Path (Join-Path $root 'server\dist\src\index.js'))) {
    Step 'Сборка server…'
    npm run -s build:server | Out-Host
    if ($LASTEXITCODE) { Fail 'Сборка server не удалась' }
  }
} finally { Pop-Location }

# 3. Туннель
if ($ServerOnly) {
  $cfProc = Get-Process -Id $prev.cloudflared
  $publicUrl = $prev.url
  Step "Туннель работает: $publicUrl"
} else {
Step 'Запуск Cloudflare quick tunnel…'
$cfLog = Join-Path $demoDir 'cloudflared.log'
Remove-Item $cfLog -ErrorAction SilentlyContinue
$cfProc = Start-Process -FilePath $cf -PassThru -WindowStyle Hidden -ArgumentList @(
  # http2 (TCP 443) вместо QUIC/UDP: у части провайдеров UDP режется и туннель рвётся (ошибка 1033)
  'tunnel', '--url', $localUrl, '--protocol', 'http2', '--no-autoupdate', '--logfile', $cfLog
)

$publicUrl = $null
for ($i = 0; $i -lt 60 -and -not $publicUrl; $i++) {
  Start-Sleep -Milliseconds 500
  if ($cfProc.HasExited) { Fail "cloudflared завершился. Лог: $cfLog" }
  if (Test-Path $cfLog) {
    $m = Select-String -Path $cfLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($m) { $publicUrl = $m.Matches[0].Value }
  }
}
if (-not $publicUrl) { Fail "Не удалось получить адрес туннеля за 30 с. Лог: $cfLog" }

# 4. PUBLIC_URL в .env — без BOM (иначе dotenv-парсер испортит первую переменную)
$text = [System.IO.File]::ReadAllText($envFile)
if ($text -match '(?m)^PUBLIC_URL=.*$') {
  $text = [regex]::Replace($text, '(?m)^PUBLIC_URL=.*$', "PUBLIC_URL=$publicUrl")
} else {
  $text = $text.TrimEnd() + "`nPUBLIC_URL=$publicUrl`n"
}
[System.IO.File]::WriteAllText($envFile, $text, (New-Object System.Text.UTF8Encoding $false))
}

# 5. Сервер в прод-режиме (переменные окружения важнее .env — так задумано Node --env-file)
Step 'Запуск сервера (NODE_ENV=production)…'
$srvLog = Join-Path $demoDir 'server.log'
$env:NODE_ENV = 'production'
$env:HOST = '127.0.0.1'
$srvProc = Start-Process -FilePath 'cmd.exe' -PassThru -WindowStyle Hidden `
  -WorkingDirectory (Join-Path $root 'server') `
  -ArgumentList '/c', "node --env-file=..\.env dist\src\index.js > `"$srvLog`" 2>&1"
Remove-Item Env:NODE_ENV, Env:HOST

@{ cloudflared = $cfProc.Id; server = $srvProc.Id; url = $publicUrl; startedAt = (Get-Date).ToString('s') } |
  ConvertTo-Json | Set-Content -Path (Join-Path $demoDir 'pids.json') -Encoding UTF8

# 6. Health: локально, затем через туннель (DNS нового поддомена появляется через несколько секунд)
$localHealth = $null
for ($i = 0; $i -lt 60 -and -not $localHealth; $i++) {
  Start-Sleep -Milliseconds 500
  try { $localHealth = Invoke-RestMethod "$localUrl/api/health" -TimeoutSec 3 } catch { }
}
if (-not $localHealth) { Fail "Сервер не ответил за 30 с. Лог: $srvLog" }

Step 'Проверка через туннель…'
$publicHealth = $null
# Пауза до первого запроса: иначе Windows закэширует «нет такого имени» для ещё не созданного DNS
Start-Sleep -Seconds 8
for ($i = 0; $i -lt 40 -and -not $publicHealth; $i++) {
  try { $publicHealth = Invoke-RestMethod "$publicUrl/api/health" -TimeoutSec 5 } catch { Start-Sleep -Seconds 2 }
}

# 7. Итог — крупно, чтобы не пропустить
$line = '═' * 72
Write-Host ''
Write-Host $line -ForegroundColor Green
Write-Host ''
Write-Host '   ТАЗА КАСПИЙ — ДЕМО ЗАПУЩЕНО' -ForegroundColor Green
Write-Host ''
Write-Host '   ПУБЛИЧНАЯ ССЫЛКА (новая при каждом запуске):' -ForegroundColor White
Write-Host ''
Write-Host "   >>>   $publicUrl   <<<" -ForegroundColor Black -BackgroundColor Yellow
Write-Host ''
Write-Host "   Карта:     $publicUrl/"
Write-Host "   Админка:   $publicUrl/admin"
Write-Host "   Health:    $publicUrl/api/health"
Write-Host ''
if ($publicHealth) {
  Write-Host "   ✔ через туннель: db=$($publicHealth.db), dbMs=$($publicHealth.dbMs)" -ForegroundColor Green
} else {
  Write-Host '   ⚠ туннель ещё не отвечает (DNS). Подождите 10–20 с и откройте ссылку.' -ForegroundColor Yellow
}
Write-Host "   ✔ локально:      db=$($localHealth.db), dbMs=$($localHealth.dbMs)" -ForegroundColor Green
Write-Host '   ✔ бот: polling, ссылки «Картада» ведут на новый адрес' -ForegroundColor Green
Write-Host ''
Write-Host "   Логи:  .demo\server.log, .demo\cloudflared.log"
Write-Host '   Стоп:  .\stop-demo.ps1'
Write-Host ''
Write-Host $line -ForegroundColor Green
