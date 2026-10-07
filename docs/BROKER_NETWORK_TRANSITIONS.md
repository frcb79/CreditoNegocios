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
