# Release Commands (Staging and Production)

This file provides copy-paste command sequences to run releases in a consistent order.

## 1. Staging Release Commands

### 1.0 One-command staging validation (PowerShell)

```powershell
npm run validate:staging -- -BackendUrl https://your-backend-staging.example.com -SourceDatabaseUrl postgresql://source -TargetDatabaseUrl postgresql://target
```

Quick remote-only validation (no local DB/env preflight):

```powershell
npm run validate:staging:quick -- -BackendUrl https://your-backend-staging.example.com -SmokeReportPath reports/staging-smoke.json
```

With extended endpoint checks and JSON report:

```powershell
npm run validate:staging -- -BackendUrl https://your-backend-staging.example.com -SourceDatabaseUrl postgresql://source -TargetDatabaseUrl postgresql://target -ExtendedSmoke -SmokeReportPath reports/staging-smoke.json
```

Optional subset table comparison:

```powershell
npm run validate:staging -- -BackendUrl https://your-backend-staging.example.com -SourceDatabaseUrl postgresql://source -TargetDatabaseUrl postgresql://target -Tables users,clients,credits,documents
```

Optional skip DB compare when only API validation is needed:

```powershell
npm run validate:staging -- -BackendUrl https://your-backend-staging.example.com -SkipDbCompare
```

### 1.1 Local validation before deploy

```powershell
npm run build:server
npm run build:client
```

### 1.2 Backend staging deploy validation

Run against your deployed staging backend URL:

```powershell
$env:BACKEND_URL="https://your-backend-staging.example.com"
npm run smoke:backend
```

Extended smoke with report file:

```powershell
$env:BACKEND_URL="https://your-backend-staging.example.com"
$env:SMOKE_REPORT_PATH="reports/staging-smoke.json"
npm run smoke:backend:extended
```

Optional timeout override:

```powershell
$env:SMOKE_TIMEOUT_MS="12000"
npm run smoke:backend
```

### 1.3 Frontend staging deploy validation

```powershell
npm run preflight:frontend
```

Then open the staging frontend and validate:
1. login
2. dashboard
3. create client
4. create credit
5. upload document
6. download document

### 1.4 Historical document migration in staging

Validate env vars for migration:

```powershell
npm run preflight:migration
```

Run migration:

```powershell
npm run migrate:documents:supabase
```

Optional cleanup after verification:

```powershell
npm run migrate:documents:supabase -- --delete-local
```

### 1.5 DB migration validation (Neon to Supabase)

```powershell
$env:SOURCE_DATABASE_URL="postgresql://source"
$env:TARGET_DATABASE_URL="postgresql://target"
npm run db:compare-counts
```

Optional subset:

```powershell
$env:TABLES="users,clients,credits,documents"
npm run db:compare-counts
```

## 2. Production Release Commands

### 2.1 Pre-cutover checks

```powershell
npm run build:server
npm run build:client
```

If you have production backend variables locally available:

```powershell
npm run preflight:backend
```

### 2.2 Deploy backend first, then validate

```powershell
$env:BACKEND_URL="https://your-backend-production.example.com"
npm run smoke:backend
```

Expected:
1. GET /api/health is ok
2. GET /api/auth/user returns 200 or 401

### 2.3 Deploy frontend to Vercel

Confirm Vercel variables:
1. VITE_PUBLIC_APP_URL
2. VITE_API_BASE_URL
3. VITE_WS_BASE_URL

### 2.4 Post-deploy checks (first 15 minutes)

```powershell
$env:BACKEND_URL="https://your-backend-production.example.com"
npm run smoke:backend
```

Manual checks:
1. login
2. protected routes
3. upload and download one document
4. monitor 5xx errors

Optional production count validation:

```powershell
$env:SOURCE_DATABASE_URL="postgresql://source"
$env:TARGET_DATABASE_URL="postgresql://target"
npm run db:compare-counts
```

## 3. Rollback Command Intent

No destructive rollback commands are included here.
Use provider rollback to previous backend release and previous frontend deployment if trigger conditions are met.

## 4. Notes

1. The command `npx plugins add vercel/vercel-plugin` is not required for this repository.
2. This project is configured with vercel.json for static frontend deployment.
