# Prelaunch — Ayuda, Reglas, Beneficios e Invitaciones con Cortesía (2026-10-19)

**Aprobación del usuario:** reorganizar menú y asegurar que TODA nueva invitación de Broker/Master incluya cupón de 12 meses sin costo, con opción de código individual o uno compartido por lote. No enviar invitaciones reales ni despliegues fuera de Staging.

## Matriz final por rol

- Todos: `Ayuda` (manuales y FAQs) en menú inferior, sin reglas mezcladas.
- Broker/Master: `Configuración` → Mi cuenta, Mi negocio (2 formularios existentes), Documentos y convenios (OTP/evidencias), Beneficios y acceso, Seguridad, Notificaciones, **Reglas de operación**.
- Admin: `Configuración` → Mi cuenta, Seguridad, Notificaciones, **Reglas de operación**. `Administración` → Usuarios y **Beneficios y promociones**.
- Super Admin: igual a Admin + **Reglas comerciales** como tab visible en Configuración, Auditoría y consulta administrativa de convenios por usuario. Beneficios y promociones tiene acceso directo administrativo reutilizando catálogo y canjes existentes.
- Deep links históricos: `/reglas-operacion` redirige a `/configuracion?tab=operational_rules`; `/ayuda?tab=reglas` redirige allí; `/admin/usuarios?tab=promos` funciona.
- No migraciones, no eliminación de campos ni modificaciones de convenios.

## Cortesía anual de lanzamiento

**Preparación, no envío:** Super Admin crea en Administración → Beneficios y promociones un cupón:
- Código sugerido `LANZAMIENTO12`, nombre `Cortesía de lanzamiento — 12 meses sin costo` y descripción clara.
- Tipo `free_months`; duración `12` meses; valor `0`, activo, vigente; alcance Global (Broker y Master); limitar usos solo si cubre holgadamente todos los invitados (44 iniciales) y contingencias.
- Este cupón aún **no se ha creado** en Staging ni Producción. No asumir existencia. No publicar invitaciones hasta haberlo preparado y probado.
- Individual: en invitación se puede capturar `promoCode` por persona.
- Masivo: campo `Cupón anual para todo el lote`; columna XLSX opcional `codigo_promocional` por fila (sobrescribe general). Excel anterior sigue compatible.
- Alternativa administrada en Railway: `INVITATION_WELCOME_PROMO_CODE` (solo después de crear cupón correspondiente en base de datos del entorno). Si falta tanto el código manual como predeterminado, la invitación **no sale** (HTTP 422), evitando lanzar accesos sin cortesía.
- Previsualización Excel valida rol, cupón y afiliación **sin enviar correos**; envío masivo requiere acción de confirmación separada.
- Correo incluye código, cortesía 12 meses, comienza en activación, link personal 24h y aclara **sin cobro automático**.
- Código se guarda en `users.profile_data.invitationPromoCode` (sin esquema nuevo). En **primera activación**, PostgreSQL registra aceptaciones legales + password + canje promo + estado `promotional` en una sola transacción. Inicio es activación, fin 12 meses calendario. Reintentos con token consumido no duplican canje.
- `/api/promos/my-benefits` expone código, beneficio, fecha de expiración y estado efectivo de caducidad. Promoción vencida **no suspende originación, matching, créditos ni comisiones**; pago futuro necesita política comercial distinta y aviso.
- Los códigos quedan trazados con `promo_redemptions`; Admin puede ver por cupón quién lo usó, fechas y vencimiento. No confundir código de cortesía con `referralCode` del Master.
- Revisar qué cuentas ya invitadas antes del despliegue requieren tratamiento manual; el cambio es para NUEVAS invitaciones y reenvíos aún no activados, sin retroactividad silenciosa.

## QA antes de GO
- CI TypeScript, build y suites unit/PostgreSQL verdes en **el mismo SHA**. No aceptar pases previos de otros SHAs.
- Prueba en Staging: crear **un** cupón ficticio anual, invitar por correo exclusivamente de prueba tras autorización específica, activar cuenta, verificar 2 aceptaciones, 1 canje, fecha de vencimiento y Perfil → Beneficios (Broker/Master); comprobar reenvío, expirado, no canje duplicado, sin alteración OTP convenios.
- Probar `Ayuda`, ambos tabs de reglas, publicación solo si explícitamente autorizada (publicar versión real dispara condiciones), Admin promociones y canjes y Super Admin reglas comerciales con permisos.
- No enviar 44 correos reales ni crear cupones en Producción; producción y `main` fuera de alcance hasta GO explícito.
