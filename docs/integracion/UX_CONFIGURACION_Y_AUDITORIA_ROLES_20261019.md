# Crédito Negocios — Configuración por rol y Auditoría Administrativa (19-oct-2026)

**Decisión de dirección:** adoptar opción B (unificación inteligente) sin suprimir campos,
registros, reglas comerciales, accesos documentales ni funcionalidades previamente aprobadas.
**Ámbito:** sólo frontend y pruebas; rama única de integración, PR #10 Draft.
**Despliegue:** no desplegar a Staging ni main/Producción sin autorización separada.

## Matriz de navegación por rol

| Ubicación | Broker | Master Broker | Admin plataforma | Super Admin |
|---|---:|---:|---:|---:|
| Configuración → Mi cuenta | Sí | Sí | Sí | Sí |
| Configuración → Mi negocio | Sí | Sí | No | No |
| Configuración → Documentos y convenios | Sí | Sí | No | No |
| Configuración → Beneficios y acceso | Sí | Sí | No | No |
| Configuración → Seguridad | Sí | Sí | Sí | Sí |
| Configuración → Notificaciones | Sí | Sí | Sí | Sí |
| Administración → Reglas comerciales | No | No | No | Sí |
| Menú lateral → Documentos (expedientes de clientes) | RBAC existente | RBAC existente | RBAC existente | RBAC existente |
| Configuración → Seguridad → Historial legal (acceso bajo demanda) | En Documentos | En Documentos | Sí | Sí |

**No confundir:** el repositorio de expedientes de clientes del menú lateral con los
documentos legales, comprobantes OTP y expediente para pago de comisiones del Broker/Master.
**Seguridad:** la navegación visual no sustituye las comprobaciones de autorización del servidor.

## Inventario íntegro de datos y formularios

**Mi cuenta (todos los roles):** foto, nombre, apellidos, correo, teléfono;
calle, número exterior, número interior, colonia, ciudad, estado y código postal.
Se conserva el formulario `profileForm` y su guardado.

**Mi negocio (Broker/Master):** una pestaña con DOS tarjetas/formularios
diferenciados, guardados de manera independiente:
- **Información comercial y fiscal**, `businessForm`: razón social/nombre,
  representante legal y cargo, RFC, teléfono, dirección, web, especialización.
- **Perfilamiento y dispersión**, `profilingForm`: régimen/tipo de perfil (PM,
  PFAE, física, sin SAT), años de experiencia, tamaño de cartera, objetivo de colocación,
  productos, ticket promedio, referencias comerciales dinámicas, banco,
  CLABE y titular de cuenta. Mantener sus validaciones originales.
- Backend `PUT /api/users/:id` y `DbStorage.updateUser` continúan haciendo merge de
  `profileData`; no cambiar estructura ni migrar registros por el simple reordenamiento.

**Documentos y convenios (Broker/Master):** formalización contractual por OTP,
Versiones/aceptaciones históricas, comprobantes personalizados, expediente personal
INE/CSF/estado de cuenta y validación documental para cobro de comisiones.
Sólo una instancia visible de `LegalProfileDocuments` en la pestaña correspondiente.
Los Admin/Super Admin conservan **consulta bajo demanda** de sus aceptaciones
legales existentes desde Seguridad (sin expediente Broker).

**Beneficios y acceso (Broker/Master):** acceso gratuito/promocional, códigos,
vigencias y beneficios, sin alteración de `/api/promos/*`.

**Seguridad (todos):** cambio de contraseña y solicitud de baja de cuenta
sin alterar los endpoints; consulta opcional de evidencia legal para Admin/Super Admin.

**Notificaciones (todos):** correo, WhatsApp, push, créditos por vencer,
comisiones/pagos, documentos e informativos/alianzas; última pestaña visible.

**Reglas comerciales (Super Admin):** se conserva íntegro
`CommercialRulesSettings`; acceso desde menú Administración y enlace
`/configuracion?tab=commercial_rules`. El acceso directo histórico funciona.

Compatibilidad de enlaces antiguos: `?tab=profiling` lleva a Mi negocio,
`?tab=documentos` a Documentos y convenios; no eliminar enlaces profundos.

## Auditoría Administrativa: mejora de legibilidad

**Fuentes sin cambio:** `/api/commercial/audit-logs`,
`/api/admin/commercial-config/audit`, `/api/admin/status-requests`,
y consulta administrativa existente de `/api/users` para nombres.

- Mostrar acciones traducidas a español, responsable identificado por nombre,
  rol, persona afectada cuando existe atribución, motivo, cambios antes/después,
  fecha y estado de la solicitud.
- `create_status_request` identifica, cuando se puede resolver, al
  Master Broker solicitante y al Broker afectado mediante los registros de
  `user_status_requests` y `users` existentes.
- No imprimir `performedBy`, `entityId` ni UUID en tarjetas; permanecen en el
  sistema como identificadores de trazabilidad, no se borran.
- Filtros: búsqueda de texto (persona/correo/acción/motivo), fechas desde/hasta,
  rol responsable, resultado; pestañas conservadas por categoría.
- Límite explícito: gobernanza y reglas consultan los 100 eventos más recientes
  por fuente y filtros de UI se aplican a lo cargado, NO a toda la historia;
  datos de sesiones/heartbeat e historial universal siguen diferidos.
- Solo lectura, enlaces de gestión de solicitudes y reglas comerciales preservados.

## Regresiones y control de cambios

- Test `tests/unit/settings-audit-role-ux.test.ts` integrado en
  `.github/workflows/prelaunch-validation.yml` (shards).
- TypeScript/build y suite CI deben estar en SUCCESS **para el SHA final**.
- Realizar QA visual de los cuatro roles en Staging después de autorización
  separada; verificar formularios y datos previos, vínculo a reglas,
  comprobantes y filtros antes de aprobar GO.
- Sin migraciones, modificaciones directas de bases de datos,
  publicaciones legales ni despliegues de Producción por este ajuste.

## Fuentes históricas preservadas

- `docs/integracion/PLAN_MAESTRO_INTEGRACION.md`, §§4.7–4.8.
- `docs/integracion/REGISTRO_MAESTRO_DECISIONES.md`, AUD-01 a AUD-08.
- `docs/BLOQUE_3_1_ACTIVIDAD_BITACORA_USUARIOS.md` de la rama
  histórica `feat/bloque-3-1-user-activity`: **documentación del futuro,
  no autorización de integrar migraciones de sesión**.
