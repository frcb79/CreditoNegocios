# Account Transfer Checklist - Project Delivery Handoff

## 📋 Overview
This document tracks **all accounts, services, credentials, and platforms** created during project development. When delivering the project to the client, use this checklist to ensure **nothing is forgotten** and to clarify billing scope.

**Use Case**: When a project moves from developer team to client team

---

## 🎯 Project: CreditoNegocios

**Client Email**: N/A - Franco's personal project (reference implementation)  
**Developer Email**: francocb79@gmail.com  
**Project Owner**: Franco CB  
**Current Status**: Development / Staging / Production Setup  
**Handoff Target Date**: N/A - Internal project

### Current Accounts (as of 2026-05-06)
- **Vercel**: francocb79-7353 (Franco's projects team)
- **Railway**: francocb79@gmail.com (CreditoNegocios service - active)
- **Supabase**: Franco's account
- **GitHub**: Franco's personal repo
- **Domain**: creditonegocios.com.mx (registered)

---

## 📊 Credentials Inventory

### 1. Vercel (Frontend Hosting)

| Item | Current Owner | Needs Transfer? | New Owner | Notes |
|------|---------------|-----------------|-----------|-------|
| **Team/Organization** | francocb79-7353 | ✅ YES | Client | Create new Vercel team/org under client email |
| **Project Access** | Franco's projects | ✅ YES | Client | Transfer project to client team |
| **Production Domain** | app.creditonegocios.com.mx | ✅ YES | Client | Update DNS nameservers to client's registry |
| **Staging Domain** | credito-negocios-staging.vercel.app | ⏸️ KEEP | Franco | Keep for support/monitoring |
| **Environment Variables** | In Vercel dashboard | ✅ YES | Client | Transfer VITE_API_URL, SUPABASE keys, etc. |
| **GitHub Integration** | Franco's GitHub | ✅ YES | Client's GitHub | Reconnect to client's GitHub repo |
| **Billing** | Franco's card | ✅ YES | Client's card | Update payment method |

**Sub-tasks**:
- [ ] Client creates Vercel account and team
- [ ] Franco adds client as team member with Admin role
- [ ] Transfer project to client team
- [ ] Update environment variables (new API URLs, keys)
- [ ] Disconnect Franco's GitHub integration
- [ ] Connect to client's GitHub repo (if applicable)
- [ ] Update billing contact and payment method
- [ ] Verify production deployment works
- [ ] Test frontend loads correctly

**Effort**: 2 hours | **Billable**: YES

---

### 2. Railway (Backend + Database)

| Item | Current Owner | Needs Transfer? | New Owner | Notes |
|------|---------------|-----------------|-----------|-------|
| **Organization** | francocb79@gmail.com | ✅ YES | Client | Create new Railway org under client email |
| **Backend Service** | creditonegocios-staging | ✅ YES | Client | Transfer service ownership |
| **Database Service** | PostgreSQL (Railway) | ✅ YES | Client | Transfer database + backups |
| **Environment Variables** | Backend container | ✅ YES | Client | NODE_ENV, API keys, Supabase credentials, etc. |
| **Billing** | Franco's payment method | ✅ YES | Client's payment method | Update billing info |
| **Monitoring/Logs** | Franco's Railway account | ⏸️ ARCHIVE | Franco | Keep backups for support |
| **Backups** | Railway auto-backups | ✅ YES | Client | Verify client can restore from backups |

**Sub-tasks**:
- [ ] Client creates Railway account and organization
- [ ] Franco invites client as organization owner
- [ ] Client accepts invitation and becomes owner
- [ ] Transfer backend service to client org
- [ ] Transfer database to client org
- [ ] Update backend environment variables
- [ ] Rotate all secrets (JWT, SESSION_SECRET, etc.)
- [ ] Update Supabase connection strings (new key)
- [ ] Test backend `/api/health` endpoint
- [ ] Verify database connectivity
- [ ] Test full registration flow (frontend → backend → database)
- [ ] Archive Franco's Railway data for support records

**Effort**: 3 hours | **Billable**: YES

---

### 3. Supabase (Database + Storage + Auth)

| Item | Current Owner | Needs Transfer? | New Owner | Notes |
|------|---------------|-----------------|-----------|-------|
| **Project Ownership** | franco_project_id | ✅ YES | Client | Transfer project to client Supabase org |
| **Database Access** | Supabase app_role | ✅ YES | Client | Update connection strings in backend |
| **Storage Buckets** | documents / uploads | ✅ YES | Client | Verify all files transfer correctly |
| **Authentication** | Replit Auth + Email | ✅ YES | Client | Keep Auth config (or migrate to Auth0/other) |
| **API Keys** | Anon & Service Role | ✅ YES | Client | Rotate both keys |
| **Billing** | Franco's payment | ✅ YES | Client's payment | Update billing contact |
| **Database Backups** | Supabase auto-backups | ✅ YES | Client | Verify restore capability |

**Sub-tasks**:
- [ ] Client creates Supabase account and organization
- [ ] Franco transfers Supabase project to client org
- [ ] Client accepts project transfer
- [ ] Generate new API keys (Anon + Service Role)
- [ ] Update backend env vars with new Supabase keys
- [ ] Update Vercel frontend env vars with new Supabase keys
- [ ] Verify all storage files are intact
- [ ] Test document upload/download functionality
- [ ] Test user authentication still works
- [ ] Verify database queries work with new keys
- [ ] Archive old API keys (mark as revoked in Supabase)

**Effort**: 2 hours | **Billable**: YES

---

### 4. Domain & DNS

| Item | Current Owner | Needs Transfer? | New Owner | Notes |
|------|---------------|-----------------|-----------|-------|
| **Domain Registration** | (registrar) | ✅ YES | Client | e.g., creditonegocios.com.mx at domain registrar |
| **DNS Records** | Franco's nameservers | ✅ YES | Client's nameservers | Update A, CNAME, MX records |
| **SSL Certificate** | Vercel managed | ✅ YES | Client | Auto-renewed by Vercel (no action needed) |
| **Email Forwarding** | (if configured) | ✅ YES | Client | Update MX records to client's mail provider |

**Sub-tasks**:
- [ ] Client takes ownership of domain at registrar
- [ ] Update nameservers to point to Vercel's DNS
- [ ] Verify DNS propagation (24-48 hours)
- [ ] Test HTTPS certificate works
- [ ] Update email forwarding if applicable

**Effort**: 1 hour | **Billable**: NO (client's responsibility)

---

### 5. GitHub / Version Control

| Item | Current Owner | Needs Transfer? | New Owner | Notes |
|------|---------------|-----------------|-----------|-------|
| **Repository** | Franco's GitHub | ✅ YES | Client | Transfer repo ownership |
| **Branches** | main, develop, staging | ✅ YES | Client | All history preserved |
| **Secrets** | GitHub Actions secrets | ✅ YES | Client | Rotate API keys in GitHub secrets |
| **Deploy Keys** | Vercel + Railway integrations | ✅ YES | Client's integrations | Disconnect Franco's keys |

**Sub-tasks**:
- [ ] Client creates GitHub account (if needed)
- [ ] Franco transfers repository to client's account/org
- [ ] Client accepts repository transfer
- [ ] Update GitHub secrets (new API keys)
- [ ] Reconnect GitHub to Vercel (client's account)
- [ ] Reconnect GitHub to Railway (client's account)
- [ ] Delete Franco's deploy keys from GitHub
- [ ] Verify CI/CD pipelines still work

**Effort**: 1.5 hours | **Billable**: YES

---

## 🔐 Secrets & API Keys to Rotate

**Critical**: Rotate ALL keys before handing off. Old keys must become inactive.

| Service | Key Type | Current Status | Action | Notes |
|---------|----------|----------------|--------|-------|
| Supabase | Anon Key | Active | Rotate | Used by frontend |
| Supabase | Service Role Key | Active | Rotate | Used by backend |
| Railway | Environment Variables | Active | Update | JWT_SECRET, SESSION_SECRET, etc. |
| Vercel | Environment Variables | Active | Update | VITE_API_URL, Supabase keys, etc. |
| GitHub | Deploy Keys | Active | Delete | Remove Franco's SSH keys |
| Replit Auth | REPL_ID / SESSION_SECRET | Active | Verify/Update | If still using Replit Auth |

**Rotation Steps**:
1. Generate new keys in each platform
2. Update environment variables in Vercel + Railway
3. Deploy updated backend and frontend
4. Verify everything works with new keys
5. Mark old keys as revoked/inactive
6. Archive old keys for audit trail (don't delete)

**Effort**: 2 hours | **Billable**: YES

---

## 📱 Third-Party Services

| Service | Status | Owner | Action | Notes |
|---------|--------|-------|--------|-------|
| **Email (Resend/SendGrid)** | TBD | Franco | Transfer | If applicable |
| **Google Analytics** | TBD | Franco | Transfer | If applicable |
| **Monitoring/Observability** | TBD | Franco | Transfer | If applicable |
| **CDN** | TBD | Franco | Transfer | If applicable |

---

## ✅ Pre-Handoff Validation

**1 Week Before Handoff**: Complete ALL transfers, then run validation

### Backend Validation
```bash
# Test with client credentials
curl https://[CLIENT_BACKEND_URL]/api/health

# Expected Response
{ "status": "ok", "database": "ok" }
```

### Frontend Validation
```bash
# Test production domain
https://app.creditonegocios.com.mx

# Checklist:
- [ ] Page loads without CORS errors
- [ ] Login page displays correctly
- [ ] Can register new user
- [ ] Can upload documents
- [ ] Can create credit
- [ ] Can export PDF
```

### Database Validation
```sql
-- Verify data integrity
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM clients;
SELECT COUNT(*) FROM credits;

-- Verify storage
SELECT * FROM storage.buckets WHERE name IN ('documents', 'uploads');
```

### Access Validation
```bash
# Confirm client can:
- [ ] Access Vercel dashboard
- [ ] Deploy new versions
- [ ] Access Railway dashboard
- [ ] View backend logs
- [ ] Access Supabase dashboard
- [ ] Download database backups
- [ ] Access GitHub repository
- [ ] Push code changes
```

---

## 📞 Post-Handoff Support Plan

**Who handles what?**

| Area | Client | Franco (Support) | Notes |
|------|--------|------------------|-------|
| **Bug Fixes** | TBD | TBD | To be negotiated |
| **Feature Requests** | TBD | TBD | To be negotiated |
| **Security Updates** | TBD | TBD | To be negotiated |
| **Database Backups** | Client responsible | Franco available for help | Weekly backups via Supabase |
| **Emergency Access** | Franco has read-only access | N/A | For troubleshooting only |

---

## 💰 Billing Impact

### Current (Franco's Team)
- **Vercel**: $X/month (varies by usage)
- **Railway**: $X/month (varies by usage)
- **Supabase**: $X/month (varies by usage)
- **Domain**: $X/year
- **Email Service**: $X/month (if applicable)

### After Handoff (Client's Team)
- **All services** transfer to client's billing
- **Franco's team**: $0/month (project removed)
- **Client's team**: Full cost

---

## 📋 Final Handoff Checklist

- [ ] All credentials transferred to client
- [ ] All API keys rotated
- [ ] All environment variables updated
- [ ] All platform access verified
- [ ] Pre-handoff validation tests pass
- [ ] Client can deploy new versions
- [ ] Client can access all dashboards
- [ ] Client can restore from backups
- [ ] Documentation updated with new URLs/keys
- [ ] Emergency support plan documented
- [ ] Franco's access downgraded to read-only (if applicable)
- [ ] Final sign-off from client

**Estimated Total Effort**: 8-10 hours  
**Estimated Billable Hours**: 6-8 hours (excluding domain transfer which is client responsibility)

---

## 📝 Sign-Off

- **Delivered By**: 
- **Received By**: 
- **Date**: 
- **Notes**: 

---

**Last Updated**: 2026-05-06  
**Document Version**: 1.0  
**Reference**: MASTER_CREDENTIALS_TEMPLATE.md, PROJECT_BRAIN.md
