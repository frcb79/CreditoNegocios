# DECISIONS — Registro de Decisiones
Documenta el POR QUE de cada decision importante.
Consultar antes de cambiar algo que ya se decidio.

## DECISIONES ACTIVAS

Formato: Fecha / Decision / Opciones evaluadas / Decision final / Por que

### 2026-04-17 / El sistema se trata como activo estrategico reutilizable
- Opciones evaluadas:
	- Opcion A: usar este repo solo como plantilla estatica para copiar y pegar.
	- Opcion B: tratar este repo como sistema operativo vivo que acumula aprendizajes de cada proyecto.
- Decision final: Opcion B.
- Por que:
	- Reduce tiempo de arranque en proyectos nuevos.
	- Disminuye riesgo de repetir errores ya resueltos.
	- Estandariza calidad de ejecucion del equipo IA en distintos clientes.
	- Convierte experiencia operativa en ventaja competitiva acumulable.

### 2026-04-17 / Expansion de roles para ciclo completo de ejecucion
- Opciones evaluadas:
	- Opcion A: mantener solo roles actuales y cubrir vacios de forma ad hoc.
	- Opcion B: completar estructura con roles clave de entrega, ventas, IA, finanzas, operaciones, comunidad y contratacion.
- Decision final: Opcion B.
- Por que:
	- Cubre vacios operativos criticos para construir y entregar proyectos profesionales.
	- Mejora coordinacion entre estrategia, ejecucion y resultados de negocio.
	- Aumenta capacidad de respuesta a distintos tipos de proyecto y etapa.

### 2026-09-01 / Modernización de Interfaz y Tipografía (Estilo Tecnológico / Mis Créditos)
- Opciones evaluadas:
	- Opcion A: Mantener estilos visuales clásicos heterogéneos.
	- Opcion B: Estandarizar diseño tecnológico, limpio y moderno (como el de Mis Créditos / Cards con badge status unificados, bordes redondeados modernos, paleta HSL balanceada e iconos refinados) en todo el sistema.
- Decision final: Opcion B.
- Por que:
	- Mayor claridad visual en tarjetas y estados de crédito.
	- Experiencia de usuario (UX) más intuitiva, limpia y con aspecto SaaS financiero moderno.
	- Preparado para migrar progresivamente todas las vistas a esta misma estética.

### 2026-09-04 / Soporte para Multi-Dispersión y Comisiones Independientes por Solicitud
- Opciones evaluadas:
	- Opcion A: Mantener el modelo estricto de una única propuesta ganadora por crédito (si el cliente acepta otra financiera, la anterior se cancela).
	- Opcion B: Permitir que una misma solicitud de crédito apruebe y disperse múltiples ofertas de diferentes financieras (ej. 3 MDP de Financiera A + 2 MDP de Financiera B para cubrir 5 MDP), generando registros de crédito separados y comisiones independientes para cada una.
- Decision final: Opcion B.
- Por que:
	- Modela la realidad operativa de créditos empresariales de mayor escala en México donde un solo intermediario no cubre el monto total requerido.
	- Evita que los brókers o el super admin tengan que duplicar expedientes manualmente para cobrar comisiones de diferentes financieras.
	- Garantiza que cada desembolso mantenga su botón de pago STP y tracking de dispersión sin bloquear a las demás propuestas en proceso.

### 2026-10-08 / Hotfix de Seguridad Producción: Eliminación de Bypass de Login y Arranque No Destructivo
- Opciones evaluadas:
	- Opcion A: Desplegar la rama completa con los 85 commits funcionales pendientes (Network Transitions, Formalización, Comisiones) para resolver la vulnerabilidad.
	- Opcion B: Crear un hotfix quirúrgico mínimo sobre la base exacta desplegada en producción (`ce24a16`), portando exclusivamente la eliminación de contraseñas alternativas (`allowedAdminPasswords`) y el saneamiento de `autoMigrate.ts` (cero mutaciones destructivas, cero reseteo de contraseñas en arranque), sin incorporar los 85 commits funcionales pendientes.
- Decision final: Opcion B.
- Por que:
	- Minimiza a cero el riesgo de regresiones operativas en producción al no alterar modelos comerciales, linajes ni esquemas nuevos que no han sido validados en Staging.
	- Cierra de forma inmediata y aislada la brecha crítica de seguridad (P0).
	- Preserva la estabilidad y compatibilidad 100% con la base de datos productiva actual.

### 2026-10-08 / Endurecimiento de Bootstrap, Diferimiento de authMethod y Cero UPDATEs Residuales
- Opciones evaluadas:
	- Opcion A: Permitir contraseña por defecto `Prueba1$` en base vacía, migrar `authMethod` antes de verificar credenciales, y ejecutar UPDATEs de inicialización en cada arranque.
	- Opcion B: Exigir `ADMIN_INITIAL_PASSWORD` explícita y criptográficamente segura (mínimo 12 caracteres, mayúscula, minúscula, número) para bases vacías sin ningún fallback por defecto; generar secreto criptográfico aleatorio para `user-super-admin`; posponer la mutación de `authMethod` en login hasta validar exitosamente las credenciales con bcrypt; eliminar todo `UPDATE` residual en arranque sobre usuarios o `can_originate` de `tenant_members`.
- Decision final: Opcion B.
- Por que:
	- Garantiza que un atacante no pueda provocar cambios de estado en base de datos mediante intentos de login fallidos.
	- Impide que cualquier entorno nuevo o recreado arranque con contraseñas conocidas.
	- Elimina sobrescrituras arbitrarias de decisiones de negocio (`can_originate`, `status`) en cada reinicio del servidor.

### 2026-10-08 / Arquitectura Canónica de Ofertas en `institution_products` con Versionado Aditivo Seguro (Corrección A1.1)
- Opciones evaluadas:
	- Opcion A: Mantener dos catálogos paralelos (`financial_institution_offers` y `institution_products`) con sincronización bidireccional.
	- Opcion B: Unificar la identidad canónica en `institution_products` enriquecida de forma aditiva (`product_type`, `name`, `status`, `current_version_number`) con su tabla histórica `institution_product_versions`, transacciones atómicas con row locks `SELECT FOR UPDATE`, validación obligatoria de condiciones mínimas (draft -> published gate), inclusión de `requiredDocuments` en el hash SHA-256 y restricción física de unicidad (`ipv_published_unique`).
- Decision final: Opcion B.
- Por que:
	- Elimina la duplicidad innecesaria de entidades en el dominio. `institution_products` no posee restricción única de `(institution_id, template_id)`, por lo que permite múltiples ofertas del mismo tipo por financiera de forma nativa.
	- Garantiza consistencia estricta ante concurrencia mediante transacciones atómicas protegidas por bloqueo de fila `FOR UPDATE` e índice parcial único `WHERE status = 'published'`.
	- Establece un gate de calidad comercial: las nuevas ofertas y versiones inician en `draft` y sólo pueden publicarse si satisfacen condiciones mínimas válidas.
	- La documentación requerida queda sellada criptográficamente en el hash SHA-256 determinista.
	- Se protege la trazabilidad legal impidiendo la eliminación destructiva de versiones publicadas o superseded utilizadas en el historial.

### 2026-10-08 / Cierre Técnico A1.2: Normalización `created_at`, Blindaje Legacy y Desactivación Lógica
- Opciones evaluadas:
	- Opcion A: Permitir que endpoints legacy muten ofertas publicadas directamente y mantener eliminación física con desvinculación forzada de créditos en cascada.
	- Opcion B: Normalizar a snake_case estricto `created_at` en migración y autoMigrate; bloquear mutaciones directas de estado (`published`) y condiciones en ofertas publicadas vía endpoints legacy obligando al uso de versiones; reemplazar la eliminación física de financieras u ofertas con historial por desactivación lógica (`isActive: false`, `status: 'archived'`); e inhabilitar la elegibilidad de ofertas en borrador para nuevas solicitudes sin romper el flujo operativo de registros legacy.
- Decision final: Opcion B.
- Por que:
	- Previene inconsistencias de esquema entre PostgreSQL y Drizzle ORM garantizando que la columna sea invariablemente `created_at`.
	- Impide que integraciones o endpoints legacy se salten el ciclo de vida de versionado y el gate de calidad comercial de ofertas vigentes.
	- Protege la integridad histórica y jurídica del libro de créditos y solicitudes ante solicitudes de borrado, convirtiéndolo en desactivación lógica segura.
	- Garantiza que los borradores incompletos nunca sean asignados a solicitudes reales mientras preserva la continuidad operativa de los productos preexistentes.

### 2026-10-08 / Cierre de Compatibilidad y Elegibilidad A1.3: Migración Legacy y Verificación de Versiones Publicadas
- Opciones evaluadas:
	- Opcion A: Asignar todas las ofertas existentes a `draft` al migrar y confiar exclusivamente en la columna `status === 'published'` de la oferta para considerarla elegible.
	- Opcion B: Migrar aditivamente los `institution_products` activos a `published` con su versión v1 inicial publicada en `institution_product_versions`, distinguir inequívocamente productos legacy de nuevas ofertas en borrador, exigir la verificación real de versiones publicadas en el backend (no confiar ciegamente en `status`) e impedir en backend (`POST /api/credit-submissions` y `POST /api/credits`) la utilización de ofertas en borrador.
- Decision final: Opcion B.
- Por que:
	- Evita la parálisis operativa: asignar productos legacy a `draft` rompería de inmediato el catálogo operativo y la recepción de solicitudes en curso.
	- Cierra la vulnerabilidad de spoofing o inconsistencia de estado: una oferta manipulada o inconsistente con `status = 'published'` pero sin versiones o con solo versiones borrador queda vetada de nuevas solicitudes.
	- Mantiene la compatibilidad legacy ininterrumpida por financiera y tipo de producto.

### 2026-10-08 / Cierre Definitivo de Seguridad A1.4: Idempotencia de Backfill, Forzado de Borrador y Validación de IDs
- Opciones evaluadas:
	- Opcion A: Permitir que el backfill se reejecute en cada reinicio evaluando `status = 'draft'` y permitir que el cliente declare `status: 'published'` al crear ofertas.
	- Opcion B: Controlar la ejecución única del backfill mediante tabla `app_migrations` filtrando exclusivamente por `status IS NULL` (nunca tocar borradores nuevos); forzar incondicionalmente `status: 'draft'` en creación desde el servidor; y rechazar explícitamente cualquier ID de oferta inexistente o no elegible al crear créditos o solicitudes preservando flujos legacy sin ID.
- Decision final: Opcion B.
- Por que:
	- Garantiza que los nuevos borradores jamás se promuevan a publicados al reiniciar o ejecutar migraciones automáticas.
	- Sella de forma definitiva la seguridad: solo el flujo de publicación formal con validación de condiciones mínimas puede establecer `published`.
	- Previene la creación de créditos o solicitudes asociados a entidades inexistentes o no publicadas, manteniendo a su vez compatibilidad con clientes sin ID de oferta.

### 2026-10-08 / Corrección Final del Backfill PostgreSQL A1: Orden DDL, Preservación y Manejo Seguro de app_migrations
- Opciones evaluadas:
	- Opcion A: Declarar `ADD COLUMN status VARCHAR DEFAULT 'draft'` inmediatamente y confiar en que `status IS NULL` identificará registros históricos en PostgreSQL; ignorar productos legacy inactivos y marcar `app_migrations` sin verificar completitud.
	- Opcion B: Agregar columnas `status` y `current_version_number` SIN `DEFAULT` para preservar `status IS NULL` en filas existentes en PostgreSQL; ejecutar backfill distinguiendo activos (`published`) de inactivos (`archived`); generar `version_hash` SHA-256 determinista para todos los snapshots; verificar completitud (`COUNT(*) = 0` sin versión) antes de marcar `app_migrations`; y solo después asignar `SET DEFAULT 'draft'` para nuevas inserciones.
- Decision final: Opcion B.
- Por que:
	- En PostgreSQL 11+, `ADD COLUMN ... DEFAULT 'draft'` asigna el valor por defecto de inmediato en el catálogo a las filas existentes, provocando que `status IS NULL` devuelva 0 filas y omita el backfill legacy.
	- Garantiza que los productos legacy inactivos no queden en el limbo o sean borrados, sino preservados con versión archivada e inmutabilidad histórica.
	- Asegura atomicidad e integridad: nunca se marca éxito en `app_migrations` si la migración histórica no completó el 100% de los registros legacy.

### 2026-10-08 / Validación Final A1: CI con PostgreSQL Efímero y Función Canónica de Hash
- Opciones evaluadas:
	- Opcion A: Confiar exclusivamente en pruebas unitarias en memoria y no validar con motor PostgreSQL real hasta llegar a staging o producción; permitir discrepancias de formato entre hashes SQL y hashes de Node.
	- Opcion B: Configurar un contenedor de servicio PostgreSQL 16 efímero en GitHub Actions para validar la migración 0005, el backfill, la idempotencia y la concurrencia en un entorno real aislado; e implementar una función SQL canónica `compute_legacy_version_hash` que replique exactamente el algoritmo y serialización de `computeInstitutionProductVersionHash` de Node.
- Decision final: Opcion B.
- Por que:
	- Cumple la directriz estricta de no tocar Producción ni Staging mientras se valida la compatibilidad real del motor PostgreSQL.
	- Elimina cualquier divergencia de hashing entre capas (SQL vs backend), asegurando que el libro inmutable de auditoría sea consistente en todas las plataformas.

### 2026-10-08 / Cierre de Seguridad de Integración PostgreSQL A1: Exigencia de TEST_DATABASE_URL y Rollback Seguro
- Opciones evaluadas:
	- Opcion A: Permitir que los tests de integración lean `DATABASE_URL` general; asumir dependencias mínimas en el fixture sin `users`; y dejar que errores de `autoMigrate` se capturen silenciosamente sin propagar al inicio del servidor.
	- Opcion B: Exigir estrictamente `TEST_DATABASE_URL` con validación de seguridad aislada (`assertSafeIsolatedTestDatabase`) prohibiendo terminantemente conexiones a bases productivas o staging; completar el fixture con `users` (`published_by`, `created_by`); ejecutar `ROLLBACK` obligatorio tras cualquier error dentro de una transacción; y propagar excepciones críticas de A1 en `runAutoMigration` para detener el arranque e impedir declarar el esquema listo, preservando los fallbacks históricos independientes.
- Decision final: Opcion B.
- Por que:
	- Elimina el riesgo catastrófico de ejecutar sentencias `DROP` accidentales sobre bases de datos de aplicación o staging.
	- Asegura que el motor PostgreSQL real ejecute la migración 0005 sin fallos de llave foránea inexistente.
	- Garantiza que las conexiones de PostgreSQL no queden en estado de transacción abortada tras errores de prueba.
	- Impide arrancar el backend en un estado inconsistente de esquema si falla la migración canónica A1.

## DECISIONES CAMBIADAS
- 2026-10-08: Se reemplaza la coexistencia de dos catálogos (`financial_institution_offers` y `institution_products`) por la unificación en `institution_products` como catálogo canónico, manteniendo aliases y vistas retrocompatibles para evitar romper integraciones.
- 2026-10-08: Se reemplaza la eliminación física con desvinculación de créditos en `deleteFinancialInstitution` por desactivación lógica preservadora de historial (`isActive: false` y ofertas archivadas) cuando existen créditos, solicitudes o versiones publicadas asociadas.
- 2026-10-08: Se descarta la asignación indiscriminada de productos preexistentes a `draft`; se migran como `published` con versión inicial v1 publicada para garantizar continuidad comercial inmediata.
- 2026-10-08: Se descarta permitir el parámetro `status` en la creación de ofertas; el servidor fuerza estrictamente `status: 'draft'`.
- 2026-10-08: Se corrige el orden DDL de PostgreSQL: primero se agregan las columnas sin valor por defecto para posibilitar el backfill de filas preexistentes (`status IS NULL`), y el default se establece únicamente al finalizar el proceso.
- 2026-10-08: Se prohíbe el uso de `DATABASE_URL` en tests de integración destructivos; se exige `TEST_DATABASE_URL` con validación de aislamiento estricta.