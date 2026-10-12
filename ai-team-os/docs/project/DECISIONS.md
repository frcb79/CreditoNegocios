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

### 2026-10-12 / Modelo de Pago Consolidado Exclusivo a Master Broker en Redes (COM-03/06, PAG-08/13/14)
- Opciones evaluadas:
	- Opcion A: Dispersar transferencias directas duales desde Crédito Negocios (una al Broker subordinado y otra al Master Broker).
	- Opcion B: Crédito Negocios paga exclusivamente al Master Broker el total correspondiente a su red (`masterBrokerShare + brokerShare`); el Master dispersa posteriormente a sus Brokers; la plataforma registra la obligación Master → Broker como `networkObligation` con estado `'pending_master_payout'` sin marcarla pagada por CN.
- Decision final: Opcion B.
- Por que:
	- Respeta la jerarquía de intermediación y los acuerdos comerciales privados entre el Master Broker y su red.
	- Evita que Crédito Negocios asuma obligaciones directas de dispersión a subordinados de redes privadas.
	- Conserva la trazabilidad y desglose histórico completo de cuotas para fiscalidad y auditoría.

### 2026-10-12 / Candado Estricto de Simulador STP y Liquidación Manual Verificable (PAG-12/13)
- Opciones evaluadas:
	- Opcion A: Permitir que `processStpPayment` marque comisiones como `paid` directamente mediante identificadores de transacción simulados.
	- Opcion B: Mantener transferencias reales deshabilitadas en código; prohibir terminantemente que resultados simulados marquen comisiones como `paid`; exigir que las pruebas de pasarela (`/pay` y `/bulk-pay`) requieran explícitamente `simulate: true` y mantengan el estado `approved`; autorizar pagos reales exclusivamente de forma manual por Super Admin en `/mark-paid` con clave de rastreo bancaria SPEI verificable obligatoria y justificación en bitácora.
- Decision final: Opcion B.
- Por que:
	- Previene el riesgo crítico de falsos positivos financieros donde comisiones queden marcadas como pagadas sin salida real de tesorería bancaria.
	- Garantiza auditoría e idempotencia estricta por Super Admin con folio de rastreo verificable antes de asentar pagos en libros.

## DECISIONES CAMBIADAS
### 2026-10-12 / Reversión selectiva de transferencias directas duales introducidas en 64ad33b
- Decisión anterior: En checkpoint `64ad33b` se implementó que `/pay` y `/mark-paid` dispersaran dos transferencias bancarias separadas (una al Broker y una al Master Broker) para créditos de red.
- Razón del cambio: Decisión de negocio vinculante (Plan Maestro v1.1). Crédito Negocios liquida consolidado al Master (`masterBrokerShare + brokerShare`); el Master tiene la responsabilidad jurídica y operativa de dispersar posteriormente a sus brokers de red. Se revirtieron las transferencias duales hacia el modelo de pago consolidado único al Master y registro de obligación diferida `pending_master_payout`.