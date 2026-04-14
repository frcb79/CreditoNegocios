Param(
  [Parameter(Mandatory = $false)]
  [string]$BackendUrl,

  [Parameter(Mandatory = $false)]
  [string]$SourceDatabaseUrl,

  [Parameter(Mandatory = $false)]
  [string]$TargetDatabaseUrl,

  [Parameter(Mandatory = $false)]
  [string]$Tables,

  [Parameter(Mandatory = $false)]
  [switch]$SkipDbCompare,

  [Parameter(Mandatory = $false)]
  [switch]$SkipBackendPreflight,

  [Parameter(Mandatory = $false)]
  [switch]$SkipMigrationPreflight,

  [Parameter(Mandatory = $false)]
  [switch]$ExtendedSmoke,

  [Parameter(Mandatory = $false)]
  [string]$SmokeReportPath = "smoke-report.json"
)

$ErrorActionPreference = "Stop"

function Write-Step {
  Param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Run-Checked {
  Param(
    [string]$Command,
    [string]$FailMessage
  )

  Write-Host "[run] $Command" -ForegroundColor DarkGray
  Invoke-Expression $Command
  if ($LASTEXITCODE -ne 0) {
    throw $FailMessage
  }
}

try {
  if (-not $SkipBackendPreflight) {
    Write-Step "Stage 1: Backend preflight"
    Run-Checked "npm run preflight:backend" "Backend preflight failed"
  } else {
    Write-Step "Stage 1: Backend preflight (skipped)"
  }

  if ([string]::IsNullOrWhiteSpace($BackendUrl)) {
    throw "BackendUrl is required. Example: .\\scripts\\run-staging-validation.ps1 -BackendUrl https://your-backend-staging.example.com"
  }

  $env:BACKEND_URL = $BackendUrl

  Write-Step "Stage 2: Backend smoke test"
  Run-Checked "npm run smoke:backend" "Backend smoke test failed"

  if ($ExtendedSmoke) {
    Write-Step "Stage 2.1: Extended backend smoke test"
    $env:SMOKE_REPORT_PATH = $SmokeReportPath
    Run-Checked "npm run smoke:backend:extended" "Extended backend smoke test failed"
  }

  if (-not $SkipDbCompare) {
    Write-Step "Stage 3: DB row-count comparison"

    if ([string]::IsNullOrWhiteSpace($SourceDatabaseUrl) -or [string]::IsNullOrWhiteSpace($TargetDatabaseUrl)) {
      throw "SourceDatabaseUrl and TargetDatabaseUrl are required unless -SkipDbCompare is used"
    }

    $env:SOURCE_DATABASE_URL = $SourceDatabaseUrl
    $env:TARGET_DATABASE_URL = $TargetDatabaseUrl

    if (-not [string]::IsNullOrWhiteSpace($Tables)) {
      $env:TABLES = $Tables
    } elseif ($env:TABLES) {
      Remove-Item Env:TABLES
    }

    Run-Checked "npm run db:compare-counts" "DB count comparison failed"
  }

  if (-not $SkipMigrationPreflight) {
    Write-Step "Stage 4: Migration preflight"
    Run-Checked "npm run preflight:migration" "Migration preflight failed"
  }

  Write-Step "Staging validation completed successfully"
  Write-Host "All selected checks passed." -ForegroundColor Green
  exit 0
}
catch {
  Write-Host "`n[error] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
