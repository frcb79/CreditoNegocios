# Movimientos de Red y Escalamiento Broker → Master Broker

## Regla de gobierno

Los cambios de afiliación y la promoción de Broker a Master Broker son exclusivos de **Super Admin**.

Un Master Broker puede **suspender o dar de baja** directamente a un broker de su propia red. La solicitud a Super Admin se conserva únicamente para pedir una **reactivación**. Un Master no puede:

- apropiarse de un broker ya registrado;
- moverlo desde otra red;
- reactivarlo directamente;
- convertirlo en Master Broker;
- modificar `role` o `masterBrokerId`.

## Transiciones soportadas

1. Broker directo de Crédito Negocios → Master Broker existente.
2. Broker de Master A → Master B.
3. Broker de Master A → Crédito Negocios directo.
4. Broker directo → Master Broker.
5. Broker suspendido/inactivo → mismo Master, otro Master o Crédito Negocios, con reactivación controlada por Super Admin.

No se incluye en este bloque una degradación Master Broker → Broker.

## Identidad y organización

El usuario conserva el mismo `users.id`.

### Modelo canónico de afiliación

- `masterBrokerId = <id de un usuario master_broker>` significa pertenencia real a esa red Master.
- `masterBrokerId = null` significa Broker directo de **Crédito Negocios / Casa Matriz**.
- Un usuario `admin` o `super_admin` nunca funciona como Master Broker económico.
- Se elimina la distinción heredada entre “broker independiente” y “broker de Casa Matriz”: ambos son brokers directos de plataforma.

Todo Broker nuevo debe nacer con su propia organización tipo `broker` y una membresía `owner` con `canOriginate=true`. Registro, invitación y alta administrativa usan el mismo camino canónico para crear identidad + tenant + owner en una sola transacción.

Cada broker mantiene su organización propia. Una reasignación cambia el `parent_tenant_id` de esa organización:

- bajo Master: parent = tenant del Master;
- directo: parent = tenant plataforma.

Al promover un broker, su organización existente se transforma de `broker` a `master_broker`, preservando su `tenant.id`, clientes, documentos y operaciones.

## Historia económica inmutable

La afiliación actual nunca debe reescribir el pasado.

Se agrega `credits.origin_master_broker_id` para congelar la estructura comercial al crear el crédito:

- broker bajo Master A → A;
- Master originando directamente → su propio ID;
- broker directo de Crédito Negocios → null.

El valor es inmutable. Por lo tanto, si el broker posteriormente pasa a Master B, un crédito originado bajo A seguirá generando sus comisiones con la afiliación A.

Para datos previos a esta funcionalidad, la migración congela la afiliación existente en el momento de su primera ejecución. A partir de ahí el snapshot queda protegido por trigger y no puede reescribirse en arranques posteriores.

Las comisiones existentes mantienen además su propio `master_broker_id`, montos y shares congelados.

Las **oportunidades comerciales** congelan igualmente el `master_broker_id` vigente al momento de su creación. Antes de habilitar los movimientos, la migración 0004 fotografía una sola vez la afiliación de oportunidades existentes que todavía no tuvieran ese dato. Después queda protegida por trigger. Por ello:

- una oportunidad nacida bajo Master A continúa atribuida y visible históricamente para A;
- si el broker pasa a Master B, B no hereda esa oportunidad anterior;
- las oportunidades nuevas creadas después del movimiento se atribuyen a B.

Las **solicitudes/canalizaciones** congelan `origin_master_broker_id` desde el momento en que se envían. Esto cubre operaciones que siguen vivas durante un cambio de red:

- solicitud creada bajo Master A → broker pasa a B → la solicitud sigue visible/atribuida a A;
- si esa solicitud se convierte después en crédito, el crédito hereda A aunque el broker ya esté con B;
- las comisiones derivadas de ese crédito siguen la misma afiliación A;
- una solicitud nueva creada después del movimiento se fotografía bajo B;
- si la solicitud nació como broker directo de Crédito Negocios, conserva `null` aunque el broker posteriormente se una a un Master.

Los dashboards y vistas de solicitudes/créditos de Master Broker usan estas fotografías históricas. El conteo de **brokers activos en su red** sí utiliza la afiliación actual.

## Alta inicial

La creación de un Broker también respeta el gobierno de red:

- un Master Broker puede dar de alta un broker nuevo directamente dentro de su propia red;
- un Admin de plataforma puede crear brokers directos de Crédito Negocios;
- sólo Super Admin puede crear un broker nuevo ya asignado a un Master Broker distinto;
- un Master Broker nuevo se crea primero como Broker y después se promueve mediante **Movimientos de Red**.

## Solicitudes de estado pendientes

Una transición ejecutada por Super Admin invalida las solicitudes de estado pendientes del broker. Esto evita que una solicitud del Master anterior pueda aprobarse después de la reasignación.

## Auditoría

Cada transición genera un registro en `commercial_audit_logs` con:

- actor Super Admin;
- broker afectado;
- rol anterior/nuevo;
- Master anterior/nuevo;
- tenant y parent anterior/nuevo;
- estado anterior/nuevo;
- motivo;
- fecha efectiva;
- cantidad de solicitudes pendientes invalidadas;
- confirmación de que la atribución histórica se preserva.

## Integración legal

La formalización legal vive en un bloque paralelo. Cuando ese bloque se integre, un usuario promovido a `master_broker` deberá cumplir los documentos adicionales exigibles a Master Broker antes de originar bajo su nuevo rol. Las aceptaciones históricas no se eliminan.

## Validación antes de merge

- `npm run check`
- `npm run build`
- suite unitaria
- pruebas E2E relevantes
- migración 0004 en staging
- Broker A → Master B
- Broker A → plataforma
- Broker directo → Master
- broker suspendido → reactivación + cambio de red
- intento de cambio por Admin normal → 403
- intento de reasignación por Master → rechazo
- crédito creado bajo Master A, mover broker a B, dispersar crédito → comisión sigue con A
- nuevo crédito después del movimiento → afiliación B
- verificar que solicitudes pendientes del Master anterior quedan invalidadas
- Master propio: suspensión directa → permitido
- Master propio: baja directa → permitido
- Master propio: reactivación directa → 403; sólo solicitud a Super Admin
- Admin normal: reasignación/reactivación → 403
- oportunidad creada bajo Master A, mover broker a B → la oportunidad sigue atribuida a A
- oportunidad nueva después del movimiento → atribuida a B
- solicitud creada bajo Master A → mover broker a B → solicitud sigue con A
- convertir esa solicitud en crédito después del movimiento → crédito y comisión siguen con A
- nueva solicitud posterior al movimiento → B
- solicitud directa de Crédito Negocios → mover broker a Master → crédito derivado continúa directo
