# Bloque 3.1 — Actividad y Bitácora de Usuarios

Estado: implementación aislada en `feat/bloque-3-1-user-activity`.  
No desplegar ni fusionar sin revisión técnica y pruebas en staging.

## 1. Objetivo

Dar trazabilidad real de utilización de Crédito Negocios sin convertir la plataforma en un sistema de captura de clics.

Debe responder:

- Quién ingresó y cuándo.
- Cuántas sesiones y días activos tiene en un periodo.
- Cuánto tiempo estuvo activamente usando la plataforma, de forma aproximada.
- Qué módulos utilizó.
- Qué acciones significativas realizó.
- Qué usuarios u organizaciones muestran baja o nula actividad.
- Qué eventos de seguridad ocurrieron.

## 2. Separación arquitectónica

### `sessions`
Sesiones técnicas de Express/connect-pg-simple. Se conservan exclusivamente para autenticación.

### `user_activity_sessions`
Sesiones de utilización del producto.

Campos principales:
- `user_id`
- `tenant_id`
- `started_at`
- `last_activity_at`
- `ended_at`
- `active_seconds`
- `heartbeat_count`
- `entry_module`
- `last_module`
- `modules_visited`
- `ip_address`
- `user_agent`
- `end_reason`

### `user_activity_events`
Bitácora de eventos relevantes de negocio, gobierno y seguridad.

No debe utilizarse para registrar cada clic ni cada GET de navegación.

## 3. Tiempo activo

El frontend envía heartbeat cada 60 segundos únicamente cuando:

1. La pestaña está visible.
2. Hubo interacción del usuario en los últimos 90 segundos.

El servidor:

- calcula el tiempo transcurrido desde el heartbeat anterior;
- limita cada incremento a 75 segundos;
- si existe un hueco superior a 120 segundos, el siguiente heartbeat suma 0 para no contabilizar el periodo inactivo;
- considera una sesión abandonada como terminada cuando lleva 15 minutos sin actividad.

Por lo tanto:

**Tiempo activo aproximado != login hasta logout.**

## 4. Scope multi-tenant

La visibilidad se restringe por organización.

### Super Admin / Admin plataforma
- Puede consultar todos los usuarios.
- Puede filtrar por organización.
- Al filtrar por organización, sesiones y eventos se restringen a ese `tenant_id`.

### Owner / Admin de organización
- Sólo puede consultar miembros activos de sus organizaciones administrables.
- Sesiones y eventos se restringen a esas organizaciones.

### Usuario sin facultades administrativas
- Backend sólo permite consultar su propia actividad.
- La UI de administración no expone la vista de equipo.

Nunca se debe autorizar únicamente por `user_id`, porque una persona puede pertenecer a más de una organización.

## 5. Eventos iniciales

### Auth / Seguridad
- `auth.login`
- `auth.logout`
- `auth.login_failed`
- `auth.password_reset`

### Clientes
- `client.created`
- `client.updated`
- `client.deleted`

### Créditos
- `credit.created`
- `credit.updated`
- `credit.deleted`

### Documentos
- `document.uploaded`
- `document.updated`
- `document.deleted`
- `document.downloaded`

### Solicitudes
- `submission.changed`

### Comisiones
- `commission.changed`

### Gobierno de usuarios
- `user_membership.changed`
- `user_status.changed`

El middleware sólo clasifica rutas explícitamente reconocidas. Las consultas de lectura ordinarias no generan eventos.

## 6. Privacidad y datos sensibles

La metadata se sanea antes de persistir eventos.

Nunca guardar en metadata:
- password
- token
- resetToken
- CLABE
- accountNumber
- authorization

IP y User-Agent sí se conservan porque forman parte de la vista de seguridad solicitada.

Recomendación posterior a MVP: definir política formal de retención, por ejemplo:
- eventos de seguridad/auditoría: 24 meses;
- sesiones analíticas: 12 meses;
- agregados estadísticos: mayor retención si se requieren tendencias históricas.

## 7. UI

Ruta existente:

`Administración → Usuarios`

Nueva pestaña:

`Actividad y Bitácora`

Disponible para:
- Super Admin / Admin plataforma;
- Master Broker;
- owners/admins de organizaciones con permisos de gestión.

La vista incluye:
- usuarios activos del periodo;
- sesiones;
- tiempo activo acumulado;
- usuarios que nunca ingresaron;
- filtro de 7 / 30 / 90 días;
- filtro por organización;
- búsqueda;
- detalle por persona.

Detalle:
- Resumen
- Actividad
- Seguridad

## 8. Campos rápidos en users

Se agregan:
- `first_login_at`
- `last_login_at`
- `last_seen_at`

Sirven para listados y consultas rápidas. El histórico real permanece en las tablas de actividad.

## 9. Criterios de aceptación

### Auth
- Login válido crea exactamente una sesión de uso.
- Registro que inicia sesión crea una sesión de uso.
- Logout cierra la sesión con `end_reason=logout`.
- Sesión abandonada se cierra lógicamente por timeout.
- Login fallido crea evento de seguridad sin guardar contraseña.
- Password reset exitoso crea evento de seguridad.

### Tiempo
- Usuario activo durante ~10 minutos registra aproximadamente 10 minutos.
- Dejar la pestaña abierta sin interacción no continúa sumando horas.
- Regresar después de una ausencia prolongada no suma el hueco de inactividad.

### Módulos
- Cambio de ruta registra el módulo en la sesión.
- Un módulo no se duplica dentro de `modules_visited`.

### Eventos
- Crear cliente registra `client.created`.
- Modificar cliente registra `client.updated`.
- Descargar documento registra `document.downloaded`.
- Operaciones no incluidas en whitelist no generan ruido.

### Multi-tenant
- Owner de Tenant A no puede consultar sesiones o eventos de Tenant B.
- Usuario compartido entre Tenant A y B no filtra actividad cruzada.
- Super Admin puede consultar global y filtrar por tenant.

### UI
- Super Admin ve pestaña Actividad y Bitácora.
- Master Broker ve Actividad de su red/organización.
- Owner/Admin de organización ve Actividad de su organización.
- Seleccionar usuario abre Resumen / Actividad / Seguridad.

## 10. Pruebas obligatorias antes de merge

1. Ejecutar typecheck/build.
2. Ejecutar suite unit existente.
3. Ejecutar E2E existente.
4. Agregar pruebas específicas del Bloque 3.1:
   - scope multi-tenant;
   - heartbeat e idle gap;
   - login/logout;
   - login fallido;
   - descarga de documento;
   - filtros de actividad.
5. Aplicar migración en staging.
6. Probar con Super Admin, Master Broker y usuario de organización.
7. Confirmar que las nuevas escrituras no degradan tiempos de respuesta de operaciones críticas.
8. Confirmar que ninguna contraseña, token o dato bancario aparece en metadata.

## 11. Puntos para auditoría SOL 6.1

Revisar especialmente:

- exactitud del cálculo de `active_seconds`;
- comportamiento con múltiples pestañas/dispositivos;
- manejo de sesiones concurrentes;
- scope multi-tenant;
- volumen esperado de eventos;
- índices PostgreSQL;
- política de retención;
- IP/User-Agent y privacidad;
- lista blanca de eventos;
- robustez de auto-migración;
- conveniencia de separar analítica de uso a futuro si el volumen crece.

## 12. Fuera de alcance por ahora

- registrar cada clic;
- session replay;
- heatmaps;
- captura de contenido tecleado;
- analítica tipo product analytics de alta granularidad;
- tracking de mouse;
- guardar bodies completos de requests;
- almacenar passwords, tokens o datos bancarios en bitácora.
