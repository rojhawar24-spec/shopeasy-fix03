#Requires -Version 5.1
# Requires Node.js >=24.22.2 <25.
# Source files are never rewritten. Installation and checks run in a private copy.
[CmdletBinding()]
param([string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'ShopEasy-release-output'))
$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { $nodeCommand = Get-Command node -ErrorAction Stop }
& $nodeCommand.Source (Join-Path $PSScriptRoot 'scripts\verify-and-package.mjs') '--output' $OutputDirectory
if ($LASTEXITCODE -ne 0) { throw ('Release verification stopped with exit ' + $LASTEXITCODE + '. No release is certified by this script.') }
