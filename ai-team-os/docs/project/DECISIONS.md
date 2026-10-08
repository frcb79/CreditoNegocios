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

### 2026-10-07 / Inmutabilidad Estricta de Afiliación Histórica en 4 Entidades (Lineage)
- Opciones evaluadas:
	- Opcion A: Relacionar dinámicamente créditos, solicitudes y comisiones con el `users.master_broker_id` actual del broker al momento de consultar.
	- Opcion B: Capturar un snapshot inmutable en cada entidad al momento de originarse (`commercial_opportunities.master_broker_id`, `credit_submission_requests.origin_master_broker_id`, `credits.origin_master_broker_id`), blindado con triggers PostgreSQL a nivel de base de datos (`BEFORE UPDATE ... RAISE EXCEPTION`).
- Decision final: Opcion B.
- Por que:
	- Garantiza que cuando un broker se mueva de Master A a Master B (o a Crédito Negocios directo), Master B jamás herede el negocio histórico o comisiones pasadas de Master A.
	- Separa conceptualmente la relación organizativa actual (`users.master_broker_id`, `tenants.parent_tenant_id`) de la atribución económica histórica.
	- Los triggers de base de datos impiden modificaciones arbitrarias incluso ante eventuales bugs o bypasses desde la capa de aplicación.

### 2026-10-07 / Gobernanza de Estados Operativos y Desacoplamiento de Reactivación
- Opciones evaluadas:
	- Opcion A: Permitir que los Master Brokers reactiven directamente a los brokers que suspendieron o dieron de baja.
	- Opcion B: El Master Broker puede suspender o dar de baja a brokers de su propia red, pero la reactivación requiere solicitud formal (`user_status_requests`) y aprobación exclusiva de Super Admin.
- Decision final: Opcion B.
- Por que:
	- Previene conflictos de interés y asegura control centralizado de cumplimiento/compliance sobre quién opera en la plataforma.
	- Mantiene la independencia entre el estado operativo global (`users.status` / `isActive`) y la propiedad del tenant (`tenant_members.role = 'owner'`).

### 2026-10-07 / Cierre P0: Centralización del Gate de Formalización y Cierre de Bypasses en Originación
- Opciones evaluadas:
	- Opcion A: Validar formalización únicamente en el frontend o verificando ad-hoc el `brokerId` del payload en algunas rutas.
	- Opcion B: Centralizar la verificación en el backend mediante `validateEffectiveBrokerFormalization` y el pipeline `validateCommercialOriginationAndFormalization`, evaluando al broker originador efectivo (titular, delegado, o en nombre de quien opera un admin/colaborador) contra los documentos obligatorios vigentes (`isUserFormalized`).
- Decision final: Opcion B.
- Por que:
	- Garantiza que ningún Broker o Master Broker origine operaciones (`clients`, `credits`, `submissions`, `targets`, `mortgage-leads`, `opportunities`) sin haber formalizado sus documentos obligatorios vigentes.
	- Cierra bypasses de originación delegada por colaboradores o administradores actuando en nombre de un broker no formalizado.
	- Preserva las facultades de los administradores para originar operaciones propias sin bloqueos.
### 2026-10-07 / Atribución Bancaria de Comisiones al Master Histórico y Blindaje contra Spoofing de CLABE
- Opciones evaluadas:
	- Opcion A: Resolver el beneficiario bancario y CLABE consultando el `masterBrokerId` actual del broker al momento de la dispersión, y permitir sobrescribir la CLABE desde el cuerpo de la petición enviada por el frontend.
	- Opcion B: Obtener el beneficiario bancario exclusivamente del Master Broker histórico registrado en la operación (`commission.masterBrokerId` con fallback a `credit.originMasterBrokerId`), presentar en UI la CLABE oficial en modo de solo lectura, y en backend rechazar estrictamente cualquier discrepancia entre una CLABE enviada por el cliente y la CLABE oficial registrada en el expediente formalizado del beneficiario.
- Decision final: Opcion B.
- Por que:
	- Si un broker cambia de red (de Master A a Master B), los pagos por operaciones originadas bajo Master A deben liquidarse ineludiblemente a las cuentas bancarias de Master A, nunca a Master B ni a una cuenta arbitraria.
	- Impide que una alteración en la petición web desvíe fondos o altere silenciosamente el beneficiario bancario de la comisión.
	- Mantiene la consistencia integral con la multi-dispersión y comisiones independientes por desembolso.

### 2026-10-07 / Unificación Atómica del Registro de Brokers en PostgreSQL
- Opciones evaluadas:
	- Opcion A: Registrar el usuario y evidencias legales en una transacción y después provisionar el tenant y la membresía en pasos separados con `try/catch` permisivo.
	- Opcion B: Unificar en una sola transacción PostgreSQL (`tx`): identidad del broker, aceptación de Términos y Aviso de Privacidad, tenant propio del broker, membresía owner con `canOriginate=true` y afiliación al tenant del Master o plataforma.
- Decision final: Opcion B.
- Por que:
	- Elimina la creación de brokers "huérfanos" sin organización o sin permisos de originación exigidos por Network Transitions.
	- Si cualquier paso falla (duplicidad, error de tenant, hashes no coincidentes), PostgreSQL revierte la totalidad del registro sin dejar estados parciales ni evidencias huérfanas.

### 2026-10-07 / Blindaje contra Doble Conteo en Comisiones Master Directo y Liquidación Canónica
- Opciones evaluadas:
	- Opcion A: Sumar `brokerShare + masterBrokerShare` siempre que exista `masterBrokerId`, obligando al frontend a descontar o ajustar en caliente.
	- Opcion B: Definir un helper canónico `getCommissionPayoutAmount` en backend y sincronizado en frontend, identificando `isMasterDirect` (`historicalMasterId === brokerId`), devolviendo estrictamente la cuota única legítima del Master (sin duplicar), capeando `frozenAmount` legacy corruptos y asegurando que `/pay`, `/bulk-pay`, `/mark-paid` y `Commissions.tsx` respeten el importe único.
- Decision final: Opcion B.
- Por que:
	- Protege la integridad financiera de la plataforma impidiendo pagos dobles accidentales vía STP o liquidación manual.
	- Mantiene la transparencia contable para el Master Broker y Super Admin en la visualización en cascada de `Commissions.tsx`.

### 2026-10-08 / Integridad Estricta de Afiliación de Red en Registro Canónico
- Opciones evaluadas:
	- Opcion A: Si se suministra un `masterBrokerId` no encontrado, hacer fallback automático a la organización plataforma.
	- Opcion B: Reutilizar la resolución canónica de Network Transitions (`getPlatformTenant` y `getOwnedTenant`). Si `masterBrokerId` está definido y no se encuentra su tenant Master activo o válido, abortar y revertir toda la transacción. Si es broker directo y falta la organización plataforma, también fallar de forma segura.
- Decision final: Opcion B.
- Por que:
	- Evita afiliaciones silenciosamente corruptas o asignaciones erróneas a Casa Matriz cuando la intención legal y operativa del usuario era afiliarse a un Master Broker.
	- Preserva la topología jerárquica estricta de multitenancy.

### 2026-10-08 / Auditoría Rigurosa de Importes Congelados y Bloqueo de Liquidación ante Discrepancia
- Opciones evaluadas:
	- Opcion A: Reducir silenciosamente cualquier `frozenAmount > singleShare` al monto legítimo al liquidar, y permitir que `frozenAmount = 0` recalcule en caliente un pago positivo.
	- Opcion B: Implementar `auditCommissionPayout`: un `frozenAmount = 0` explícito nunca se convierte en pago positivo; ante cualquier discrepancia histórica (ej. $60k congelado vs $30k legítimo), no alterar silenciosamente las cifras sino bloquear la liquidación con error auditado (`FROZEN_AMOUNT_DISCREPANCY`), exigir revisión administrativa y preservar intactos los registros aprobados y pagados en base de datos.
- Decision final: Opcion B.
- Por que:
	- En auditoría contable y financiera, un importe previamente congelado que difiere del cálculo reglamentario no debe mutarse de manera encubierta. Exige revisión humana auditada.
	- Protege la inmutabilidad de los registros históricos sin alteraciones retroactivas.

### 2026-10-08 / Evidencia Persistente de Auditoría en Rechazos de Dispersión y Flujo de Excepción Administrativa
- Opciones evaluadas:
	- Opcion A: Retornar errores HTTP 400 sin registrar en `commission_audit_logs` los rechazos previos al bloqueo de concurrencia (CLABE faltante, CLABE alterada, discrepancia en congelado).
	- Opcion B: Persistir formalmente en `commission_audit_logs` cada intento bloqueado (`action: 'dispersion_blocked'`) con actor, motivo estructurado y detalle completo del incidente; establecer un flujo administrativo gobernado para resolver comisiones bloqueadas por `FROZEN_AMOUNT_DISCREPANCY` mediante dictamen de Mesa de Control / Super Admin.
- Decision final: Opcion B.
- Por que:
	- Seguridad Bancaria: Los intentos de manipulación de CLABE (`CLABE_TAMPERING_ATTEMPT`) y dispersión a cuentas no validadas deben dejar rastro inmutable para auditoría y cumplimiento normativo.
	- Gobernanza Financiera: Las discrepancias en importes congelados requieren un expediente administrativo explícito que justifique cualquier regularización manual antes de reintentar la dispersión, evitando bypasses operacionales.

### 2026-10-08 / Desacoplamiento de Operaciones Administrativas y Blindaje Zero-Destructive del Arranque
- Opciones evaluadas:
	- Opcion A: Mantener las operaciones administrativas en `server/autoMigrate.ts` condicionadas por flags de entorno (`ENABLE_ADMIN_SEED=true`).
	- Opcion B: Depurar integralmente `server/autoMigrate.ts` para que el arranque del servidor (`runAutoMigration`) sea 100% no destructivo e idempotente (estrictamente DDL y backfills protegidos por marcadores únicos `system_migration_markers` con `WHERE origin_master_broker_id IS NULL`), desacoplando toda inicialización de cuentas de prueba, reseteo de contraseñas, reactivación masiva y purga de financieras a un script CLI administrativo explícito (`scripts/admin-bootstrap-environment.ts`).
- Decision final: Opcion B.
- Por que:
	- Un reinicio o cold start del servidor en Staging o Producción jamás debe restablecer contraseñas, reactivar usuarios suspendidos, cambiar roles, reasignar brokers a Masters o reactivar financieras desactivadas por negocio.
	- Elimina el riesgo de corrupción en el linaje histórico de créditos al condicionar los backfills a `origin_master_broker_id IS NULL`.
	- Mantiene la capacidad de aprovisionar ambientes nuevos de manera segura, auditable y bajo control deliberado del operador.

### 2026-10-08 / Eliminación Total de Bypass en Login y Gate Temporal Obligatorio de Comisiones
- Opciones evaluadas:
	- Opcion A: Mantener el bypass de contraseñas de desarrollo para conveniencia en testing y permitir la dispersión masiva automática sin aprobación previa.
	- Opcion B: Eliminar radicalmente las contraseñas hardcodeadas (`allowedAdminPasswords`) y sincronización automática en `POST /api/auth/login`, forzando hash criptográfico estricto para todas las cuentas; e implementar un gate temporal obligatorio en backend para dispersión individual (`/pay`), masiva (`/bulk-pay`) y manual (`/mark-paid`), requiriendo que la comisión cuente con `status === 'approved'`, `approvedBy` de Super Admin, `approvedAt`, y un `frozenAmount` numérico válido. Deshabilitar temporalmente la aprobación masiva (`/bulk-approve` -> 400 `BULK_APPROVAL_TEMPORARILY_DISABLED`) para forzar la revisión manual individual por Super Admin.
- Decision final: Opcion B.
- Por que:
	- Seguridad Crítica (P0): Las contraseñas fijas conocidas en código fuente representan una brecha de acceso no autorizado inaceptable para cuentas de Super Admin y Brókers.
	- Integridad Financiera: Impide dispersiones no autorizadas de comisiones que no hayan sido formalmente revisadas, aprobadas y congeladas de forma individual por Super Admin.
	- Cumplimiento y Trazabilidad: Cada aprobación y bloqueo persiste un log inmutable en `commission_audit_logs`.

## DECISIONES CAMBIADAS
[Si alguna se revirtio, documentar con la razon]