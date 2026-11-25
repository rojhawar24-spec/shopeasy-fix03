#Requires -Version 5.1
# Compatibility entrypoint: the same isolated verification/package workflow.
[CmdletBinding()]
param([string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'ShopEasy-release-output'))
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'FINALIZE-AND-VERIFY-WINDOWS.ps1') -OutputDirectory $OutputDirectory
