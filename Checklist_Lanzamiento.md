# Checklist de Salida a Producción y Lanzamiento — CréditoNegocios

Este documento detalla las acciones estratégicas, técnicas y de negocio a completar antes de dar luz verde definitiva a los primeros brokers y clientes reales en la plataforma.

---

## 1. Datos y Esquemas de Negocio (En Curso por Super Admin)
- [ ] **Limpieza de Financieras de Prueba:**
  - Auditar el catálogo en `/financieras`.
  - Desactivar (`isActive = false`) o eliminar registros dummy, instituciones de prueba o duplicadas.
- [ ] **Carga del Tabulador Oficial de Comisiones:**
  - Importar o configurar los esquemas de comisión por financiera activa:
    - **Apertura:** Porcentaje Financiera $\rightarrow$ Plataforma $\rightarrow$ Master Broker $\rightarrow$ Broker.
    - **Sobretasa:** Definir porcentaje (base 5.0% o acordado con cada financiera).
    - **Renovaciones:** Definir comisiones aplicables a créditos subsecuentes.
- [ ] **Validación de Rangos y Requisitos de Productos:**
  - Verificar que los montos mínimos/máximos, plazos permitidos y perfiles aceptados (Moral, PFAE, Física, Sin SAT) coincidan exactamente con las políticas vigentes de cada institución.

---

## 2. Seguridad e Infraestructura (Servidor / Railway)
- [ ] **Variables de Entorno Críticas:**
  - `SESSION_SECRET`: Garantizar que en producción sea una clave criptográfica aleatoria y segura.
  - `ADMIN_FALLBACK_PASSWORD`: Actualizar o deshabilitar contraseñas genéricas como `Prueba1$` en producción.
  - `DATABASE_URL`: Confirmar conexión con SSL habilitado y pooling de conexiones activo.
- [ ] **Servicio de Correo Electrónico (SMTP):**
  - Probar el envío de un correo de recuperación de contraseña y de bienvenida.
  - Asegurar que el remitente (`FROM_EMAIL`) esté verificado con SPF, DKIM y DMARC en el dominio `@creditonegocios.com.mx` para evitar llegar a la bandeja de Spam.
- [ ] **Persistencia de Archivos y Backups:**
  - Verificar que el almacenamiento de la carpeta `uploads/` (propuestas y carátulas PDF) cuente con volumen persistente o respaldo en el proveedor de nube.
  - Asegurar que los respaldos automáticos diarios (Automated Backups) estén activos en PostgreSQL.

---

## 3. "Golden Path" — Prueba de Humo de Punta a Punta (10 Minutos)
Realizar una simulación completa con una cuenta de prueba antes de incorporar al primer broker:
1. [ ] **Registro de Cliente:** Crear un cliente (Persona Moral o PFAE) con facturación y Buró en rango alto.
2. [ ] **Solicitud y Matching:** Crear solicitud de crédito; comprobar que las financieras elegibles aparezcan en *Compatibles* y que Buró PF y Ventas Gobierno dictaminen **"Cumple"**.
3. [ ] **Aprobación de Oferta:** Desde `/solicitudes-pendientes` como Super Admin, dar visto bueno y subir un PDF oficial de carátula.
4. [ ] **Comparativo de Propuestas:** Como Broker, entrar a `/comparar-propuestas/:id`, visualizar el documento oficial y seleccionar la propuesta ganadora (o dos propuestas complementarias).
5. [ ] **Dispersión y Comisiones:** Como Super Admin, marcar la oferta como *Dispersada*; verificar en `/comisiones` que se calcule la comisión en cascada (Super Admin, Master Broker y Broker) y la sobretasa correspondiente.
6. [ ] **Historial Crediticio:** Comprobar que en el perfil del cliente aparezca el nuevo crédito en *Créditos Vigentes* y en su *Historial Crediticio*.

---

## 4. Onboarding y Experiencia del Broker
- [ ] **Captura de CLABE Interbancaria:**
  - Recordar a los primeros brokers y Master Brokers ingresar su CLABE en su perfil para que sus comisiones vía STP se dispersen sin fricción.
- [ ] **Códigos de Red / Referidos:**
  - Confirmar que los códigos de referido de los Master Brokers (ej. `MB-FRANCO`) vinculen automáticamente a los nuevos brokers que se registren.
- [ ] **Kit de Bienvenida:**
  - Contar con una guía rápida de 1 página (PDF o infografía) con los 3 pasos esenciales:
    1. Registra a tu cliente.
    2. Sube su información financiera básica.
    3. Revisa y selecciona la mejor propuesta.

---

## 5. Aspectos Legales y Términos
- [ ] **Aviso de Privacidad:**
  - Verificar que el enlace al Aviso de Privacidad esté disponible y actualizado en los formularios de registro y captura de clientes, cumpliendo con la normativa de protección de datos financieros en México.
- [ ] **Términos y Condiciones para Brokers:**
  - Contar con los términos de colaboración y pago de comisiones aceptados durante el registro.
