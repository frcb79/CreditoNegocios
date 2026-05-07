# Automatic Database Migration Runner for Railway
# This script opens a Railway shell and executes the migration

# PowerShell: Run database migration
# Usage: .\scripts\migrate-db-windows.ps1

Write-Host "🚆 Railway Database Migration" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# Check if railway CLI is installed
try {
    railway status > $null 2>&1
} catch {
    Write-Host "❌ Railway CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   npm install -g @railway/cli" -ForegroundColor Yellow
    exit 1
}

Write-Host "Connecting to Railway..."
Write-Host ""
Write-Host "📝 Instructions:" -ForegroundColor Yellow
Write-Host "1. Railway shell will open with environment variables" -ForegroundColor Gray
Write-Host "2. Run: npm run db:migrate" -ForegroundColor Gray
Write-Host "3. Type: exit" -ForegroundColor Gray
Write-Host ""
Write-Host "Starting Railway shell..." -ForegroundColor Cyan
Write-Host ""

# This opens an interactive shell
# The user must run: npm run db:migrate
railroad shell --silent
