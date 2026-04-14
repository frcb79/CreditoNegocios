# Production Cutover Checklist (30-60 min)

## T-30 min
1. Freeze deploys and schema changes.
2. Verify required env vars with preflight scripts.
3. Confirm backup/snapshot exists for database.

## T-20 min
1. Deploy backend to production host.
2. Validate backend health endpoint:
- GET /api/health returns status ok.
3. Run backend smoke:
- BACKEND_URL=https://your-backend-domain.example.com npm run smoke:backend

## T-15 min
1. Deploy frontend to Vercel.
2. Verify frontend environment vars in Vercel project settings.
3. Open app and confirm login page and static assets load.

## T-10 min
1. Run critical user flow tests:
- login
- open dashboard
- create/update client
- create/update credit
- upload one document
- download same document
2. Confirm no 5xx spikes in backend logs.

## T-5 min
1. Migrate historical documents if pending:
- npm run migrate:documents:supabase
2. Optional cleanup:
- npm run migrate:documents:supabase -- --delete-local

## T0 (go live)
1. Announce go-live.
2. Keep rollback window open for at least 60 min.

## T+15 min
1. Re-run smoke test.
2. Check /api/health.
3. Confirm active sessions and auth behavior.

## T+30 to T+60 min
1. Review errors and latency.
2. Close incident watch if stable.

## Rollback Trigger Conditions
1. /api/health degraded for more than 5 minutes.
2. Login failures above baseline.
3. Document upload/download failing consistently.

## Rollback Actions
1. Switch frontend to previous backend URL if required.
2. Roll back backend to previous release.
3. Keep migrated data; do not run destructive cleanup during rollback window.
