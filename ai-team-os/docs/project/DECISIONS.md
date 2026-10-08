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
	- Preserva intacta la experiencia del broker: registro, consulta de documentos, navegación y edición de perfil antes de formalizar.

## DECISIONES CAMBIADAS
[Si alguna se revirtio, documentar con la razon]