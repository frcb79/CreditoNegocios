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
- **Inmutabilidad en PostgreSQL con Triggers BEFORE UPDATE:** Para entidades donde la atribución económica histórica jamás debe modificarse ante cambios organizativos futuros (ej. `origin_master_broker_id`), la forma más robusta es un trigger `BEFORE UPDATE OF <columna>` que verifique `IF NEW.col IS DISTINCT FROM OLD.col THEN RAISE EXCEPTION`. Esto blinda la base de datos contra cualquier intento de bypass por código de backend, scripts ad-hoc o interfaces administrativas.
- **Desempate Determinista en Colecciones Ordenadas por Timestamp:** En entornos de prueba o ejecución intensiva donde múltiples mutaciones ocurren en el mismo milisegundo (`Date.now()`), `sort((a,b) => b.createdAt - a.createdAt)` no es determinista si `diff === 0`. Utilizar un tie-breaker secundario basado en el orden natural de inserción o ID garantiza estabilidad al 100%.
- **Preservación de Tenants en Transiciones Organizacionales:** Al promover a un Broker a Master Broker o moverlo entre redes, NO se debe recrear el tenant ni cambiar su ID. Se debe preservar el mismo `tenantId` (y rol `owner`), modificando únicamente `parent_tenant_id` y `type`. Esto preserva intacta la identidad, historial de documentos, clientes y créditos asociados.

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
- **Delimitadores `DO $` de un solo dólar en scripts PL/pgSQL:** En PostgreSQL, un bloque anónimo requiere delimitadores válidos (`$$` o `$body$`). Un delimitador con un solo `$` aborta la migración con error de sintaxis.
- **Ordenar por `getTime() - getTime()` sin desempate en memoria:** En pruebas automatizadas concurrentes, dos inserciones en el mismo milisegundo provocan orden no determinista si no se incluye `(logs.indexOf(b) - logs.indexOf(a))`.

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
- **Congelamiento de filiación en 4 etapas (Lineage):** Oportunidad (`master_broker_id`) -> Solicitud (`origin_master_broker_id`) -> Crédito (`origin_master_broker_id`) -> Comisión. Las 4 retienen la filiación de origen sin mutar si el broker cambia de Master posteriormente.
- **Gobernanza desacoplada de reactivación:** El Master Broker puede suspender de inmediato por seguridad operativa, pero la reactivación está estrictamente reservada a Super Admin vía solicitud formal auditada (`user_status_requests`).