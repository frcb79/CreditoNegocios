# Crédito Negocios — Checklist de corte a Producción (MVP)

**Corte verificado: 19 de octubre de 2026. Estado: NO-GO Producción.** Este documento es un plan de verificación; **NO autoriza** modificación de bases de datos, secretos, permisos, envíos, merge, despliegue ni limpieza. Los datos actuales son de prueba, pero deben respaldarse y revisarse antes de eliminarlos.

## 0. Evidencia comprobada y decisiones

- **Única rama:** `integration/phase-1a1-base-segura`. PR [#10](https://github.com/frcb79/CreditoNegocios/pull/10) sigue **Draft**, dirigido a `main`, que permanecía en `0c6b7bd18f6465c55d95f72a4f20ade339f1a553`.
- **Versión aún desplegada en Staging:** `b8864a5f2082c38dcc4b98fdffbacd8bc679f857`. GitHub Actions [39335292150](https://github.com/frcb79/CreditoNegocios/actions/runs/39335292150): **SUCCESS 8/8**. Railway deployment `cae9a1ca-d871-46a0-86eb-f1900009b7b5`: **SUCCESS**, healthcheck `/api/health` HTTP 200, online. **Nuevo candidato con dependencias corregidas `2838c6e` aún no desplegado**, requiere CI verde completo y aprobación específica de Staging.
- **Beneficios/cupones:** gestión manual Super Admin (asignar/extender/sustituir/revocar) + historial auditado y controles de destinatario corregidos. Dirección reportó pruebas funcionales satisfactorias; pruebas automatizadas PostgreSQL aprobadas. **Sin cobros** en el MVP.
- **Entornos:** Staging usa PostgreSQL de Railway; Producción apunta a PostgreSQL de Supabase según el diseño actual. Credenciales y `DATABASE_URL` efectivos siguen enmascarados por la conexión OAuth de Railway: confirmar origen **en runtime**, sin mostrar valores ni asumir que el nombre de variable acredita aislamiento.
- **Storage Supabase:** proyectos diferentes, Staging `hmzpaoapwjkxpfkndbik` (bucket privado `staging-documents`) y Producción `lyoatuvvasnvneikvgvt` (bucket privado `documents`). Staging contiene 1 objeto y Producción 13 objetos al inventario. El código impide I/O en Staging si no valida proyecto, bucket y secreto de servicio, pero falta comprobación autenticada con credenciales **efectivas**; no usar documentos reales hasta entonces.
- **Railway Producción:** último deployment observado `8d6b6194-482f-447d-8427-deca2f1a60c0`, **sin cambios** durante este cierre. Confirmar que auto-deploy no se disparará al fusionar el PR.
- **Modelo MVP:** Broker/Master captura prospecto, CN hace matching y contacto interno, la financiera solicita directamente sus documentos. **LEG-10 diferido:** no exigir firma/OTP del prospecto para perfil y matching; el envío externo de documentos sigue protegido y no debe habilitarse mediante `CLIENT_CONSENT_RELEASE_APPROVED`.
- **Seguridad de dependencias:** auditoría inicial `npm audit --omit=dev`: 0 critical / 23 high / 11 moderate. En rama de integración ya se fijaron **SheetJS oficial `xlsx@0.20.3`** (tarball CDN con integridad en lockfile) y **`multer@2.4.0`**, más un refresh de dependencias transitivas compatible con semver, **sin `--force` ni cambios de contratos del `package.json`**. La prueba aislada confirmó **0 critical / 7 high / 5 moderate**, TypeScript, build y roundtrip Excel correctos. **Nuevo candidato `2838c6e245d789d1af8e788d60bdb2362cd5383e`: CI integral en ejecución y nuevo Staging todavía sin desplegar.** Incluye **Drizzle ORM `0.45.4`**, versión corregida de GHSA-gpj5-g38j-94v9; su prueba aislada de TypeScript, build y suites focales fue exitosa. Nueva auditoría: **0 critical / 6 high / 5 moderate**. Los seis HIGH restantes (`braces`, `chokidar`, `fast-glob`, `micromatch`, `tailwindcss`, `vite`) son predominantemente de la cadena de build y requieren análisis de alcance y aceptación explícita antes de GO.
- **Supabase Producción:** 37 tablas `public` con RLS habilitado y sin políticas (por defecto niega acceso a clientes no privilegiados, no equivale a exposición). Tres avisos `function_search_path_mutable` corresponden a funciones `SECURITY INVOKER` sin permisos EXECUTE para `anon/authenticated`; ajustar search_path con control de cambios, sin declararlo incidente externo. **Pendiente P1:** `supabase_admin` tiene ACL por defecto amplias para tablas/secuencias/funciones futuras; restringirlas antes de crear nuevas tablas expuestas al Data API.
- **Railway Postgres Staging:** dos alertas históricas de plataforma todavía visibles; sin nuevos errores de arranque el 19-oct y sin fallas 5xx en la ventana comprobada.

## 1. Puertas de seguridad antes de declarar GO

| Gate | Evidencia requerida | Estado |
| --- | --- | --- |
| SHA y CI completos | 8/8 sobre candidato exacto | **PASS — b8864a5f**; **pendiente** CI para el nuevo candidato `2838c6e` |
| Despliegue técnico Staging | Commit, health, logs, sin 5xx | **PASS — b8864a5f** |
| Prueba visual cupones | Super Admin, Broker y Master de prueba; fechas e historial | **Reportada OK por Dirección** |
| Dependencias expuestas | SheetJS y Multer corregidos; triage de siete high residuales, incluido Express/WS y dependencias de build | **PARCIAL: mejora 23→6 high y 11→5 moderate; falta CI integral del SHA final y análisis de alcance build/runtime** |
| DB real Staging ≠ Producción | Verificación runtime sin revelar conexiones | **PENDIENTE** |
| Storage real Staging ≠ Producción | Prueba autenticada con archivo sintético, endpoint/bucket/clave segregados; denegación cruzada | **PENDIENTE** |
| E2E MVP comercial/roles | Super Admin/Admin/Master/Broker, clientes, matching, ofertas, contactos, comisiones, auditar permisos ajenos | **PARCIAL: regresiones verdes; falta evidencia completa** |
| Secretos y correo OTP | Destinatarios, remitente, URLs, origen de secretos, límites; nunca mostrarlos | **PENDIENTE** |
| Supabase permisos por defecto | Política explícita para ACL futuros; no abrir Data API inadvertidamente | **PENDIENTE** |
| Backups/limpieza/rollback | Respaldo restaurado en copia + inventario autorizado | **PENDIENTE** |
| Auditoría independiente ASTRA | Hallazgos clasificados y evidencia por SHA | **PENDIENTE** |

**Regla:** un resultado PASS de CI demuestra código y pruebas aisladas, no reemplaza prueba runtime ni análisis de vulnerabilidades. Ningún gate pendiente queda implícitamente aprobado por este documento.

## 2. Inventario previo a limpieza: Producción (solo lectura, 19-oct)

| Recurso | Registros/objetos observados | Tratamiento propuesto (requiere validación) |
| --- | ---: | --- |
| users | 1 | Conservar/certificar Super Admin legítimo; no borrar sin verificar bootstrap |
| tenants | 4 | Clasificar y eliminar solo tenants de prueba por relaciones y autorizaciones |
| sessions | 2 | Invalidación controlada al corte, tras respaldo y aviso de cierre de sesiones |
| clients / credits / commissions / documents | 0 / 0 / 0 / 0 | No hay registros en estas tablas al corte; no inventar limpieza |
| promo_codes / promo_redemptions | 0 / 0 | Preparar catálogo real posterior a aprobación |
| product_templates / product_variables | 12 / 3 | Clasificar prueba vs catálogo final; conservar sólo lo aprobado |
| legal_document_versions / legal_acceptances | 5 / 0 | **Preservar** documentos versionados y evidencias; no truncar |
| commercial_configurations | 1 | Validar configuración vigente y mantener trazabilidad |
| Storage `documents` | 13 objetos | Inventariar rutas, validar referencias, respaldar contenido antes de retirar cualquiera |

Estos recuentos son una fotografía, no autorización para depurar. Otras tablas/auditorías/llaves foráneas y datos de bootstrap deben inspeccionarse antes de la secuencia definitiva.

## 3. Procedimiento de preparación, aún NO ejecutado

1. **Respaldar** base PostgreSQL de Producción (`pg_dump` en formato restaurable y metadatos del esquema), objetos del bucket privado, configuración y catálogos. No exportar contraseñas a archivos compartidos; comprobar permisos y ubicación cifrada del respaldo.
2. **Ensayar restauración en copia aislada** con conteos y checksums de muestra; registrar hora, operador, consistencia y rollback ensayado. No usar la BD Staging actualmente utilizada para sustituir una copia.
3. **Inventariar dependencias FK y triggers** para ordenar cualquier eliminación selectiva; proteger documentos legales, aceptaciones históricas y auditoría. Nunca ejecutar `TRUNCATE ... CASCADE` general o `db:push` indiscriminado sobre Producción.
4. **Aprobar un plan de limpieza por tabla y objeto**, incluyendo cuentas, 4 tenants, 2 sesiones y 13 objetos Storage solo tras confirmar su naturaleza sintética y el respaldo. Ejecutarlo únicamente después de una autorización independiente de limpieza.
5. **Controlar configuración efectiva** de ambas apps sin revelar `DATABASE_URL`, token de servicio, secretos OTP, sesiones ni llaves. Probar una carga/descarga/borrado reversible de **documento sintético** en Staging, jamás en bucket de Producción.
6. **Confirmar auto-deploy y rollback de Railway**, incluyendo el SHA actual, rollback a deployment previo, migraciones compatibles y plan de congelación de cambios.
7. **Resolver alta y aceptación comercial** usando identidad sintética por cada rol; comprobar matching compatible/no compatible/info insuficiente, selección de producto, versión, propuesta, comisión y bitácora, sin transmisión externa de información del prospecto.
8. **ASTRA independiente** sobre SHA final, corregir P0/P1 que impidan lanzamiento, obtener CI y health verdes en el nuevo SHA.

## 4. Tres autorizaciones separadas para el corte

**A. Merge PR #10 a `main`**: solo tras GO técnico, permiso expreso y confirmación de que no dispara auto-deploy no deseado.

**B. Limpieza de Producción**: permiso expreso para procedimiento y alcance preciso después del respaldo restaurable. No se infiere del permiso de merge.

**C. Deploy a Producción**: permiso expreso para el SHA, entorno y momento de corte, independientemente de merge y limpieza. Activar invitaciones reales **después** de validar producción limpia y el flujo de alta.

## 5. Reversión y validación poscorte

- Si falla arranque, permisos, matching, historial económico, OTP, Storage o auditoría: detener incorporación de usuarios, conservar evidencia, hacer rollback del **código** a deployment conocido y revisar compatibilidad de migraciones antes de volver atrás datos.
- No borrar tablas ni evidencias para intentar reparar una versión. Los archivos de Producción no se mezclan con Staging.
- Confirmar endpoints `/api/health`, acceso correcto por roles, ausencia de datos sintéticos en el dominio público, catálogos finales, bitácoras y políticas de documentos.
- Ejecutar envíos a los 44 invitados (4 Master/40 Broker) solo cuando cupones de bienvenida, URLs, vigencia y transporte de correo hayan sido validados y autorizados.

**Estado final al 19-oct-2026: NO-GO Producción.** Está autorizado únicamente el trabajo técnico en rama de integración y Staging previamente acordado. El checklist por sí mismo no confiere más permisos.
