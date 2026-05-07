-- Migration: Add missing auth columns to users table
-- Description: Supabase staging table is missing columns defined in schema.ts
-- Purpose: Fix registration endpoint error (authMethod/password not found)

-- Check current columns
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name='users' AND table_schema='public';

-- Step 1: Add missing columns if they don't exist
ALTER TABLE IF EXISTS public.users
ADD COLUMN IF NOT EXISTS password VARCHAR,
ADD COLUMN IF NOT EXISTS auth_method VARCHAR DEFAULT 'replit',
ADD COLUMN IF NOT EXISTS reset_token VARCHAR,
ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Step 2: Update existing rows to have default values
UPDATE public.users 
SET 
  auth_method = 'replit',
  is_active = TRUE,
  updated_at = NOW()
WHERE auth_method IS NULL;

-- Step 3: Verify columns were added
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name='users' AND table_schema='public'
ORDER BY ordinal_position;
