# Deployment Runbook: Vercel + Supabase

## Target Architecture
- Frontend: Vercel (static build from Vite)
- Backend: persistent Node host (Railway or Render)
- Database: Supabase Postgres
- Files: Supabase Storage bucket

## 1. Supabase Setup
1. Create a Supabase project.
2. Create a storage bucket named documents (or set SUPABASE_STORAGE_BUCKET).
3. Obtain:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- Postgres connection string for DATABASE_URL

Optional validation command after import:
- PowerShell: $env:SOURCE_DATABASE_URL='postgres://...'; $env:TARGET_DATABASE_URL='postgres://...'; npm run db:compare-counts
- Bash: SOURCE_DATABASE_URL=postgres://... TARGET_DATABASE_URL=postgres://... npm run db:compare-counts

## 2. Backend Environment Variables
Use these variables in Railway/Render:
- NODE_ENV=production
- PORT (provided by platform)
- DATABASE_URL
- SESSION_SECRET
- FRONTEND_BASE_URL
- ALLOWED_ORIGINS
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_STORAGE_BUCKET=documents
- RESEND_API_KEY

Optional if Replit auth is still needed:
- REPLIT_DOMAINS
- REPL_ID
- ISSUER_URL

Reference template:
- .env.backend.example

## 3. Frontend Environment Variables (Vercel)
- VITE_PUBLIC_APP_URL=https://your-frontend-domain.vercel.app
- VITE_API_BASE_URL=https://your-backend-domain.example.com
- VITE_WS_BASE_URL=wss://your-backend-domain.example.com

Reference template:
- .env.frontend.vercel.example

## 4. Backend Provider Setup

### Railway
1. Create a new service from this repository.
2. Configure start command:
- npm run start
3. Configure build command:
- npm run build
4. Add all vars from .env.backend.example in Railway Variables.
5. Run preflight in Railway shell:
- npm run preflight:backend

### Render
1. Create a new Web Service from this repository.
2. Build command:
- npm run build
3. Start command:
- npm run start
4. Add all vars from .env.backend.example in Environment.
5. Run preflight in Render shell:
- npm run preflight:backend

## 5. Build and Deploy
1. Deploy backend first.
2. Verify backend health:
- GET /api/health should return status ok.
3. Deploy frontend in Vercel.

### Vercel Notes
- Build command: npm run build:client
- Output directory: dist/public
- SPA routing rewrite is already configured in vercel.json.
- No external vercel plugin is required for this project.

## 6. Migrate Historical Uploaded Files
After backend is configured with Supabase credentials:

1. Dry run migration (no local delete):
- npm run migrate:documents:supabase

2. Optional final pass deleting local files:
- npm run migrate:documents:supabase -- --delete-local

## 6.1 Validate Data Counts (Neon -> Supabase)
Run row-count comparison by table:
- SOURCE_DATABASE_URL=postgres://source TARGET_DATABASE_URL=postgres://target npm run db:compare-counts

Optional subset:
- TABLES=users,clients,credits SOURCE_DATABASE_URL=postgres://source TARGET_DATABASE_URL=postgres://target npm run db:compare-counts

## 7. Smoke Testing
Run from local machine or CI against deployed backend:
- PowerShell: $env:BACKEND_URL='https://your-backend-domain.example.com'; npm run smoke:backend
- Bash: BACKEND_URL=https://your-backend-domain.example.com npm run smoke:backend

Extended smoke with JSON report:
- PowerShell: $env:BACKEND_URL='https://your-backend-domain.example.com'; $env:SMOKE_REPORT_PATH='reports/smoke.json'; npm run smoke:backend:extended

Checks:
- GET /api/health
- GET /api/auth/user (expects 200 if authenticated, 401 if not)
- Extended mode also checks critical endpoints for expected 200/401 behavior.

## 8. Operational Checklist
- Confirm cookies are set with credentials in browser.
- Validate login and protected routes.
- Upload and download at least one document.
- Confirm document filePath records use supabase:// prefix for new uploads.
- Monitor logs for 5xx errors for 24-48 hours.

## 9. Rollback Guidance
- Keep previous backend deployment active for quick rollback.
- Do not delete local uploads until migration is verified.
- If storage issues occur, keep fallback flow and disable Supabase vars temporarily.

## 10. Command Sequences
- See RELEASE_COMMANDS.md for copy-paste staging and production command flows.
- One-command staging validation script: scripts/run-staging-validation.ps1
