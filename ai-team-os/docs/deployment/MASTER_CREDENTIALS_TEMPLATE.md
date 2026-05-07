# Master Credentials Template - Project Setup

## 📋 Overview
This file serves as a **master blueprint** for initializing a new fintech project with all necessary platform credentials and API keys. This information is **sensitive** and should be stored securely (environment variables, secret manager, etc.) - never commit to version control.

**Status**: Template / Ready for new project setup

---

## 🔐 1. Vercel Configuration

### Account Level
```
Email: developer@example.com
Team/Organization: Project Team Name
Team ID: (from vercel teams list)
Account Type: Personal / Organization
```

### Project Configuration
```
Project Name: credito-negocios
Production Domain: app.creditonegocios.com.mx (or client domain)
Staging Domain: staging.vercel.app

Environment Variables (copy to Vercel dashboard):
VITE_API_URL=https://backend-production.up.railway.app
VITE_API_STAGING_URL=https://backend-staging.up.railway.app
SUPABASE_URL=https://project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
REPL_ID=(from Replit if using)
```

### CLI Context
```bash
# Set active team (save this after first login)
vercel teams list
vercel teams switch [TEAM_ID]

# Verification
vercel whoami
```

---

## 🚆 2. Railway Configuration

### Organization Level
```
Email: developer@example.com
Organization Name: Project Org
Organization ID: (from railway teams list)
Region: us-west-1 (or preferred)
```

### Services Created
```
1. Backend Service
   Name: credito-negocios-backend
   Language: Node.js
   Memory: 512MB (staging), 1GB (production)
   
2. Database Service (if using Railway Postgres)
   Name: credito-negocios-db
   Engine: PostgreSQL 15
   Memory: 512MB
   
3. Redis (optional - for caching)
   Name: credito-negocios-redis
   Memory: 256MB
```

### Environment Variables (Backend)
```
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://user:pass@host:5432/creditonegocios
SUPABASE_URL=https://project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
SUPABASE_ANON_KEY=eyJhbGc...
JWT_SECRET=random_secret_here
SESSION_SECRET=random_secret_here
REPL_ID=(from Replit)
ISSUER_URL=https://replit.com
```

### CLI Context
```bash
# Set active project
railway status
railway list

# Verification
railway whoami
```

---

## 🗄️ 3. Supabase Configuration

### Project Level
```
Project Name: credito-negocios
Region: us-east-1 (or preferred)
Database: PostgreSQL 15
Project URL: https://xxxxx.supabase.co
Project Ref: xxxxx
```

### Authentication Methods
```
Providers Enabled:
- Email/Password
- Google OAuth
- GitHub OAuth
- (Add as needed)

JWT Secret: (auto-generated, stored in environment)
```

### Database Setup
```
Initial Database: creditonegocios

Tables Created:
- users (see schema.ts)
- clients
- credits
- documents
- productos
- financieras
- commissions
- audit_logs
```

### Storage Buckets
```
1. documents
   Visibility: Private
   Path: /documents/credit_id/filename
   
2. uploads
   Visibility: Private (or public if needed)
   Path: /uploads/user_id/filename
```

### API Keys
```
Anon Key: (public, safe for frontend)
Service Role Key: (private, backend only)
```

### CLI Context
```bash
# Link Supabase project
supabase projects list
supabase projects list -t [PROJECT_ID]

# Verification
supabase status
```

---

## 📧 4. Email Service (if applicable)

### Provider
```
Service: Resend / SendGrid / AWS SES
Account Email: support@example.com
Domain: verified-domain.com
```

### API Configuration
```
API Key: (stored in environment as RESEND_API_KEY or SENDGRID_API_KEY)
From Email: noreply@example.com
Support Email: support@example.com
```

---

## 🔑 5. Third-Party APIs

### External Services
```
Google Cloud (if using):
- Project ID: xxxxx
- Service Account Key: (stored securely)

Replit (if backend on Replit):
- REPL_ID: xxxxx
- SESSION_SECRET: random
- ISSUER_URL: https://replit.com
```

---

## ✅ Setup Checklist

### Week 1: Initial Setup
- [ ] Create Vercel account/organization
- [ ] Create Railway account/organization
- [ ] Create Supabase project
- [ ] CLI installations: `npm install -g vercel railway supabase`
- [ ] CLI logins: `vercel login`, `railway login`, `supabase login`
- [ ] Set active teams: `vercel teams switch`, `railway status`

### Week 2: Configuration
- [ ] Deploy backend to Railway (push to main/staging branch)
- [ ] Deploy frontend to Vercel (connect GitHub repo)
- [ ] Set environment variables in each platform
- [ ] Create Supabase tables and storage buckets
- [ ] Test backend health check: `GET /api/health`
- [ ] Test frontend loads: `https://app.example.com`

### Week 3: Validation
- [ ] Smoke tests pass (backend, database, CORS)
- [ ] Frontend-backend communication works
- [ ] Authentication flows work
- [ ] File uploads work

---

## 🚨 Important Notes

1. **Never commit credentials** to Git - use environment variables
2. **Rotate API keys** every 6 months in production
3. **Backup database** weekly (Supabase handles this, but verify)
4. **Monitor usage** - Railway and Supabase have usage limits
5. **Keep CLIs updated**: `npm update -g vercel railway supabase`

---

## 📊 Quick Reference Commands

```bash
# Vercel
vercel whoami
vercel teams list
vercel teams switch [ID]
vercel env ls --environment production
vercel deploy --prod

# Railway
railway login
railway whoami
railway list
railway status
railway variables

# Supabase
supabase login
supabase projects list
supabase status
supabase db push
supabase gen docs
```

---

## 🎯 For Each New Project

1. **Copy this template** and fill in project-specific values
2. **Rename to**: `PROJECT_NAME_CREDENTIALS.md`
3. **Store in**: Secure location (not Git) or environment management tool
4. **Share with team**: Via secure channel, not email
5. **Link to**: PROJECT_BRAIN.md in the project root
6. **Reference**: In ACCOUNT_TRANSFER_CHECKLIST.md when ready for handoff

---

**Last Updated**: 2026-05-06  
**Template Version**: 1.0  
**Project**: CreditoNegocios (Reference Implementation)
