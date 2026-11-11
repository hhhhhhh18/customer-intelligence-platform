# Starts the project-local PostgreSQL cluster on port 5433.
# This cluster lives in .pgdata and is intentionally separate from any
# system-wide PostgreSQL install, so the project is reproducible without
# changing machine-level configuration.
[CmdletBinding()]
param(
  [int]$Port = 5433,
  [string]$Database = 'customer_intelligence'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root '.pgdata'
$logFile = Join-Path $dataDir 'server.log'

$pgBin = $env:PG_BIN
if (-not $pgBin) {
  $candidates = @(
    'C:\Program Files\PostgreSQL\17\bin',
    'C:\Program Files\PostgreSQL\16\bin',
    'C:\Program Files\PostgreSQL\15\bin'
  ) | Where-Object { Test-Path (Join-Path $_ 'pg_ctl.exe') }
  if (-not $candidates) { throw 'PostgreSQL binaries not found. Set $env:PG_BIN to the bin directory.' }
  $pgBin = $candidates | Select-Object -First 1
}

if (-not (Test-Path $dataDir)) {
  Write-Host "[db] initialising cluster in $dataDir"
  & (Join-Path $pgBin 'initdb.exe') -D $dataDir -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
}

$pgIsReady = Join-Path $pgBin 'pg_isready.exe'
$ready = & "$pgIsReady" -h localhost -p $Port 2>&1
if ($LASTEXITCODE -eq 0) {
  Write-Host "[db] cluster already accepting connections on port $Port"
} else {
  Write-Host "[db] starting cluster on port $Port"
  & (Join-Path $pgBin 'pg_ctl.exe') -D $dataDir -o "-p $Port" -l $logFile start | Out-Null
  Start-Sleep -Seconds 3
}

$exists = & (Join-Path $pgBin 'psql.exe') -h localhost -p $Port -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$Database'"
if ($exists -ne '1') {
  Write-Host "[db] creating database $Database"
  & (Join-Path $pgBin 'createdb.exe') -h localhost -p $Port -U postgres $Database
}

Write-Host "[db] ready: postgresql://postgres@localhost:$Port/$Database"
