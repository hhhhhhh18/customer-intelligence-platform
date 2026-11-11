# Stops the project-local PostgreSQL cluster without deleting any data.
[CmdletBinding()]
param([int]$Port = 5433)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root '.pgdata'

$pgBin = $env:PG_BIN
if (-not $pgBin) {
  $candidates = @(
    'C:\Program Files\PostgreSQL\17\bin',
    'C:\Program Files\PostgreSQL\16\bin',
    'C:\Program Files\PostgreSQL\15\bin'
  ) | Where-Object { Test-Path (Join-Path $_ 'pg_ctl.exe') }
  if (-not $candidates) { throw 'PostgreSQL binaries not found. Set $env:PG_BIN to the bin directory.' }
  $pgBin = $candidates[0]
}

if (-not (Test-Path $dataDir)) {
  Write-Host '[db] no local cluster found - nothing to stop'
  exit 0
}

& (Join-Path $pgBin 'pg_ctl.exe') -D $dataDir stop -m fast
Write-Host '[db] stopped (data preserved)'
