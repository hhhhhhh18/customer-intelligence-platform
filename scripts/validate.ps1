# Runs API validation + the full test suite and prints a compact summary.
[CmdletBinding()]
param([switch]$TestsOnly)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  if (-not $TestsOnly) {
    Write-Host '=== data validation ===' -ForegroundColor Cyan
    npm --prefix backend run validate
  }

  Write-Host '=== test suite ===' -ForegroundColor Cyan
  npm --prefix backend test
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
