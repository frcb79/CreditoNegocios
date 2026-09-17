-- Custom migration: Add unique constraint and indexes to tenant_members
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_members_tenant_user_unique" ON "public"."tenant_members" ("tenant_id", "user_id");
CREATE INDEX IF NOT EXISTS "tenant_members_user_idx" ON "public"."tenant_members" ("user_id");
CREATE INDEX IF NOT EXISTS "tenant_members_tenant_idx" ON "public"."tenant_members" ("tenant_id");
