if (-not $env:BACKEND_URL) { $env:BACKEND_URL = "https://creditonegocios-staging.up.railway.app" }
if (-not $env:STAGING_EMAIL) { $env:STAGING_EMAIL = "francocb79@gmail.com" }
if (-not $env:STAGING_PASSWORD) {
    Write-Host "ERROR: Variable de entorno STAGING_PASSWORD no definida." -ForegroundColor Red
    Write-Host "Uso: `$env:STAGING_PASSWORD = 'tu_password'; .\scripts\run_staging_import.ps1"
    exit 1
}
$env:IMPORT_REPORT_PATH = "import-adicionales-report.json"

node scripts/staging-import-financieras.cjs --file scripts/financieras-adicionales-import.xlsx --sheet Financieras
