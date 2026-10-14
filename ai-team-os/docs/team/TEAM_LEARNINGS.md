# TEAM LEARNINGS — Aprendizajes del Equipo
Se actualiza via sync desde cada proyecto al master.

## APRENDIZAJES DE COMUNICACION CON EL CEO
- El CEO decide mejor cuando la explicacion inicia en negocio y no en tecnologia.
- Traducir siempre decisiones a tiempo, dinero, riesgo y oportunidad reduce friccion.
- Reportes cortos, directos y con recomendacion final clara aceleran ejecucion.
- **Marketing Estratégico:** El cliente no compra "código", compra "certeza de negocio" y "ROI". Enfocar el copy en el activo, no en la herramienta.

## APRENDIZAJES DE PROCESO
- No empezar una sesion sin leer PROJECT_BRAIN, ERROR_LOG, DECISIONS y CEO_OS.
- Cada sesion debe cerrar con actualizacion de memoria para evitar perdida de contexto.
- Estandarizar roles reduce dependencia de improvisacion entre proyectos.
- Este sistema debe operar como activo vivo: cada proyecto aporta mejoras reutilizables.
- **Protocolo de Intake:** Realizar un "Strategy Intake" antes del discovery técnico asegura que el desarrollo esté alineado con la oferta de mercado (Godfather Offer).

## APRENDIZAJES TECNICOS
- Mantener convenciones consistentes de documentos facilita adopcion en nuevos repos.
- Definir claramente activacion y reglas de cada rol mejora coordinacion entre areas.
- En proyectos con IA, medir calidad y costo desde el inicio evita escalamiento ineficiente.
- **En desarrollo de Landings:** Considerar SIEMPRE desde el día 1 la mejor tecnología para maximizar rendimiento de ADS, SEO y SEM. (Ej: SSR/SSG en vez de SPAs pesadas).
- **Lógica condicional imperativa en JSX:** Todo bloque JSX que utilice `const`, `let`, `if/return` para renderizado dinámico debe estar obligatoriamente envuelto en un IIFE `{(() => { ... })()}`. esbuild y los minificadores de Vercel/Vite no admiten declaraciones sueltas dentro de árboles JSX y rompen el build con error de sintaxis críptico (`Unexpected "const"`).
- **Multi-Dispersión en Fintech:** Los flujos de crédito deben soportar que el requerimiento de un cliente se satisfaga en partes por múltiples instituciones (préstamos sindicados o paralelos). La entidad padre no debe cerrarse prematuramente mientras existan propuestas hermanas en evaluación o aceptación.
- **Sincronización Estricta Drizzle ORM vs PostgreSQL:** Todo campo nuevo declarado en un `pgTable` de `schema.ts` (ej. `referral_code`) DEBE tener de inmediato su sentencia `ADD COLUMN IF NOT EXISTS` en `autoMigrate.ts`. Drizzle siempre genera `SELECT` con todas las columnas del modelo; si una sola columna falta en la tabla física de Postgres, PostgreSQL cancela la consulta con `error: column does not exist`, retornando `undefined` silencioso en repositorios y bloqueando por completo el Login y Forgot-Password.
- **Capa de Resiliencia en Autenticación con SQL Nativo:** Las funciones críticas de lectura de usuario (`getUser`, `getUserByEmail`) deben tener siempre un bloque de respaldo en SQL directo (`pool.query('SELECT * FROM users WHERE LOWER(email) = ...')`). De esta forma, cualquier discrepancia futura de esquema en el ORM no dejará al CEO ni a los clientes fuera del sistema.
- **Builds en Railway / Nixpacks con `NODE_ENV=production`:** Cuando Railway inyecta `NODE_ENV=production`, `npm ci` omite las `devDependencies`. Toda herramienta requerida para el build (`vite`, `@vitejs/plugin-react`, `esbuild`, `typescript`, `tailwindcss`) debe estar en `dependencies` de `package.json` o forzarse vía `nixpacks.toml` con `NPM_CONFIG_PRODUCTION="false"` y `npm ci --include=dev`.
- **Dispersión en Redes de Intermediación (COM-03/06, PAG-08/13/14):** En arquitecturas comerciales jerárquicas (Master Broker → Broker de red), Crédito Negocios liquida de forma consolidada exclusivamente al Master (`masterBrokerShare + brokerShare`). La cuota del broker de red se asienta como obligación diferida (`networkObligation`) con estatus `pending_master_payout`, sin dispersión directa desde tesorería central ni marcaje de pagado por CN.
- **Aislamiento Estricto de Simuladores Financieros (PAG-12/13):** Un servicio de simulación técnica (como `processStpPayment`) nunca debe transicionar entidades a estados definitivos de pago (`paid`). Las pruebas de pasarela deben requerir explícitamente `simulate: true`, dejar constancia en auditoría y preservar el estado `approved`.
- **Validación Documental Focalizada al Receptor Real:** El gate de cumplimiento de expediente bancario (INE, CSF, CLABE) debe validar estrictamente al beneficiario bancario que recibirá la transferencia de CN. No exigir documentos del Broker subordinado para liquidar al Master.

## ERRORES FRECUENTES — NO REPETIR
- Empezar proyectos desde cero sin reutilizar aprendizajes previos.
- Crear roles sin criterios de activacion y sin reglas operativas.
- Presentar metricas sin contexto de negocio ni accion recomendada.
- **Dejar QA y Seguridad como roles pasivos** — deben activarse automáticamente, no esperar a ser llamados.
- **No definir handoffs entre roles** — cada rol debe saber a quién entrega y de quién recibe.
- **No tener sistema de logs estructurado** — sin trazabilidad, los errores se pierden y se repiten.
- **No tener rol de monitoreo continuo** — los bugs en producción se descubren cuando el cliente se queja.
- **Declaraciones `const` sin encapsular en JSX:** Olvidar la apertura `{(() => {` al hacer refactor de badges o condicionales dentro de un componente React.
- **Asumir que un crédito siempre tiene un solo desembolso:** Limitar la lógica a un único ganador rompe la experiencia comercial cuando el cliente requiere montos mayores y los fondea con varias financieras.
- **Agregar columnas a `schema.ts` sin sincronizar `autoMigrate.ts`:** Provoca que Drizzle falle en todas las queries que lean esa tabla al no encontrar la columna en la BD viva de PostgreSQL.
- **Sobrescribir roles RBAC masivamente en scripts de migración:** Modificar roles a ciegas en un bucle (`SET role = 'super_admin'`) destruye la matriz de pruebas de la plataforma. Cada cuenta debe mantener su rol explícito (`super_admin`, `master_broker`, `broker`).
- **Depender al 100% de la entrega de correo sin fallback en UI:** Si el proveedor de correo (Resend) sufre latencia o restricciones de DNS, el usuario queda incomunicado. Exponer el enlace de reseteo directo en el log y en la interfaz para cuentas de prueba garantiza continuidad operativa.
- **Dispersar transferencias duales directas a subordinados de redes privadas:** Pagar directamente al Broker de red desde la empresa matriz vulnera la autonomía y responsabilidad contractual del Master Broker.
- **Marcar transacciones financieras como pagadas con simuladores o mocks:** Confiar en que un simulador represente una dispersión bancaria real en libros contables genera discrepancias graves entre el saldo bancario y la plataforma.
- **Declarar PostgreSQL o migraciones como validadas sin ejecución en entorno aislado:** En suites ejecutadas bajo MemStorage o mocks en memoria, nunca dar por concluidas validaciones transaccionales ACID o de migración DDL sin ejecución en una base PostgreSQL aislada.

## PATRONES QUE FUNCIONAN MUY BIEN
- Framework comun de roles + protocolos + memoria de proyecto.
- Actualizar DECISIONS y CHANGELOG cuando cambia la forma de trabajo.
- Cerrar cada sesion con pendientes claros para la siguiente ejecucion.
- **Pipeline de entrega con gates obligatorios** — Dev → QA ✅ → Security 🔒 → Deploy → Monitor.
- **Activación automática de roles de protección** — QA y Seguridad no esperan, actúan por defecto.
- **Handoffs explícitos con formato** — reduce ambigüedad y pérdida de contexto entre roles.
- **ERROR_LOG estructurado** — con IDs, severidad, área, estado y causa raíz para trazabilidad.
- **Vistas segmentadas 3-en-1 para administración:** Dividir redes complejas en tabs claras (Master Brokers con acordeón, Independientes, Red Directa) para evitar tablas sobrecargadas y mantener control granular.
- **Fallback SQL nativo en autenticación:** Asegurar que `getUser` y `getUserByEmail` consulten la base de datos con SQL crudo si el ORM falla, blindando el acceso al sistema.
- **Aislamiento de pasos en auto-migración:** Envolver cada sentencia `ALTER TABLE` o actualización de usuario en bloques independientes `try/catch` para que una advertencia secundaria nunca aborte el proceso general.
- **Registro de Obligación Diferida de Red (`networkObligation`):** Desglosar y persistir formalmente la cuota correspondiente al Broker de red dentro de la metadata del pago al Master, permitiendo trazabilidad cuando el Master liquide a su agente.
- **Liquidación Manual Auditada por Super Admin (`/mark-paid`):** Canalizar pagos reales mediante formulario administrativo que exija referencia bancaria verificable (SPEI/folio), importe auditado no discrepante y notas justificativas en bitácora inmutable.
## Lección prelaunch 2026-10-13 — Integración verificable sin aumentar complejidad
- Recuperar **comportamientos**, no fusionar ramas completas ni reintroducir diálogos/endpoints cuando las reglas económicas ya cambiaron.
- Separar conexiones SQL y almacenamiento de objetos por ambiente; la misma clave `service_role` compartida impide aislamiento efectivo aunque haya bases distintas.
- Invitar con correo de usuario + token de uso único, no contraseñas; incorporar aceptación legal atómica también en invitación, no sólo autorregistro.
- Datos totalmente ficticios: Producción nueva limpia y Staging de prueba preservado puede ser más seguro que borrar datos; validar costo y rollback antes de aprovisionar.
- Antes del GO probar consentimiento de cliente, permisos, comisiones, documentos y correos reales en Staging; CI verde no reemplaza E2E.

## Lección adicional prelaunch 2026-10-13 — Seguridad de recursos y privilegios
- Un endpoint autenticado que recibe ID de recurso no está autorizado automáticamente: las mutaciones de notificaciones deben incluir el dueño en la condición de UPDATE, no sólo comprobar que el ID exista.
- No usar correo conocido, cuenta de pruebas ni rol Admin como sustitutos de `super_admin` para avisos financieros privilegiados.
- Revisar TODAS las rutas legacy PUT/PATCH y los cambios de estado: los nombres `isSuperAdmin` que incluyen `admin` son una fuente real de escalamiento. Reglas RBAC deben probarse desde API con usuarios de distintos roles, nunca sólo con visibilidad de pantalla.
- Separar commit/push y QA: un cambio P0 corregido en GitHub queda **sin certificación** hasta CI del SHA nuevo y prueba E2E cuando aplique.

## Lección prelaunch 2026-10-14 — Una bitácora inicial no equivale a seguimiento de sesiones
- Certificar cada evento crítico desde la misma transacción de negocio y probar permisos de consulta/propiedad. No confundir existencia de `commercial_audit_logs` con cobertura de login, documentos, créditos y comisiones ni con una pantalla unificada.
- En pruebas unitarias `MemStorage` y `MockCommercialOpportunityStorage` pueden ser implementaciones separadas; comprobar eventos en almacenamiento real del caso, sin afirmar que el endpoint PostgreSQL fue validado por un mock.
- La restricción de escalamiento debe cubrir creación, además de edición: Admin/Master no deben suministrar permisos globales al crear usuarios.

## Lección 2026-10-14 — Aceptación económica por oferta y rol
- No sustituir evidencia por oferta/version por aceptación comercial global o por institución; el hash debe referirse a la versión efectivamente publicada.
- El documento económico se persiste en la transacción de publicación: si falla, la versión no puede considerarse vigente.
- Nunca exponer la comisión mayorista Master a Brokers de red; el Master acepta su participación de oferta y su Broker su propio instrumento de red.
- La aceptación no debe invalidar snapshots históricos ni depender de una notificación enviada; las rutas que generan nuevos créditos, no sólo selección de ganador, tienen que comprobarla.
- Los casos de prueba añadidos requieren ejecución real PostgreSQL y E2E antes de tomar decisiones de deploy.

## Lección prelaunch 2026-10-14 — Compatibilidad legacy sólo por evidencia del tiempo
- Cuando se añade obligatoriedad de identidad oferta/version, no basta una excepción `if (!offerId) return`: eso permite a las operaciones nuevas eludir aceptaciones económicas.
- Para propuestas previas al primer catálogo de la financiera, preservar su historia sin recálculo; para una nueva operación, comprobar publicación vigente y fecha histórica **desde el servidor**, bajo lock de producto y dentro de la transacción PG.
- Nunca confundir existencia de tests nuevos, fixtures PostgreSQL mínimos o checks Vercel con CI y E2E ejecutados en el SHA final.
