# Import Financieras from Excel
# This script imports financial institutions and products from Excel into staging

## Prerequites
- ✅ Backend running on https://creditonegocios-staging.up.railway.app
- ✅ Excel file at: `G:\Mi unidad\CHAMBA\CREDITO NEGOCIOS\App Desarrollo\Ficha Crédito Simple.xlsx`
- ⏳ Authentication credentials (email/password or session cookie)

## Quick Start

### Option 1: Using Email/Password (Easiest)
```bash
cd c:\Users\Usuario1\FRCB\CreditoNegocios-Main\CreditoNegocios

BACKEND_URL="https://creditonegocios-staging.up.railway.app" \
STAGING_EMAIL="francocb79@gmail.com" \
STAGING_PASSWORD="YOUR_PASSWORD_HERE" \
npm run import:financieras:staging -- --file "G:\Mi unidad\CHAMBA\CREDITO NEGOCIOS\App Desarrollo\Ficha Crédito Simple.xlsx"
```

### Option 2: Using PowerShell (Windows)
```powershell
cd "c:\Users\Usuario1\FRCB\CreditoNegocios-Main\CreditoNegocios"

$env:BACKEND_URL = "https://creditonegocios-staging.up.railway.app"
$env:STAGING_EMAIL = "francocb79@gmail.com"
$env:STAGING_PASSWORD = "YOUR_PASSWORD_HERE"
$env:IMPORT_BATCH_SIZE = "50"

npm run import:financieras:staging -- `
  --file "G:\Mi unidad\CHAMBA\CREDITO NEGOCIOS\App Desarrollo\Ficha Crédito Simple.xlsx" `
  --sheet "Hoja1"
```

## Environment Variables

| Variable | Required | Example |
|----------|----------|---------|
| `BACKEND_URL` | ✅ YES | https://creditonegocios-staging.up.railway.app |
| `STAGING_EMAIL` | ✅ YES* | francocb79@gmail.com |
| `STAGING_PASSWORD` | ✅ YES* | password123 |
| `STAGING_AUTH_COOKIE` | ✅ YES* | (alternative to email/password) |
| `IMPORT_BATCH_SIZE` | NO | 100 (default) |
| `IMPORT_REPORT_PATH` | NO | import-report.json (default) |
| `IMPORT_STRICT_MODE` | NO | true (default - stops on validation error) |

*Use either (EMAIL+PASSWORD) OR (AUTH_COOKIE)

## File Format

The Excel file should have columns:
- nombre_financiera (Required)
- tipo_producto (Required)
- perfil_cliente (Required) - one of: persona_moral, fisica_empresarial, fisica, sin_sat
- monto_minimo
- monto_maximo
- plazo_meses
- tasa_interes
- comision_apertura
- ... (see full schema in scripts/staging-import-financieras.cjs)

## Output

The script generates a report with:
- ✅ Successfully imported records
- ❌ Failed records with error details
- ⚠️ Warnings and validation messages

Report saved to: `import-financieras-report.json` (default)

## Troubleshooting

### "Login falló"
- Check STAGING_EMAIL and STAGING_PASSWORD are correct
- Verify backend is running: curl https://creditonegocios-staging.up.railway.app/api/health

### "Archivo no encontrado"
- Check file path is correct
- Use full absolute path or relative path from project root

### "Campo obligatorio vacío"
- Check Excel file has: nombre_financiera, tipo_producto, perfil_cliente for each row
- Disable strict mode: IMPORT_STRICT_MODE=false (skips validation errors)

### "Perfil inválido"
- Valid values: persona_moral, fisica_empresarial, fisica, sin_sat
- Check spelling and case in Excel

## Next Steps

1. Replace "YOUR_PASSWORD_HERE" with actual password
2. Run the command in PowerShell/Terminal
3. Check the report file for results
4. Go to staging at https://credito-negocios-staging.vercel.app to verify import
5. Login → Dashboard → Financieras (should show imported items)
