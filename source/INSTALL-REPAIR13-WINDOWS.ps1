$ErrorActionPreference = 'Stop'

$Source = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $PSScriptRoot).Path).TrimEnd('\')
$Target = [System.IO.Path]::GetFullPath((Join-Path $env:USERPROFILE 'Downloads\ShopEasy-REPAIR12-TERMINAL'))

Write-Host 'ShopEasy REPAIR13 installer' -ForegroundColor Cyan
Write-Host "Source: $Source"
Write-Host "Target: $Target"

if (-not (Test-Path -LiteralPath (Join-Path $Source 'package.json'))) {
    throw 'The extracted REPAIR13 source folder is invalid: package.json was not found.'
}
if (-not (Test-Path -LiteralPath (Join-Path $Target 'package.json'))) {
    throw "The existing ShopEasy project was not found: $Target. This installer does not create a new empty database."
}
if (-not (Test-Path -LiteralPath (Join-Path $Target '.env'))) {
    throw 'The existing .env file is missing. Installation stopped without changing files.'
}
if (-not (Test-Path -LiteralPath (Join-Path $Target 'data\shop.db'))) {
    throw 'The existing data\shop.db file is missing. Installation stopped without changing files.'
}
$TargetResolved = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Target).Path).TrimEnd('\')
$SourcePrefix = $Source.TrimEnd('\') + '\'
$TargetPrefix = $TargetResolved + '\'
if ([string]::Equals($Source.TrimEnd('\'), $TargetResolved, [System.StringComparison]::OrdinalIgnoreCase) -or
    $Source.StartsWith($TargetPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
    $TargetResolved.StartsWith($SourcePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Extract REPAIR13 into a separate, non-nested folder. Source and target may not be the same directory or contain one another.'
}

function Assert-NoReparseTree([string]$Path, [string]$Label) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $rootItem = Get-Item -Force -LiteralPath $Path -ErrorAction Stop
    if (($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "$Label is a symbolic link or junction. Installation stopped to protect the existing data."
    }
    $nestedLink = Get-ChildItem -LiteralPath $Path -Force -Recurse -ErrorAction Stop |
        Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 } |
        Select-Object -First 1
    if ($nestedLink) {
        throw "$Label contains a symbolic link or junction ($($nestedLink.FullName)). Installation stopped to avoid an incomplete backup or copy."
    }
}

# Robocopy /XJ deliberately skips junctions. Refuse protected data trees that
# contain reparse points, otherwise a successful-looking backup could omit data.
Assert-NoReparseTree (Join-Path $Target 'data') 'Target data directory'
Assert-NoReparseTree (Join-Path $Target 'uploads') 'Target uploads directory'
Assert-NoReparseTree (Join-Path $Target 'public\uploads') 'Target public uploads directory'
$NodeVersionText = & node -p "process.versions.node"
$NodeVersionExit = $LASTEXITCODE
$NodeVersion = $null
try { $NodeVersion = [version]$NodeVersionText } catch {}
if ($NodeVersionExit -ne 0 -or !$NodeVersion -or $NodeVersion.Major -ne 24 -or $NodeVersion -lt [version]'24.22.2') {
    throw "ShopEasy requires Node.js 24.22.2 or later in the 24.x line. Current version: $NodeVersionText. No files were copied."
}

# Never overwrite source while Node.js is running. The app may use a custom
# PORT from .env, so checking only port 3000 can miss a live ShopEasy process.
$RunningNode = @(Get-Process -Name node -ErrorAction SilentlyContinue)
if ($RunningNode.Count -gt 0) {
    $RunningNode | Select-Object Id, ProcessName, StartTime | Format-Table -AutoSize
    throw 'One or more Node.js processes are running. Stop ShopEasy and other Node.js tasks, confirm that no Node.js process remains, then run this installer again. No files were copied.'
}
$ConfiguredPort = 3000
$PortSetting = Get-Content -LiteralPath (Join-Path $Target '.env') -ErrorAction Stop |
    Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -Last 1
if ($PortSetting) {
    if ($PortSetting -match '^\s*PORT\s*=\s*["'']?(\d{1,5})') {
        $ConfiguredPort = [int]$Matches[1]
    } elseif ($PortSetting -notmatch '^\s*PORT\s*=\s*(?:#.*)?$') {
        throw 'The PORT value in the existing .env cannot be parsed safely. Installation stopped without changing files.'
    }
}
if ($ConfiguredPort -lt 1 -or $ConfiguredPort -gt 65535) {
    throw "The PORT value in the existing .env is invalid ($ConfiguredPort). Installation stopped without changing files."
}
$ConfiguredPortListeners = Get-NetTCPConnection -LocalPort $ConfiguredPort -State Listen -ErrorAction SilentlyContinue
if ($ConfiguredPortListeners) {
    $ConfiguredPortListeners | Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize
    throw "Configured ShopEasy port $ConfiguredPort is still in use by another process. Stop that service before installing. No files were copied."
}

$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$Backup = Join-Path (Split-Path $Target -Parent) "ShopEasy-REPAIR13-PREINSTALL-BACKUP-$Stamp"
Write-Host "Creating pre-install backup (includes .env, database and uploads; excludes node_modules/.git): $Backup" -ForegroundColor Yellow
robocopy $Target $Backup /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /XJ /XD node_modules .git
if ($LASTEXITCODE -ge 8) {
    throw "Backup failed with Robocopy code $LASTEXITCODE. Installation stopped before source files were copied."
}

Write-Host 'Copying REPAIR13 source. Existing local data and secrets are excluded.' -ForegroundColor Yellow
$SourceExcludedDirectories = @(
    (Join-Path $Source 'data'),
    (Join-Path $Source 'uploads'),
    (Join-Path $Source 'public\uploads'),
    (Join-Path $Source 'node_modules'),
    (Join-Path $Source '.git'),
    (Join-Path $Source 'logs')
) | Where-Object { Test-Path -LiteralPath $_ }
robocopy $Source $Target /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /XJ /XD $SourceExcludedDirectories /XF .env *.log *.db *.sqlite *.sqlite3
if ($LASTEXITCODE -ge 8) {
    throw "Source copy reported Robocopy code $LASTEXITCODE. The pre-install backup is available at $Backup."
}

foreach ($Required in @('package.json', '.env', 'data\shop.db', 'src\server.js', 'src\db.js', 'src\services\bank-transfer.js', 'test\bank-transfer.test.js', 'test\ai-search-expansion.test.js')) {
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
Write-Host 'REPAIR13 source copied and syntax check passed.' -ForegroundColor Green
Write-Host "Pre-install backup: $Backup (includes .env, data and uploads; node_modules/.git excluded)"
Write-Host 'Next: run npm test and review the full result before npm start.'
Write-Host 'The existing .env, data, uploads and node_modules were preserved.' -ForegroundColor Yellow
