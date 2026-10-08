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

### 2026-10-08 / Arquitectura de Ofertas por Financiera con Versionado Aditivo Histórico (Bloque A1)
- Opciones evaluadas:
	- Opcion A: Sobrescribir directamente los campos y configuraciones de `institution_products` al cambiar tasas o condiciones.
	- Opcion B: Modelo aditivo de dos capas: `financial_institution_offers` (entidad lógica que permite múltiples ofertas del mismo `productType` por financiera) + `financial_institution_offer_versions` (historial inmutable de versiones con hash SHA-256 de condiciones y estados 'active'/'superseded').
- Decision final: Opcion B.
- Por que:
	- Permite que una financiera tenga múltiples ofertas del mismo tipo (ej. Crédito Simple Express vs con Garantía Real) sin colisión de unicidad.
	- Preserva el snapshot histórico inmutable de condiciones cuando se ajustan tasas en el mercado, permitiendo que solicitudes pasadas sigan referenciando la versión exacta ofrecida.
	- Garantiza auditoría regulatoria e integridad legal mediante hashes criptográficos SHA-256.
	- Protege la compatibilidad retroactiva al 100% con `institution_products` y `product_templates` existentes.

### 2026-10-08 / Aislamiento Estricto de Comisiones Internas de Crédito Negocios en Ofertas
- Opciones evaluadas:
	- Opcion A: Incrustar el spread o comisión interna de Crédito Negocios dentro del esquema y respuestas de las ofertas por financiera.
	- Opcion B: Desacoplar absolutamente las comisiones internas del catálogo de ofertas. Las entidades de ofertas y versiones solo almacenan condiciones cliente/producto. En fases futuras, el acceso a comisiones internas estará estrictamente blindado en backend por roles y APIs separadas por alcance (Master sólo ve su red autorizada; Broker sólo la propia; Crédito Negocios retiene exclusividad de su spread).
- Decision final: Opcion B.
- Por que:
	- Regla crítica de gobernanza comercial: las comisiones internas jamás deben filtrarse ni exponerse a Master Brokers o Brokers.
	- El aislamiento real debe implementarse en la capa de datos y servicios de backend, no en filtros superficiales de frontend.

## DECISIONES CAMBIADAS
[Si alguna se revirtio, documentar con la razon]