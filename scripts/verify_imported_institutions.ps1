param(
    [string]$BaseUrl = $env:BACKEND_URL,
    [string]$Email = $env:STAGING_EMAIL,
    [string]$Password = $env:STAGING_PASSWORD
)

if (-not $BaseUrl) { $BaseUrl = "https://creditonegocios-staging.up.railway.app" }
if (-not $Email) { $Email = "francocb79@gmail.com" }
if (-not $Password) { $Password = "Prueba1$" }

$loginBody = @{
    email = $Email
    password = $Password
} | ConvertTo-Json

try {
    $loginRes = Invoke-WebRequest -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -SessionVariable webSession
    
    $instRes = Invoke-RestMethod -Uri "$BaseUrl/api/financial-institutions" -Method Get -WebSession $webSession
    
    Write-Host "`n========================================================" -ForegroundColor Cyan
    Write-Host "📡 CONECTADO A: $BaseUrl" -ForegroundColor Cyan
    Write-Host "👤 USUARIO: $Email" -ForegroundColor Cyan
    Write-Host "📊 TOTAL INSTITUCIONES DEVUELTAS: $($instRes.Count)" -ForegroundColor Cyan
    Write-Host "========================================================`n" -ForegroundColor Cyan

    $targets = @("Jeeves", "Kapital", "Altum", "Cualli", "Aspiria", "Pretmex")
    Write-Host "=== ESTADO DE FINANCIERAS OBJETIVO ===" -ForegroundColor Yellow
    foreach ($t in $targets) {
        $matches = $instRes | Where-Object { $_.name -match $t }
        if ($matches.Count -eq 1) {
            $fi = $matches[0]
            Write-Host "  ✅ $t`: ACTIVA (ID: $($fi.id), Nombre: `"$($fi.name)`", Activa: $($fi.isActive))" -ForegroundColor Green
        } elseif ($matches.Count -gt 1) {
            Write-Host "  ⚠️ $t`: DUPLICADA ($($matches.Count) encontradas)" -ForegroundColor Red
        } else {
            Write-Host "  ❌ $t`: NO ENCONTRADA" -ForegroundColor Red
        }
    }

    Write-Host "`n=== LISTADO COMPLETO ($($instRes.Count)) ===" -ForegroundColor Yellow
    $i = 1
    foreach ($fi in ($instRes | Sort-Object name)) {
        $status = if ($fi.isActive) { "ACTIVA" } else { "INACTIVA" }
        Write-Host ("{0,2}. [{1}] {2,-25} | ID: {3}..." -f $i, $status, $fi.name, $fi.id.Substring(0,8))
        $i++
    }
} catch {
    Write-Host "Error al conectar o consultar la API: $($_.Exception.Message)" -ForegroundColor Red
}
