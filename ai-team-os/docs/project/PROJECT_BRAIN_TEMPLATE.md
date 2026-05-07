# PROJECT BRAIN - Memoria del Proyecto
Plantilla para iniciar cualquier proyecto nuevo.
Se actualiza al final de cada sesion.

## INFO DEL PROYECTO
Nombre: [NOMBRE DEL PROYECTO]
Cliente: [NOMBRE DEL CLIENTE]
Fecha inicio: [YYYY-MM-DD]
Fase: Discovery / MVP / Desarrollo / QA / Produccion
Estado: Activo / En pausa / Bloqueado

## QUE ES ESTE PROYECTO
[Que problema resuelve, para quien, y cual es el resultado de negocio esperado]

## ESTRATEGIA DE NEGOCIO (GODFATHER OFFER)
- **Problema de "Cuello de Botella":** [Duelo real del cliente]
- **Mecanismo Único:** [Por qué nuestra solución funciona donde otras fallaron]
- **La Godfather Offer:** [Oferta irresistible que elimina el riesgo]
- **Hook Principal:** [Frase que detiene el scroll]

## STACK
Frontend: [tecnologia]
Backend: [tecnologia]
Deploy: [plataforma]
Integraciones clave: [pagos, email, CRM, analytics, etc]

## MATRIZ DE AMBIENTES
| Ambiente | Frontend URL | Backend URL/API | Base de datos | Owner | Objetivo |
|----------|--------------|-----------------|---------------|-------|----------|
| Local | [url] | [url] | [motor/url local] | [owner] | [desarrollo diario] |
| Staging | [url] | [url] | [db] | [owner] | [qa / smoke / demos] |
| Produccion | [url] | [url] | [db] | [owner] | [usuarios reales] |

Reglas obligatorias:
- El frontend y el backend se documentan por separado.
- Toda URL publicada debe indicar si es app visual, API, panel admin o health endpoint.
- Ningun deploy a produccion sin staging operativo y validado.

## CUENTAS, CREDENCIALES Y OWNERSHIP
- Vercel / frontend hosting: [owner actual]
- Railway / backend hosting: [owner actual]
- Supabase / database-storage-auth: [owner actual]
- Dominio y DNS: [owner actual]
- GitHub / repositorio: [owner actual]
- Email transaccional: [owner actual]
- Analytics / monitoreo: [owner actual]

Referencias obligatorias:
- `docs/deployment/MASTER_CREDENTIALS_TEMPLATE.md`
- `docs/deployment/ACCOUNT_TRANSFER_CHECKLIST.md`

## DOCUMENTACION OPERATIVA MINIMA
- [ ] PROJECT_BRAIN activo
- [ ] DECISIONS actualizado
- [ ] ERROR_LOG actualizado
- [ ] Runbook de deploy
- [ ] Runbook de rollback
- [ ] Guía de accesos operativos
- [ ] Checklist de validacion por ambiente
- [ ] Checklist de handoff al cliente

## OBJETIVOS DEL MVP
1. [Objetivo 1 medible]
2. [Objetivo 2 medible]
3. [Objetivo 3 medible]

## ESTADO ACTUAL
Completado:
- [lista concreta]

En progreso:
- [lista concreta]

Pendiente:
- [lista concreta]

Bloqueadores:
- [lista concreta]

## DECISIONES CLAVE DE NEGOCIO Y TECNICAS
- [Fecha] [Decision] [Por que]

## RIESGOS ACTIVOS
- [Riesgo] [Impacto] [Mitigacion]

## VALIDACIONES OBLIGATORIAS POR AMBIENTE
Local:
- [ ] App levanta
- [ ] API responde
- [ ] Auth funciona
- [ ] Datos seed o fixtures disponibles

Staging:
- [ ] Frontend publico abre
- [ ] Backend health responde
- [ ] Registro/login funciona
- [ ] CORS correcto
- [ ] Importaciones/cargas criticas funcionan
- [ ] Smoke tests guardados

Produccion:
- [ ] Dominio principal activo
- [ ] Variables correctas
- [ ] Monitoreo activo
- [ ] Backup/restore validado
- [ ] Rollback definido

## HANDOFF / ENTREGA AL CLIENTE
Incluido en contrato: [si/no]
Se cobra por separado: [si/no]
Fecha objetivo de transferencia: [YYYY-MM-DD]

Checklist minimo:
- [ ] Inventario de cuentas completo
- [ ] Nuevas cuentas del cliente creadas
- [ ] Accesos transferidos
- [ ] Llaves y secretos rotados
- [ ] Billing transferido
- [ ] Validacion post-transferencia ejecutada
- [ ] Soporte post-handoff acordado

## PROXIMOS 3 PASOS
1. [Accion concreta + responsable]
2. [Accion concreta + responsable]
3. [Accion concreta + responsable]

## HISTORIAL DE SESIONES
[YYYY-MM-DD] - [Resumen corto de lo realizado y resultado]
