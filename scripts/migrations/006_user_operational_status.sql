-- Migración Aditiva: Estado Operativo de Usuarios (active, suspended, inactive) y Auditoría
-- Preserva compatibilidad total con is_active y can_originate

-- 1. Agregar columnas si no existen
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status_changed_at" TIMESTAMP;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status_changed_by" VARCHAR;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status_change_reason" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status_change_notes" TEXT;

-- 2. Backfill / Sincronización con usuarios existentes
-- Preservar coherencia: si is_active era false, el estado operativo es inactive
UPDATE "users" 
SET "status" = 'inactive' 
WHERE "is_active" = false AND ("status" IS NULL OR "status" = 'active');

-- Si is_active era true o nulo, el estado operativo es active
UPDATE "users" 
SET "status" = 'active' 
WHERE ("is_active" = true OR "is_active" IS NULL) AND "status" IS NULL;

-- 3. Crear índice para optimizar consultas por estado operativo
CREATE INDEX IF NOT EXISTS "idx_users_status" ON "users" ("status");
