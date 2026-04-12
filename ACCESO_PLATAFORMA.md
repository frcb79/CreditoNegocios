# Guía de Acceso a la Plataforma - Broker Fintech

## 🚀 Cómo Ingresar a la Plataforma

### Paso 1: Acceder a la Aplicación

1. **Abre el navegador** dentro de Replit (pestaña Webview) o
2. **Abre la URL** de tu aplicación en un navegador externo

### Paso 2: Iniciar Sesión

1. La página principal te mostrará un botón de **"Iniciar Sesión"** o **"Login"**
2. Haz clic en el botón de login
3. Serás redirigido a la página de autenticación de Replit
4. Elige tu método de autenticación:
   - **Google**
   - **GitHub**
   - **Email/Password**
   - **Apple**
   - **X (Twitter)**

5. Completa el proceso de autenticación
6. Serás redirigido automáticamente a la plataforma

### Paso 3: Primer Acceso

**Al iniciar sesión por primera vez:**
- El sistema creará automáticamente tu usuario en la base de datos
- **Por defecto, serás asignado como BROKER**
- Tendrás acceso limitado (solo tus propios clientes, créditos, etc.)

---

## 👤 Cambiar de Rol: De Broker a Admin

Para poder ver y administrar toda la plataforma como **admin** o **super_admin**, necesitas actualizar tu rol en la base de datos.

### Opción 1: Usando la Consola SQL de Replit

1. Ve a la pestaña **"Database"** en Replit
2. Abre la consola SQL
3. Ejecuta el siguiente comando (reemplaza con tu email):

```sql
UPDATE users 
SET role = 'super_admin' 
WHERE email = 'TU_EMAIL_AQUI@example.com';
```

### Opción 2: Usando el Script SQL Directo

Desde la terminal de Replit, ejecuta:

```bash
# Ver todos los usuarios y sus roles actuales
psql $DATABASE_URL -c "SELECT id, email, role FROM users;"

# Cambiar tu usuario a super_admin (reemplaza con tu email)
psql $DATABASE_URL -c "UPDATE users SET role = 'super_admin' WHERE email = 'tu_email@example.com';"

# Verificar el cambio
psql $DATABASE_URL -c "SELECT id, email, role FROM users WHERE email = 'tu_email@example.com';"
```

### Paso Final: Recargar la Aplicación

1. Después de cambiar tu rol a `super_admin`
2. **Cierra sesión** en la aplicación (botón de logout)
3. **Inicia sesión nuevamente**
4. Ahora tendrás acceso completo como administrador

---

## 🎭 Tipos de Roles y Permisos

### 1. **BROKER** (Por defecto)
**Permisos:**
- ✅ Ver y gestionar sus propios clientes
- ✅ Crear y gestionar créditos de sus clientes
- ✅ Ver sus propias comisiones
- ✅ Subir documentos de sus clientes
- ✅ Ver oportunidades de renovación de sus clientes
- ✅ Ver catálogo de financieras (solo lectura)
- ✅ Ver catálogo de productos (solo lectura)
- ✅ Solicitar nuevas financieras
- ✅ Dashboard con métricas personales

**Restricciones:**
- ❌ NO puede ver clientes de otros brokers
- ❌ NO puede ver la red de brokers
- ❌ NO puede acceder a reportes generales
- ❌ NO puede editar financieras o productos
- ❌ NO puede gestionar usuarios

**Navegación visible:**
- Dashboard
- Clientes
- Gestión de Créditos
- Financieras (solo lectura)
- Productos (solo lectura)
- Renovaciones
- Configuración

---

### 2. **MASTER_BROKER**
**Permisos adicionales:**
- ✅ Ver datos de su red de brokers (cuando se activa `includeNetwork=true`)
- ✅ Dashboard con métricas de red
- ✅ Gestionar su equipo de brokers

**Navegación visible:**
- Todas las del broker +
- Red de Brokers (su equipo)

---

### 3. **ADMIN / SUPER_ADMIN**
**Permisos completos:**
- ✅ Ver y gestionar TODOS los clientes
- ✅ Ver y gestionar TODOS los créditos
- ✅ Ver TODAS las comisiones
- ✅ Gestionar financieras (crear, editar, eliminar)
- ✅ Gestionar productos (crear, editar, eliminar)
- ✅ Gestionar usuarios y roles
- ✅ Acceso a reportes completos
- ✅ Aprobar solicitudes de nuevas financieras
- ✅ Procesar solicitudes de baja de cuenta
- ✅ Control de calidad (devolver créditos con feedback)

**Navegación visible:**
- Dashboard (métricas globales)
- Clientes (todos)
- Gestión de Créditos (todos)
- Financieras (edición completa)
- Productos (edición completa)
- Renovaciones (todas)
- Red de Brokers (todos)
- Reportes
- Configuración

---

## 🔄 Cambiar Entre Vistas (Testing)

### Para Testing: Ver la plataforma como diferentes roles

**Método 1: Cambiar el rol en la base de datos**
```sql
-- Ver como broker
UPDATE users SET role = 'broker' WHERE email = 'tu_email@example.com';

-- Ver como master_broker
UPDATE users SET role = 'master_broker' WHERE email = 'tu_email@example.com';

-- Ver como admin
UPDATE users SET role = 'super_admin' WHERE email = 'tu_email@example.com';
```

Después de cada cambio:
1. Cierra sesión
2. Inicia sesión nuevamente
3. La interfaz se adaptará automáticamente al nuevo rol

**Método 2: Crear múltiples usuarios de prueba**

Puedes crear diferentes usuarios con diferentes emails y roles:

```sql
-- Insertar usuario broker de prueba
INSERT INTO users (id, email, first_name, last_name, role)
VALUES ('broker-test-1', 'broker@test.com', 'Test', 'Broker', 'broker');

-- Insertar usuario admin de prueba
INSERT INTO users (id, email, first_name, last_name, role)
VALUES ('admin-test-1', 'admin@test.com', 'Test', 'Admin', 'super_admin');
```

Luego usa diferentes navegadores o modo incógnito para login con diferentes cuentas.

---

## 🛠️ Comandos Útiles

### Ver todos los usuarios y sus roles:
```bash
psql $DATABASE_URL -c "SELECT id, email, COALESCE(first_name, 'N/A') as name, role, is_active FROM users ORDER BY role, email;"
```

### Hacer a un usuario inactivo (en lugar de eliminar):
```bash
psql $DATABASE_URL -c "UPDATE users SET is_active = false WHERE email = 'usuario@example.com';"
```

### Reactivar un usuario:
```bash
psql $DATABASE_URL -c "UPDATE users SET is_active = true WHERE email = 'usuario@example.com';"
```

### Ver estadísticas de usuarios por rol:
```bash
psql $DATABASE_URL -c "SELECT role, COUNT(*) as total, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as activos FROM users GROUP BY role;"
```

---

## ⚠️ Notas Importantes

1. **Persistencia de Roles**: Una vez creado un usuario, su rol se preserva **permanentemente** en la base de datos y NO cambia automáticamente en cada login (por seguridad). Los roles solo se pueden cambiar mediante:
   - Gestión de Usuarios (desde la UI como admin)
   - Comandos SQL directos (ver sección "Comandos Útiles")

2. **Primer Usuario**: El primer usuario que se registre será creado como `broker` por defecto y debe ser convertido manualmente a `super_admin` para inicializar el sistema

3. **Testing de Roles**: Para probar diferentes perfiles de usuario:
   - Cambia tu rol en la BD usando SQL
   - Cierra sesión
   - Inicia sesión nuevamente
   - El nuevo rol se aplicará inmediatamente

4. **Seguridad**: Los brokers NUNCA pueden cambiar su propio rol desde la aplicación - solo un admin puede hacerlo

5. **Solicitudes de Baja**: Los brokers pueden solicitar la desactivación de su cuenta, pero solo un admin puede procesarla

6. **Replit Auth**: La autenticación usa Replit Auth (OAuth/OIDC) - **NO** envía roles en los claims. Los roles se gestionan exclusivamente desde la base de datos

---

## 📞 Soporte

Si tienes problemas para acceder:

1. Verifica que el servidor esté corriendo (puerto 5000)
2. Revisa los logs en la consola de Replit
3. Asegúrate de que las variables de entorno estén configuradas:
   - `REPL_ID` ✅
   - `SESSION_SECRET` ✅
   - `ISSUER_URL` ✅
   - `DATABASE_URL` ✅

4. Si persiste el error "Invalid authentication request", reinicia el servidor

---

## ✨ Producción

Esta configuración de Replit Auth funciona perfectamente para producción:

- ✅ **Escalable**: Infraestructura enterprise-grade (Firebase, Google Cloud)
- ✅ **Segura**: Encriptación automática, protección contra fraude
- ✅ **Global**: Disponible en todo el mundo
- ✅ **Confiable**: Funciona tanto en desarrollo como en apps publicadas
- ✅ **Sin Configuración Manual**: Todo se gestiona automáticamente

**Al publicar tu app:**
- Replit Auth seguirá funcionando sin cambios
- Los usuarios podrán autenticarse desde cualquier dispositivo
- La seguridad se mantiene al más alto nivel
