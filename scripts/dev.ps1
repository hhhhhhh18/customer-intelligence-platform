# Starts both applications in separate windows.
#   API      -> http://localhost:4000
#   Frontend -> http://localhost:3000
[CmdletBinding()]
param(
  [switch]$NoFrontend,
  [switch]$NoBackend
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

& (Join-Path $PSScriptRoot 'db-start.ps1')

if (-not $NoBackend) {
 Start-Process -FilePath 'powershell.exe' -WorkingDirectory (Join-Path $root 'backend') `
    -ArgumentList '-NoExit', '-Command', 'npm run dev' -WindowStyle Hidden
  Write-Host '[dev] backend starting on http://localhost:4000'
}

if (-not $NoFrontend) {
  Start-Process -FilePath 'powershell.exe' -WorkingDirectory (Join-Path $root 'frontend') `
    -ArgumentList '-NoExit', '-Command', 'npm run dev' -WindowStyle Hidden
  Write-Host '[dev] frontend starting on http://localhost:3000'
}

Start-Sleep -Seconds 8
foreach ($url in @('http://localhost:4000/api/health', 'http://localhost:3000/dashboard')) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 20
    Write-Host "[dev] $url -> $($response.StatusCode)"
  }
  catch {
    Write-Host "[dev] $url -> not ready yet ($($_.Exception.Message))"
  }
}
