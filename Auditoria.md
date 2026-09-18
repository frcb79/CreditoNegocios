# 📋 Auditoría Integral de Financieras y Comisiones

**Fecha:** 17 de Septiembre, 2026  
**Sistema:** Crédito Negocios (Plataforma Fintech)  
**Entorno Verificado:** Railway Staging (`https://creditonegocios-staging.up.railway.app`)  
**Metodología:** AI-TEAM-OS (Rigor Forense, Cero Pérdidas, Cero Duplicados)

---

## 1. Resumen Ejecutivo

1. **Estado de las Financieras Nuevas:**
   - **Jeeves, Kapital, Altum, Cualli, Aspiria y Pretmex SÍ están creadas, activas y operativas en la base de datos viva.**
   - Todas cuentan con `isActive: true` y `createdByAdmin: true`, lo cual garantiza visibilidad absoluta tanto para **Super Admin**, como **Master Broker** y **Brokers**.
   
2. **Auditoría de Duplicados:**
   - **0 duplicados** de las nuevas entidades. Cada una fue creada con un UUID único y reglas no repetidas.
   - **0 faltantes** respecto a la pestaña `Financieras adicionales` del Excel `Plantilla_Comisiones_Financieras Luis.xlsx` (excluyendo columnas C y D por instrucción expresa).

3. **¿Por qué no las ves en pantalla en este momento?**
   - **Razón Principal (Caché de React Query):** En [`client/src/lib/queryClient.ts`](file:///c:/Users/Usuario1/FRCB/CreditoNegocios-Main/CreditoNegocios/client/src/lib/queryClient.ts#L120), el frontend tiene configurado `staleTime: Infinity` y `refetchOnWindowFocus: false`. Esto significa que si tu navegador ya tenía cargada la página `/financieras` antes de la subida, **React Query no vuelve a consultar el servidor automáticamente**. Requiere una recarga forzada (**`Ctrl + F5`** en Windows o **`Ctrl + Shift + R`**).
   - **Filtro de Estado:** El frontend de `/financieras` tiene pestañas: *Todas*, *Activas*, *Inactivas*. Asegúrate de no tener activo un filtro de búsqueda residual en el input de búsqueda.
   - **URL / Entorno:** Si estás visualizando un frontend en localhost (`localhost:5173`) o un deployment con base de datos separada, las financieras subidas a Railway Staging no aparecerán ahí hasta que apunten al mismo backend.

---

## 2. Inventario Detallado de Financieras en Staging (23 Instituciones)

### A. Financieras Nuevas y Actualizadas (Pestaña "Financieras adicionales")

| Financiera | ID (UUID) | Estatus | Perfiles Soportados | Comisión Apertura | Comisión Total |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Altum** | `6f46c9b9-3f5e-428d-ad15-ac951ea94b79` | ✅ **ACTIVA** | Persona Moral | 2.00% | 2.00% |
| **Cualli** | `c66c62c8-12a9-44d8-96c0-0f6777edeb40` | ✅ **ACTIVA** | PM, PFAE | 2.00% | 2.00% |
| **Jeeves** | `7580e788-6f50-46d4-aec6-c0428579712d` | ✅ **ACTIVA** | Persona Moral | 3.00% | 3.00% |
| **Aspiria** | `f7609acc-6acd-4978-80bc-7a7a4d49d0e5` | ✅ **ACTIVA** | PM, PFAE | 3.00% | 3.00% |
| **Kapital** | `7939592d-c4eb-4f00-854f-f79d49ee639f` | ✅ **ACTIVA** | PM, PFAE | 1.50% | 1.50% |
| **Pretmex** | `f6cee9b4-61ab-4417-8854-767868cca756` | ✅ **ACTIVA** | Persona Moral | 2.50% | 2.50% |

---

### B. Financieras del Catálogo Base Original (12 Instituciones)

| Financiera | ID (UUID) | Estatus |
| :--- | :--- | :---: |
| **AFIRME** | `cad0a8c4-8b65-4928-981f-899a0ddcb490` | ✅ ACTIVA |
| **Anticipa - Finsus** | `9bc70363-7d76-4a16-a2bc-675be754ea94` | ✅ ACTIVA |
| **Axionex** | `711e9cc5-a55c-4eee-9a4a-a295e35499fd` | ✅ ACTIVA |
| **Banorte** | `1e033374-a110-4658-a801-bba8559b67e4` | ✅ ACTIVA |
| **Covalto** | `e9263015-b52a-406a-a062-a06a772a100e` | ✅ ACTIVA |
| **FinBe ABC** | `521493df-a6c3-4dd1-9426-ffa2ac7514c7` | ✅ ACTIVA |
| **Finsus** | `24beb097-2c8b-48a8-bd31-906cc94c544a` | ✅ ACTIVA |
| **Fondeadora** | `129d6a40-d48d-4aae-bfce-fa6062de8c95` | ✅ ACTIVA |
| **Hey, banco** | `46c7ab8a-5f4f-405d-8aaa-8333be4b4cba` | ✅ ACTIVA |
| **ION** | `0ec95e94-0dc9-436e-9406-76d764153a1d` | ✅ ACTIVA |
| **Konfío** | `76d99d27-8c54-4267-b540-97bb70096485` | ✅ ACTIVA |
| **PDN** | `c78919ee-368f-4039-b8a7-c749cf5112eb` | ✅ ACTIVA |

---

### C. Entidades de Pruebas Automatizadas E2E (5 Registros — ELIMINADAS ✅)

Estas entidades fueron generadas en sprints anteriores durante pruebas de estrés del sistema. Por instrucción directa del usuario, fueron completamente purgadas de la base de datos para dejar el catálogo limpio:

| Nombre en Base de Datos | ID (UUID) | Origen | Estatus |
| :--- | :--- | :--- | :---: |
| `E2E Flujo Completo 1778465033373` | `a5f4f13a-c852-4467-bb78-9e63821a7195` | Test E2E | 🗑️ **ELIMINADA** |
| `E2E Flujo Completo 1778465083854` | `6c1097e3-0c46-4dc0-84cf-cb8bb3be4112` | Test E2E | 🗑️ **ELIMINADA** |
| `E2E Flujo Completo 1778500901188` | `bd6082ee-0b44-4822-a72d-dca75fe229ae` | Test E2E | 🗑️ **ELIMINADA** |
| `Financiera Demo` | `9b3626e2-2a7e-40dc-845f-aa01dca4923f` | Seed Demo | 🗑️ **ELIMINADA** |
| `Financiera Prueba Franco` | `435d8e78-91e8-466c-8fe8-44585c5bb742` | Test Manual | 🗑️ **ELIMINADA** |

**Total de Financieras Oficiales en Plataforma: 18** (12 base + 6 adicionales). Cero duplicados, cero faltantes, cero basura de pruebas.

---

## 3. Comprobación en Vivo para el Usuario

Puedes ejecutar cualquiera de estos dos métodos en tu terminal PowerShell para ver la respuesta exacta de la base de datos viva:

### Opción 1: Con Node.js
```powershell
node scripts/verify_imported_institutions.cjs
```

### Opción 2: Con PowerShell Nativo (sin dependencias)
```powershell
.\scripts\verify_imported_institutions.ps1
```

Ambos scripts se autentican contra `https://creditonegocios-staging.up.railway.app` y despliegan la confirmación verde de cada una de las 6 financieras.

---

## 4. Acción Recomendada para Verlas en el Navegador

1. Ve a tu pestaña del navegador con la plataforma abierta.
2. Presiona **`Ctrl + F5`** para limpiar la caché de React Query.
3. Dirígete a **Financieras** (`/financieras`).
4. En el buscador escribe `Jeeves` o `Kapital`.
5. Si no aparecen, verifica que estés conectado a la URL de Staging (`https://creditonegocios-staging.up.railway.app/financieras` o tu frontend de Vercel vinculado).
