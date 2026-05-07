# Fix Staging Registration - SQL Migration

## Problem
Registration endpoint returns 500 error because database is missing auth-related columns:
- `password` - for hashed password storage
- `auth_method` - to track if auth is via Replit or local
- `reset_token` - for password reset
- `reset_token_expiry` - for token expiration
- `is_active` - to deactivate users
- `updated_at` - to track last update

## Solution
Execute this SQL migration on the staging PostgreSQL database in Railway.

## Files
- **Migration SQL**: `scripts/migrations/001_add_auth_columns_to_users.sql`
- **Migration Script**: `scripts/apply-migration.js`

## Execution Options

### ✅ Option 1: Run During Next Deployment (Recommended)
Add migration to GitHub Actions workflow or Railway deployment hook.
The migration script exists and will run automatically when deployed.

### Option 2: Manual via psql tunnel
```bash
# In one terminal, create SSH tunnel to Railway database
railway open postgres

# In another terminal
psql $DATABASE_URL < scripts/migrations/001_add_auth_columns_to_users.sql
```

### Option 3: Via Railway Dashboard UI
1. Go to https://railway.app/dashboard
2. Select CreditoNegocios project
3. Select Postgres service
4. Go to "Connect" tab
5. Use credentials to connect via SQL client
6. Execute the SQL from `scripts/migrations/001_add_auth_columns_to_users.sql`

### Option 4: Direct Node Script (with proper tunneling)
```bash
# Terminal 1: Create tunnel
railway tunnel

# Terminal 2: Run migration
DATABASE_URL=postgresql://localhost:5432/... npm run db:migrate
```

## Migration SQL
```sql
ALTER TABLE IF EXISTS public.users
ADD COLUMN IF NOT EXISTS password VARCHAR,
ADD COLUMN IF NOT EXISTS auth_method VARCHAR DEFAULT 'replit',
ADD COLUMN IF NOT EXISTS reset_token VARCHAR,
ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

UPDATE public.users 
SET 
  auth_method = 'replit',
  is_active = TRUE,
  updated_at = NOW()
WHERE auth_method IS NULL;
```

## Verification
After running the migration, verify with:
```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name='users' AND table_schema='public'
ORDER BY ordinal_position;
```

Expected output should include:
- id
- email
- password ✅
- auth_method ✅
- reset_token ✅
- reset_token_expiry ✅
- first_name
- last_name
- role
- is_active ✅
- created_at
- updated_at ✅
- ... (other columns)

## Testing After Migration
1. Navigate to staging: https://credito-negocios-staging.vercel.app
2. Click "Iniciar Sesión" → "Registrarse"
3. Fill in:
   - Email: test-email-{timestamp}@example.com
   - Password: Test123!@#
   - Nombre: Test
   - Apellido: User
4. Click "Registrarse"
5. Should see success message or redirect to login (no 500 error)

## Status
- [ ] Migration applied to staging database
- [ ] Registration endpoint tested and working
- [ ] User created successfully
- [ ] Login works with new user
