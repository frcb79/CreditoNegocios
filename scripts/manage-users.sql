-- ============================================
-- SCRIPTS DE GESTIÓN DE USUARIOS Y ROLES
-- Plataforma Broker Fintech
-- ============================================

-- ============================================
-- 1. CONSULTAS DE INFORMACIÓN
-- ============================================

-- Ver todos los usuarios con sus roles y estado
SELECT 
    id,
    email,
    COALESCE(first_name || ' ' || last_name, email) as nombre_completo,
    role as rol,
    is_active as activo,
    created_at as fecha_creacion
FROM users
ORDER BY role, email;

-- Ver estadísticas por rol
SELECT 
    role as rol,
    COUNT(*) as total_usuarios,
    SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as usuarios_activos,
    SUM(CASE WHEN NOT is_active THEN 1 ELSE 0 END) as usuarios_inactivos
FROM users
GROUP BY role
ORDER BY 
    CASE role
        WHEN 'super_admin' THEN 1
        WHEN 'admin' THEN 2
        WHEN 'master_broker' THEN 3
        WHEN 'broker' THEN 4
        ELSE 5
    END;

-- Buscar usuario por email
SELECT 
    id,
    email,
    COALESCE(first_name || ' ' || last_name, 'Sin nombre') as nombre_completo,
    role as rol,
    is_active as activo,
    phone as telefono,
    created_at as fecha_creacion,
    updated_at as ultima_actualizacion
FROM users
WHERE email = 'REEMPLAZAR_CON_EMAIL@example.com';

-- ============================================
-- 2. CAMBIOS DE ROL
-- ============================================

-- IMPORTANTE: Después de cambiar el rol, el usuario debe 
-- cerrar sesión y volver a iniciar sesión para que tome efecto

-- Convertir usuario a SUPER_ADMIN (por email)
UPDATE users 
SET 
    role = 'super_admin',
    updated_at = NOW()
WHERE email = 'REEMPLAZAR_CON_EMAIL@example.com';

-- Convertir usuario a ADMIN (por email)
UPDATE users 
SET 
    role = 'admin',
    updated_at = NOW()
WHERE email = 'REEMPLAZAR_CON_EMAIL@example.com';

-- Convertir usuario a MASTER_BROKER (por email)
UPDATE users 
SET 
    role = 'master_broker',
    updated_at = NOW()
WHERE email = 'REEMPLAZAR_CON_EMAIL@example.com';

-- Convertir usuario a BROKER (por email)
UPDATE users 
SET 
    role = 'broker',
    updated_at = NOW()
WHERE email = 'REEMPLAZAR_CON_EMAIL@example.com';

-- ============================================
-- 3. ACTIVAR/DESACTIVAR USUARIOS
-- ============================================

-- Desactivar usuario (en lugar de eliminar)
UPDATE users 
SET 
    is_active = false,
    updated_at = NOW()
WHERE email = 'REEMPLAZAR_CON_EMAIL@example.com';

-- Reactivar usuario
UPDATE users 
SET 
    is_active = true,
    updated_at = NOW()
WHERE email = 'REEMPLAZAR_CON_EMAIL@example.com';

-- Ver usuarios inactivos
SELECT 
    id,
    email,
    COALESCE(first_name || ' ' || last_name, email) as nombre_completo,
    role as rol,
    updated_at as fecha_desactivacion
FROM users
WHERE is_active = false
ORDER BY updated_at DESC;

-- ============================================
-- 4. CONFIGURACIÓN INICIAL DEL SISTEMA
-- ============================================

-- Hacer al PRIMER usuario registrado super_admin
-- (Ejecutar solo una vez al inicializar el sistema)
UPDATE users 
SET 
    role = 'super_admin',
    updated_at = NOW()
WHERE id = (
    SELECT id 
    FROM users 
    ORDER BY created_at ASC 
    LIMIT 1
);

-- Verificar quién es el primer usuario
SELECT 
    id,
    email,
    COALESCE(first_name || ' ' || last_name, email) as nombre_completo,
    role as rol,
    created_at as fecha_creacion
FROM users
ORDER BY created_at ASC
LIMIT 1;

-- ============================================
-- 5. GESTIÓN DE MASTER BROKERS Y SUS EQUIPOS
-- ============================================

-- Ver master brokers y cuántos brokers tienen en su equipo
SELECT 
    mb.id as master_broker_id,
    mb.email as master_broker_email,
    COALESCE(mb.first_name || ' ' || mb.last_name, mb.email) as master_broker_nombre,
    COUNT(b.id) as total_brokers_en_equipo
FROM users mb
LEFT JOIN users b ON b.master_broker_id = mb.id
WHERE mb.role = 'master_broker'
GROUP BY mb.id, mb.email, mb.first_name, mb.last_name
ORDER BY total_brokers_en_equipo DESC;

-- Asignar un broker a un master broker
UPDATE users 
SET 
    master_broker_id = 'ID_DEL_MASTER_BROKER',
    updated_at = NOW()
WHERE email = 'EMAIL_DEL_BROKER@example.com'
AND role = 'broker';

-- Ver todos los brokers de un master broker específico
SELECT 
    b.id,
    b.email,
    COALESCE(b.first_name || ' ' || b.last_name, b.email) as nombre_completo,
    b.is_active as activo,
    COUNT(c.id) as total_clientes
FROM users b
LEFT JOIN clients c ON c.broker_id = b.id
WHERE b.master_broker_id = 'ID_DEL_MASTER_BROKER'
AND b.role = 'broker'
GROUP BY b.id, b.email, b.first_name, b.last_name, b.is_active
ORDER BY total_clientes DESC;

-- ============================================
-- 6. ANÁLISIS Y REPORTES
-- ============================================

-- Ver brokers con más clientes
SELECT 
    u.id as broker_id,
    u.email as broker_email,
    COALESCE(u.first_name || ' ' || u.last_name, u.email) as broker_nombre,
    COUNT(DISTINCT c.id) as total_clientes,
    COUNT(DISTINCT cr.id) as total_creditos,
    COALESCE(SUM(CASE WHEN cr.status = 'dispersed' THEN cr.amount ELSE 0 END), 0) as monto_total_dispersado
FROM users u
LEFT JOIN clients c ON c.broker_id = u.id
LEFT JOIN credits cr ON cr.client_id = c.id
WHERE u.role IN ('broker', 'master_broker')
AND u.is_active = true
GROUP BY u.id, u.email, u.first_name, u.last_name
ORDER BY total_clientes DESC
LIMIT 20;

-- Ver actividad de usuarios (últimos logins)
-- Nota: Esto requeriría un campo last_login_at en la tabla users
-- Para implementarlo, agregar: last_login_at TIMESTAMP en el schema

-- Ver usuarios creados recientemente
SELECT 
    id,
    email,
    COALESCE(first_name || ' ' || last_name, email) as nombre_completo,
    role as rol,
    is_active as activo,
    created_at as fecha_registro
FROM users
WHERE created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;

-- ============================================
-- 7. LIMPIEZA Y MANTENIMIENTO
-- ============================================

-- Ver usuarios sin actividad (sin clientes ni créditos)
SELECT 
    u.id,
    u.email,
    COALESCE(u.first_name || ' ' || u.last_name, u.email) as nombre_completo,
    u.role as rol,
    u.created_at as fecha_registro,
    COUNT(c.id) as total_clientes
FROM users u
LEFT JOIN clients c ON c.broker_id = u.id
WHERE u.role IN ('broker', 'master_broker')
GROUP BY u.id, u.email, u.first_name, u.last_name, u.role, u.created_at
HAVING COUNT(c.id) = 0
ORDER BY u.created_at DESC;

-- ============================================
-- 8. TESTING - CREAR USUARIOS DE PRUEBA
-- ============================================

-- Crear usuario broker de prueba
INSERT INTO users (id, email, first_name, last_name, role, is_active, created_at, updated_at)
VALUES (
    gen_random_uuid()::text,
    'broker.test@example.com',
    'Broker',
    'Prueba',
    'broker',
    true,
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Crear usuario admin de prueba
INSERT INTO users (id, email, first_name, last_name, role, is_active, created_at, updated_at)
VALUES (
    gen_random_uuid()::text,
    'admin.test@example.com',
    'Admin',
    'Prueba',
    'super_admin',
    true,
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Crear usuario master broker de prueba
INSERT INTO users (id, email, first_name, last_name, role, is_active, created_at, updated_at)
VALUES (
    gen_random_uuid()::text,
    'master.test@example.com',
    'Master',
    'Broker',
    'master_broker',
    true,
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- 9. VERIFICACIONES RÁPIDAS
-- ============================================

-- ¿Cuántos admins hay?
SELECT COUNT(*) as total_admins
FROM users
WHERE role IN ('super_admin', 'admin')
AND is_active = true;

-- ¿Cuántos brokers activos hay?
SELECT COUNT(*) as total_brokers_activos
FROM users
WHERE role = 'broker'
AND is_active = true;

-- ¿Hay algún super_admin?
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'SÍ - Sistema inicializado correctamente'
        ELSE 'NO - Necesitas crear un super_admin'
    END as estado_sistema,
    COUNT(*) as total_super_admins
FROM users
WHERE role = 'super_admin'
AND is_active = true;

-- ============================================
-- NOTAS IMPORTANTES
-- ============================================

/*
1. SEGURIDAD:
   - Solo admins pueden cambiar roles de otros usuarios
   - Los cambios de rol requieren cerrar sesión y volver a entrar
   - En producción, los roles NO cambian automáticamente

2. JERARQUÍA DE ROLES:
   - super_admin: Acceso total al sistema
   - admin: Acceso administrativo completo
   - master_broker: Gestiona su equipo de brokers
   - broker: Acceso solo a sus datos

3. MEJORES PRÁCTICAS:
   - Siempre desactivar usuarios en lugar de eliminarlos
   - Mantener al menos 1 super_admin activo
   - Revisar periódicamente usuarios inactivos
   - Documentar cambios importantes de roles

4. COMANDOS DESDE TERMINAL:
   Para ejecutar estos scripts desde la terminal de Replit:
   
   psql $DATABASE_URL -c "QUERY_AQUI"
   
   Ejemplo:
   psql $DATABASE_URL -c "SELECT email, role FROM users;"
*/
