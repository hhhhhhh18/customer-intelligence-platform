# End-to-end setup: database -> migration -> dataset -> load -> segment ->
# recommend -> outcomes -> anomalies -> detect -> validate.
#
# Safe to re-run: it never drops unrelated data, and the loader only replaces
# the analytics tables it owns.
[CmdletBinding()]
param(
  [ValidateSet('small', 'medium', 'full')]
  [string]$Profile = 'small',
  [int]$Seed = 20261022,
  [switch]$SkipDataGeneration,
  [switch]$SkipLoad
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  Write-Host '=== 1/6 database ===' -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot 'db-start.ps1')

  Write-Host '=== 2/6 prisma migrate + generate ===' -ForegroundColor Cyan
  npm --prefix backend run db:generate
  if ($LASTEXITCODE -ne 0) { throw 'prisma generate failed' }
  npm --prefix backend run db:migrate
  if ($LASTEXITCODE -ne 0) { throw 'prisma migrate failed' }

  if (-not $SkipDataGeneration) {
    Write-Host "=== 3/6 generate dataset ($Profile, seed $Seed) ===" -ForegroundColor Cyan
    python data-engine/main.py --profile $Profile --seed $Seed
    if ($LASTEXITCODE -ne 0) { throw 'data generation failed' }
  }

  if (-not $SkipLoad) {
    Write-Host '=== 4/6 bulk load (COPY) ===' -ForegroundColor Cyan
    npm --prefix backend run data:load
    if ($LASTEXITCODE -ne 0) { throw 'dataset load failed' }
  }

  Write-Host '=== 5/6 segmentation -> recommendations -> outcomes -> anomalies -> detectors ===' -ForegroundColor Cyan
  npx --prefix backend tsx backend/src/scripts/run-full-pipeline.ts
  if ($LASTEXITCODE -ne 0) { throw 'pipeline failed' }

  Write-Host '=== 6/6 validation ===' -ForegroundColor Cyan
  npm --prefix backend run validate
  if ($LASTEXITCODE -ne 0) { throw 'validation failed' }

  Write-Host 'Pipeline complete.' -ForegroundColor Green
  Write-Host 'Start the apps with: pwsh -File scripts/dev.ps1'
}
finally {
  Pop-Location
}
