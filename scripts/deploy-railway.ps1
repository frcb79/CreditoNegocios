Param(
  [Parameter(Mandatory = $false)]
  [switch]$InstallRailwayCli,

  [Parameter(Mandatory = $false)]
  [switch]$SkipDeploy,

  [Parameter(Mandatory = $false)]
  [string]$BackendUrl
)

$ErrorActionPreference = "Stop"

function Write-Step {
  Param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Info {
  Param([string]$Message)
  Write-Host "[info] $Message" -ForegroundColor DarkGray
}

function Run-Checked {
  Param(
    [string]$Command,
    [string]$FailMessage
  )

  Write-Info "run: $Command"
  Invoke-Expression $Command
  if ($LASTEXITCODE -ne 0) {
    throw $FailMessage
  }
}

function ConvertTo-PlainText {
  Param([System.Security.SecureString]$Secure)

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Prompt-Value {
  Param(
    [string]$Name,
    [string]$DefaultValue = "",
    [switch]$Secret
  )

  while ($true) {
    if ($Secret) {
      $secureValue = Read-Host -Prompt "$Name (secret)" -AsSecureString
      $value = ConvertTo-PlainText $secureValue
    } else {
      $prompt = if ([string]::IsNullOrWhiteSpace($DefaultValue)) { "$Name" } else { "$Name [$DefaultValue]" }
      $value = Read-Host -Prompt $prompt
      if ([string]::IsNullOrWhiteSpace($value) -and -not [string]::IsNullOrWhiteSpace($DefaultValue)) {
        $value = $DefaultValue
      }
    }

    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value.Trim()
    }

    Write-Host "[warn] $Name es obligatorio" -ForegroundColor Yellow
  }
}

try {
  Write-Step "Paso 1: Verificar Railway CLI"
  $railwayCli = Get-Command railway -ErrorAction SilentlyContinue
  if (-not $railwayCli) {
    if (-not $InstallRailwayCli) {
      throw "Railway CLI no esta instalado. Ejecuta: npm run deploy:railway -- -InstallRailwayCli"
    }

    Run-Checked "npm install -g @railway/cli" "No se pudo instalar Railway CLI"
  }

  Write-Step "Paso 2: Login en Railway"
  try {
    railway whoami | Out-Null
  }
  catch {
    Write-Host "Se abrira Railway login en navegador." -ForegroundColor Yellow
    Run-Checked "railway login" "No se pudo iniciar sesion en Railway"
    railway whoami | Out-Null
  }

  Write-Step "Paso 3: Vincular proyecto Railway"
  try {
    railway status | Out-Null
  }
  catch {
    Write-Host "Selecciona tu proyecto y servicio backend cuando Railway lo pida." -ForegroundColor Yellow
    Run-Checked "railway link" "No se pudo vincular el proyecto Railway"
  }

  Write-Step "Paso 4: Capturar variables backend"
  $values = [ordered]@{}
  $values["NODE_ENV"] = "production"
  $values["DATABASE_URL"] = Prompt-Value -Name "DATABASE_URL"
  $values["SESSION_SECRET"] = Prompt-Value -Name "SESSION_SECRET" -Secret
  $values["FRONTEND_BASE_URL"] = Prompt-Value -Name "FRONTEND_BASE_URL" -DefaultValue "https://your-frontend-domain.vercel.app"
  $values["ALLOWED_ORIGINS"] = Prompt-Value -Name "ALLOWED_ORIGINS" -DefaultValue "$($values["FRONTEND_BASE_URL"]),http://localhost:5173"
  $values["SUPABASE_URL"] = Prompt-Value -Name "SUPABASE_URL"
  $values["SUPABASE_SERVICE_ROLE_KEY"] = Prompt-Value -Name "SUPABASE_SERVICE_ROLE_KEY" -Secret
  $values["SUPABASE_STORAGE_BUCKET"] = Prompt-Value -Name "SUPABASE_STORAGE_BUCKET" -DefaultValue "documents"
  $values["RESEND_API_KEY"] = Prompt-Value -Name "RESEND_API_KEY" -Secret

  Write-Step "Paso 5: Cargar variables en Railway"
  foreach ($entry in $values.GetEnumerator()) {
    $key = $entry.Key
    $value = $entry.Value.Replace('"', '\"')
    Run-Checked "railway variables set `"$key=$value`"" "Error al guardar variable $key"
  }

  Write-Step "Paso 6: Build local backend"
  Run-Checked "npm run build:server" "Build backend fallo"

  if (-not $SkipDeploy) {
    Write-Step "Paso 7: Deploy en Railway"
    Run-Checked "railway up" "Deploy en Railway fallo"
  } else {
    Write-Step "Paso 7: Deploy en Railway (omitido)"
  }

  if (-not [string]::IsNullOrWhiteSpace($BackendUrl)) {
    Write-Step "Paso 8: Smoke test remoto"
    $env:BACKEND_URL = $BackendUrl
    Run-Checked "npm run smoke:backend:extended" "Smoke test remoto fallo"
  } else {
    Write-Host "`n[info] Deploy finalizado. Ahora ejecuta este comando con tu URL de Railway:" -ForegroundColor Green
    Write-Host "npm run validate:staging:quick -- -BackendUrl https://tu-servicio.railway.app" -ForegroundColor Green
  }

  Write-Host "`nListo. Flujo Railway completado." -ForegroundColor Green
  exit 0
}
catch {
  Write-Host "`n[error] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
