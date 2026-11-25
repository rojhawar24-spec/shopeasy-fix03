$ErrorActionPreference = 'Stop'

$Source = $PSScriptRoot
$Target = Join-Path $env:USERPROFILE 'Downloads\ShopEasy-2.8.93-R12.11-E2-REPAIR9-FULL-2026-11-01 (1)'

Write-Host 'ShopEasy REPAIR12 installer' -ForegroundColor Cyan
Write-Host "Source: $Source"
Write-Host "Target: $Target"

if (-not (Test-Path -LiteralPath (Join-Path $Source 'package.json'))) {
    throw 'The extracted REPAIR12 source folder is invalid: package.json was not found.'
}
if (-not (Test-Path -LiteralPath (Join-Path $Target 'package.json'))) {
    throw "The existing ShopEasy project was not found: $Target"
}
if (-not (Test-Path -LiteralPath (Join-Path $Target '.env'))) {
    throw 'The existing .env file is missing. Installation stopped without changing files.'
}
if (-not (Test-Path -LiteralPath (Join-Path $Target 'data\shop.db'))) {
    throw 'The existing data\shop.db file is missing. Installation stopped without changing files.'
}

# Never stop another application or replace live source files while the server
# is running. The user stops ShopEasy with Ctrl+C in its npm start window first.
$Listeners = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
if ($Listeners) {
    $Details = foreach ($ServerPid in $Listeners) {
        $ProcessInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$ServerPid" -ErrorAction SilentlyContinue
        [pscustomobject]@{ PID = $ServerPid; CommandLine = $ProcessInfo.CommandLine }
    }
    $Details | Format-Table -AutoSize
    throw 'Port 3000 is still in use. Stop ShopEasy with Ctrl+C in its npm start PowerShell window, then run this installer again. No files were copied.'
}

$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Backup = Join-Path (Split-Path $Target -Parent) "ShopEasy-REPAIR12-PREINSTALL-BACKUP-$Stamp"
Write-Host "Creating full pre-install backup: $Backup" -ForegroundColor Yellow
robocopy $Target $Backup /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /XD node_modules .git
if ($LASTEXITCODE -ge 8) {
    throw "Backup failed with Robocopy code $LASTEXITCODE. Installation stopped before source files were copied."
}

Write-Host 'Copying REPAIR12 source files. Existing local data is excluded.' -ForegroundColor Yellow
robocopy $Source $Target /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /XD data uploads node_modules .git /XF .env *.log
if ($LASTEXITCODE -ge 8) {
    throw "Source copy reported Robocopy code $LASTEXITCODE. The pre-install backup is available at $Backup."
}

foreach ($Required in @('package.json', '.env', 'data\shop.db', 'src\server.js', 'src\db.js', 'scripts\diagnose-checkout.mjs')) {
    if (-not (Test-Path -LiteralPath (Join-Path $Target $Required))) {
        throw "Post-copy check failed: $Required is missing. Backup: $Backup"
    }
}

Set-Location $Target
Write-Host 'Running JavaScript syntax check...' -ForegroundColor Cyan
npm run check
if ($LASTEXITCODE -ne 0) {
    throw "Syntax check failed. The pre-install backup is available at $Backup. Do not start ShopEasy yet."
}

Write-Host ''
Write-Host 'REPAIR12 source copied and syntax check passed.' -ForegroundColor Green
Write-Host "Full pre-install backup: $Backup"
Write-Host 'Next command from this project folder: npm start'
Write-Host 'After startup, run npm run diagnose:checkout in a second PowerShell window.'
Write-Host 'Do not submit a new order until the database check and order status are verified.' -ForegroundColor Yellow
