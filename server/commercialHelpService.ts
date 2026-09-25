import { randomUUID } from "node:crypto";
import { eq, desc, and } from "drizzle-orm";
import {
  operationalRulesVersions,
  userRuleAcknowledgments,
  DEFAULT_COMMERCIAL_RULES_CONFIG,
  type OperationalRulesVersion,
  type InsertOperationalRulesVersion,
  type UserRuleAcknowledgment,
  type InsertUserRuleAcknowledgment,
  type CommercialRulesConfig,
} from "../shared/schema";
import {
  commercialConfigService as defaultCommercialConfigService,
  type ICommercialConfigService,
} from "./commercialConfigService";

export interface HelpArticle {
  id: string;
  slug: string;
  title: string;
  category: "clientes" | "oportunidades" | "creditos_historicos" | "renovaciones" | "cambio_broker" | "conflictos" | "comisiones" | "manual_operativo" | "master_broker";
  categoryLabel: string;
  summary: string;
  contentMarkdown: string;
  keywords: string[];
  allowedRoles?: ("broker" | "master_broker" | "admin" | "super_admin")[];
  isFaq?: boolean;
  order?: number;
}

export interface ICommercialHelpStorage {
  getOperationalRulesVersions(): Promise<OperationalRulesVersion[]>;
  getOperationalRulesVersionById(id: string): Promise<OperationalRulesVersion | undefined>;
  getOperationalRulesVersionByVersion(version: string): Promise<OperationalRulesVersion | undefined>;
  getCurrentOperationalRulesVersion(): Promise<OperationalRulesVersion | undefined>;
  createOperationalRulesVersion(data: InsertOperationalRulesVersion & { createdBy?: string | null }): Promise<OperationalRulesVersion>;
  setCurrentOperationalRulesVersion(versionId: string): Promise<OperationalRulesVersion | undefined>;
  getUserRuleAcknowledgment(userId: string, ruleVersionId: string): Promise<UserRuleAcknowledgment | undefined>;
  createUserRuleAcknowledgment(data: InsertUserRuleAcknowledgment): Promise<UserRuleAcknowledgment>;
  getUserRuleAcknowledgments(userId: string): Promise<UserRuleAcknowledgment[]>;
}

export const DEFAULT_OPERATIONAL_RULES_V1: OperationalRulesVersion = {
  id: "seed-rule-version-1-0-0",
  version: "1.0.0",
  title: "Reglas de Operación y Protección Comercial de Crédito Negocios",
  summary: "Normas fundamentales de asignación de cartera, vigencia de relaciones comerciales, protección de oportunidades, atribución histórica y ventanas de renovación.",
  contentMarkdown: `# Reglas de Operación y Protección Comercial

**Versión:** 1.0.0  
**Fecha de Entrada en Vigor:** 24 de Septiembre, 2026  
**Ámbito:** Red de Brokers, Master Brokers y Mesa de Control de Crédito Negocios.

---

## 1. Principio Rector: Protección al Trabajo Real

La plataforma Crédito Negocios protege el **trabajo comercial efectivamente realizado**, no la simple antigüedad de una relación ni el registro preliminar de un cliente. 

El cliente es una entidad independiente con plena libertad de contratación. Ningún asesor ni broker posee derechos de propiedad perpetuos ni exclusivos sobre ningún cliente.

---

## 2. Clientes y Relación Comercial

1. **El cliente no es propiedad de ningún broker:** Registrar a un cliente en la plataforma le asigna una relación de cartera para su atención, pero no otorga derechos vitalicios ni exclusivos.
2. **Relación Activa:** Se mantiene vigente mientras el broker mantenga actividad comercial válida verificable con el cliente dentro de la ventana de vigencia configurada.
3. **Relación sin Actividad Reciente:** Si transcurre el plazo configurado sin interacción comercial válida comprobada, la relación pasa a estado inactivo (sin actividad reciente). El cliente permanece visible en su historial, pero queda disponible para que otro asesor pueda registrar nuevas oportunidades si el cliente así lo decide.
4. **Reactivación:** Una relación sin actividad reciente se reactiva automáticamente cuando el broker registra un avance comercial formal y validado (como la presentación de una nueva solicitud de crédito o documentación financiera vigente).

---

## 3. Oportunidades y Protección Comercial

1. **¿Qué es una oportunidad?:** Es la gestión de una necesidad específica y concreta de financiamiento para un cliente (por ejemplo: crédito simple para capital de trabajo de $1,500,000 MXN a 36 meses).
2. **Reserva Inicial:** Al registrar una oportunidad, el broker cuenta con un periodo de reserva inicial para recopilar la documentación del cliente y demostrar que existe una gestión real en marcha.
3. **Oportunidad Protegida:** Una vez que el broker sube evidencia válida (solicitud firmada, estados financieros o acuse de cotización formal), la oportunidad obtiene el estatus de **Oportunidad Protegida** durante el periodo de gestión activa verificable.
4. **Qué actividades SÍ mantienen la protección:**
   - Presentación de solicitudes de crédito formales.
   - Carga de estados de cuenta y documentación financiera requerida.
   - Cotizaciones emitidas y compartidas con el cliente.
   - Avances y propuestas de instituciones financieras aliadas.
5. **Qué actividades NO mantienen la protección:**
   - Notas manuales informales de CRM (por ejemplo: "llamé al cliente", "dejé mensaje").
   - Mensajes no verificados o notas sin documentación anexa.
6. **Liberación por Inactividad:** Si transcurre el plazo de reserva inicial sin documentación válida, o si una oportunidad protegida acumula inactividad comercial real, la oportunidad se libera automáticamente.
7. **Oportunidad Equivalente de Otro Asesor:** Si otro broker intenta registrar la misma necesidad de crédito para un cliente que ya cuenta con una oportunidad protegida vigente, el sistema no permitirá duplicarla para proteger la gestión del asesor titular.

---

## 4. Créditos Históricos y Atribución Perpetua

1. **Atribución Inmutable del Crédito Originado:** Cuando un broker gestiona y coloca exitosamente un crédito que es formalmente aprobado y dispersado, dicho crédito conserva permanentemente al broker originador en su registro histórico.
2. **No Implica Propiedad del Cliente:** La colocación de un crédito a largo plazo (por ejemplo a 24, 36 o 48 meses) **NO otorga exclusividad comercial general** sobre las futuras operaciones o nuevas necesidades del cliente durante la vida de ese crédito.
3. **Comisiones Históricas Intactas:** Las comisiones generadas por el crédito histórico corresponden única y exclusivamente a quien lo colocó, y no se modifican ni se alteran aunque el cliente decida tramitar una operación distinta en el futuro con otro broker.

---

## 5. Ventanas de Renovación

1. **Apertura de la Ventana:** En el plazo previo al vencimiento de un crédito vigente, el sistema abre la ventana de renovación.
2. **Prioridad Inicial del Broker Originador:** El broker que originó el crédito inicial dispone de un periodo preferente de prioridad para registrar la oportunidad de renovación y contactar al cliente.
3. **Necesidad de Actividad Real:** Para hacer valer la prioridad, el broker debe registrar actividad comercial real en la plataforma. Si no hay contacto ni avance dentro del plazo de prioridad, la oportunidad de renovación queda abierta.
4. **Respeto a Gestiones Previas:** La ventana de renovación respeta en todo momento oportunidades previas válidamente gestionadas y documentadas por terceros con consentimiento del cliente.

---

## 6. Elección de Broker por el Cliente

1. **Libertad de Elección del Cliente:** El cliente tiene derecho a decidir con qué asesor desea tramitar sus operaciones de crédito.
2. **Confirmación Digital Verificable:** Si un cliente desea ser atendido por un nuevo asesor, el cambio debe validarse mediante una **Confirmación Digital de Elección** enviada al teléfono o correo oficial del cliente mediante un enlace seguro con vigencia temporal, o a través de carta formal firmada por el representante legal.
3. **Efecto Exclusivo sobre Nuevas Oportunidades:** La confirmación de cambio aplica exclusivamente hacia operaciones futuras; **no altera los créditos históricos previos ni las comisiones devengadas** de operaciones ya cerradas.

---

## 7. Resolución de Controversias y Conflictos

1. **¿Cuándo existe una controversia real?:** Existe controversia cuando dos asesores presentan evidencia fehaciente de estar gestionando simultáneamente la misma operación ante las mismas instituciones financieras para el mismo cliente.
2. **Intento de Duplicado NO es Controversia:** Que el sistema rechace el alta de un cliente o el registro de una oportunidad porque ya existe una oportunidad protegida vigente es una protección operativa normal, no una controversia.
3. **Evidencia Requerida:** La parte que solicite revisión ante Mesa de Control debe adjuntar documentación que demuestre autorización del cliente, acuses de recepción y fechas precisas de gestión.
4. **Intervención y Arbitraje de Mesa de Control:** Mesa de Control revisa la bitácora cronológica inmutable y la evidencia documental para emitir un dictamen final definitivo.

---

## 8. Comisiones y Transparencia

1. **Dónde consultar comisiones:** Todo asesor puede revisar el estado, desglose y cálculo de sus comisiones en el módulo de **Comisiones** de la plataforma.
2. **Operación que Genera Atribución:** La comisión se genera cuando una solicitud de crédito llega a dispersión efectiva con una financiera aliada.
3. **No División Automática de Comisiones:** No existen divisiones ni splits automáticos entre brokers en caso de conflicto; la comisión se asigna a quien efectivamente concretó la solución autorizada por el cliente.
4. **Casos Excepcionales:** Cualquier ajuste extraordinario solo puede ser ordenado y aplicado formalmente por Mesa de Control tras un dictamen debidamente documentado.`,
  effectiveDate: "2026-09-24",
  isCurrent: true,
  requiresAcknowledgment: true,
  createdBy: null,
  createdAt: new Date("2026-09-24T00:00:00Z"),
};

export class MockCommercialHelpStorage implements ICommercialHelpStorage {
  private versions: Map<string, OperationalRulesVersion> = new Map();
  private acknowledgments: Map<string, UserRuleAcknowledgment> = new Map();

  constructor() {
    this.seedDefaultVersion();
  }

  private seedDefaultVersion() {
    this.versions.set(DEFAULT_OPERATIONAL_RULES_V1.id, { ...DEFAULT_OPERATIONAL_RULES_V1 });
  }

  async getOperationalRulesVersions(): Promise<OperationalRulesVersion[]> {
    return Array.from(this.versions.values()).sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da;
    });
  }

  async getOperationalRulesVersionById(id: string): Promise<OperationalRulesVersion | undefined> {
    return this.versions.get(id);
  }

  async getOperationalRulesVersionByVersion(version: string): Promise<OperationalRulesVersion | undefined> {
    return Array.from(this.versions.values()).find((v) => v.version === version);
  }

  async getCurrentOperationalRulesVersion(): Promise<OperationalRulesVersion | undefined> {
    return Array.from(this.versions.values()).find((v) => v.isCurrent) || Array.from(this.versions.values())[0];
  }

  async createOperationalRulesVersion(
    data: InsertOperationalRulesVersion & { createdBy?: string | null }
  ): Promise<OperationalRulesVersion> {
    const id = randomUUID();
    if (data.isCurrent) {
      for (const [vId, ver] of Array.from(this.versions.entries())) {
        this.versions.set(vId, { ...ver, isCurrent: false });
      }
    }
    const created: OperationalRulesVersion = {
      id,
      version: data.version,
      title: data.title,
      summary: data.summary,
      contentMarkdown: data.contentMarkdown,
      effectiveDate: data.effectiveDate,
      isCurrent: data.isCurrent ?? false,
      requiresAcknowledgment: data.requiresAcknowledgment ?? false,
      createdBy: data.createdBy ?? null,
      createdAt: new Date(),
    };
    this.versions.set(id, created);
    return created;
  }

  async setCurrentOperationalRulesVersion(versionId: string): Promise<OperationalRulesVersion | undefined> {
    const target = this.versions.get(versionId);
    if (!target) return undefined;

    for (const [id, ver] of Array.from(this.versions.entries())) {
      this.versions.set(id, { ...ver, isCurrent: id === versionId });
    }
    return this.versions.get(versionId);
  }

  async getUserRuleAcknowledgment(userId: string, ruleVersionId: string): Promise<UserRuleAcknowledgment | undefined> {
    const key = `${userId}:${ruleVersionId}`;
    return this.acknowledgments.get(key);
  }

  async createUserRuleAcknowledgment(data: InsertUserRuleAcknowledgment): Promise<UserRuleAcknowledgment> {
    const id = randomUUID();
    const key = `${data.userId}:${data.ruleVersionId}`;
    const ack: UserRuleAcknowledgment = {
      id,
      userId: data.userId,
      ruleVersionId: data.ruleVersionId,
      acknowledgedAt: new Date(),
      ipAddress: data.ipAddress ?? null,
    };
    this.acknowledgments.set(key, ack);
    return ack;
  }

  async getUserRuleAcknowledgments(userId: string): Promise<UserRuleAcknowledgment[]> {
    return Array.from(this.acknowledgments.values()).filter((a) => a.userId === userId);
  }
}

export class DrizzleCommercialHelpStorage implements ICommercialHelpStorage {
  constructor(private db: any) {}

  async getOperationalRulesVersions(): Promise<OperationalRulesVersion[]> {
    return await this.db
      .select()
      .from(operationalRulesVersions)
      .orderBy(desc(operationalRulesVersions.createdAt));
  }

  async getOperationalRulesVersionById(id: string): Promise<OperationalRulesVersion | undefined> {
    const [found] = await this.db
      .select()
      .from(operationalRulesVersions)
      .where(eq(operationalRulesVersions.id, id));
    if (found) return found;
    if (id === DEFAULT_OPERATIONAL_RULES_V1.id) return DEFAULT_OPERATIONAL_RULES_V1;
    return undefined;
  }

  async getOperationalRulesVersionByVersion(version: string): Promise<OperationalRulesVersion | undefined> {
    const [found] = await this.db
      .select()
      .from(operationalRulesVersions)
      .where(eq(operationalRulesVersions.version, version));
    if (found) return found;
    if (version === DEFAULT_OPERATIONAL_RULES_V1.version) return DEFAULT_OPERATIONAL_RULES_V1;
    return undefined;
  }

  async getCurrentOperationalRulesVersion(): Promise<OperationalRulesVersion | undefined> {
    const [current] = await this.db
      .select()
      .from(operationalRulesVersions)
      .where(eq(operationalRulesVersions.isCurrent, true))
      .limit(1);
    if (current) return current;

    const [latest] = await this.db
      .select()
      .from(operationalRulesVersions)
      .orderBy(desc(operationalRulesVersions.createdAt))
      .limit(1);
    if (latest) return latest;

    try {
      const [inserted] = await this.db
        .insert(operationalRulesVersions)
        .values({
          ...DEFAULT_OPERATIONAL_RULES_V1,
          createdAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) return inserted;
    } catch {
      // ignore
    }

    return DEFAULT_OPERATIONAL_RULES_V1;
  }

  async createOperationalRulesVersion(
    data: InsertOperationalRulesVersion & { createdBy?: string | null }
  ): Promise<OperationalRulesVersion> {
    const id = randomUUID();
    if (data.isCurrent) {
      await this.db
        .update(operationalRulesVersions)
        .set({ isCurrent: false });
    }
    const [created] = await this.db
      .insert(operationalRulesVersions)
      .values({
        ...data,
        id,
        createdAt: new Date(),
      })
      .returning();
    return created;
  }

  async setCurrentOperationalRulesVersion(versionId: string): Promise<OperationalRulesVersion | undefined> {
    await this.db
      .update(operationalRulesVersions)
      .set({ isCurrent: false });

    const [updated] = await this.db
      .update(operationalRulesVersions)
      .set({ isCurrent: true })
      .where(eq(operationalRulesVersions.id, versionId))
      .returning();
    return updated;
  }

  async getUserRuleAcknowledgment(userId: string, ruleVersionId: string): Promise<UserRuleAcknowledgment | undefined> {
    const [found] = await this.db
      .select()
      .from(userRuleAcknowledgments)
      .where(
        and(
          eq(userRuleAcknowledgments.userId, userId),
          eq(userRuleAcknowledgments.ruleVersionId, ruleVersionId)
        )
      );
    return found;
  }

  async createUserRuleAcknowledgment(data: InsertUserRuleAcknowledgment): Promise<UserRuleAcknowledgment> {
    const id = randomUUID();
    const [created] = await this.db
      .insert(userRuleAcknowledgments)
      .values({
        ...data,
        id,
        acknowledgedAt: new Date(),
      })
      .returning();
    return created;
  }

  async getUserRuleAcknowledgments(userId: string): Promise<UserRuleAcknowledgment[]> {
    return await this.db
      .select()
      .from(userRuleAcknowledgments)
      .where(eq(userRuleAcknowledgments.userId, userId))
      .orderBy(desc(userRuleAcknowledgments.acknowledgedAt));
  }
}

// -------------------------------------------------------------
// Generador Dinámico de Artículos basado en Configuración Comercial Central
// -------------------------------------------------------------
export function buildHelpArticles(
  config: CommercialRulesConfig = DEFAULT_COMMERCIAL_RULES_CONFIG
): HelpArticle[] {
  const {
    activeRelationshipValidityDays,
    initialOpportunityHoldDays,
    opportunityInactivityProtectionDays,
    inboundPriorityHours,
    renewalWindowDaysBeforeMaturity,
    renewalOriginatorPriorityDays,
    brokerElectionTokenValidityHours,
  } = config;

  return [
    // 1. Clientes y Relación Comercial
    {
      id: "art-clientes-relacion-comercial",
      slug: "clientes-relacion-comercial",
      title: "¿Cómo funciona la relación comercial con mis clientes?",
      category: "clientes",
      categoryLabel: "Clientes y Cartera",
      summary: `Explicación de por qué el cliente no pertenece de forma permanente al broker, qué es una relación activa (actualmente ${activeRelationshipValidityDays} días) y cómo se reactiva.`,
      keywords: ["cliente", "relacion comercial", "cartera", "activa", "reactivacion", "vigencia"],
      order: 1,
      contentMarkdown: `### El cliente no pertenece permanentemente al broker

En Crédito Negocios protegemos el **trabajo comercial efectivamente realizado**, no la simple antigüedad de haber registrado a un cliente.

- **Libertad del cliente:** Todo cliente tiene la libertad de decidir en cualquier momento qué asesor financiero gestionará sus trámites de financiamiento.
- **Relación Comercial Activa:** Se mantiene vigente mientras demuestres actividad comercial válida con el cliente dentro de los últimos **${activeRelationshipValidityDays} días naturales** (como solicitudes formales, documentos financieros o cotizaciones).
- **Relación sin Actividad Reciente:** Si pasan más de **${activeRelationshipValidityDays} días naturales** sin evidencia comercial comprobable en la plataforma, la relación pasa a estado inactivo. El cliente no se borra de tu historial, pero queda disponible para que otro asesor pueda registrar nuevas oportunidades si el cliente lo autoriza.
- **¿Cómo se reactiva?:** Se reactiva automáticamente en cuanto registres una nueva gestión comercial válida (por ejemplo, subiendo una nueva solicitud de crédito o estados financieros actualizados).`,
    },
    {
      id: "art-por-que-cliente-con-otro-broker",
      slug: "por-que-cliente-con-otro-broker",
      title: "¿Por qué este cliente aparece relacionado con otro broker?",
      category: "clientes",
      categoryLabel: "Clientes y Cartera",
      summary: "Qué significa ver a un asesor titular asignado y qué puedes hacer si el cliente desea trabajar contigo.",
      keywords: ["cliente", "otro broker", "asesor titular", "cambio de broker", "duplicado", "cartera"],
      isFaq: true,
      order: 2,
      contentMarkdown: `### ¿Por qué aparece otro asesor titular?

Cuando entras a la ficha de un cliente o intentas registrarlo y ves que ya cuenta con un asesor comercial asignado, significa que:

1. **Existe una relación activa:** El broker titular ha estado atendiendo al cliente y registrando avances comerciales dentro de la ventana de protección de **${activeRelationshipValidityDays} días naturales**.
2. **Existe una oportunidad protegida:** El broker titular tiene una solicitud de crédito en proceso activo para una necesidad financiera específica.

#### ¿Qué puedes hacer si el cliente se acercó a ti para que lo atiendas?
- **Consulta con el cliente:** Confirma si el cliente desea formalmente que tú seas quien gestione su nuevo financiamiento.
- **Solicita Cambio de Asesor:** El cliente puede validar su decisión mediante el envío de un **token seguro de confirmación digital** enviado a su teléfono o correo oficial (vigencia actual de **${brokerElectionTokenValidityHours} horas naturales**), o a través de una carta membretada firmada por su representante legal.
- **Mesa de Control:** Mesa de Control verificará la confirmación y te habilitará para abrir una nueva oportunidad comercial sin afectar los créditos que el cliente ya haya formalizado en el pasado.`,
    },
    {
      id: "art-cliente-ya-existe",
      slug: "cliente-ya-existe",
      title: "¿Qué hago si el cliente ya existe?",
      category: "manual_operativo",
      categoryLabel: "Manual Práctico",
      summary: "Guía paso a paso para proceder cuando el sistema detecta que el RFC, teléfono o correo ya está registrado.",
      keywords: ["cliente ya existe", "duplicado", "rfc existente", "telefono", "registro cliente", "alta cliente"],
      isFaq: true,
      order: 3,
      contentMarkdown: `### ¿Qué hacer si al registrar un cliente el sistema indica que ya existe?

El verificador de duplicados analiza en tiempo real el **RFC**, **teléfono** o **correo electrónico** para proteger las gestiones existentes y evitar confusiones:

1. **Si el cliente es tuyo pero estaba inactivo:**
   - Puedes crear directamente una nueva oportunidad de financiamiento en su ficha. Al registrar una actividad comercial válida, tu relación con el cliente se reactivará automáticamente.
2. **Si el cliente está asignado a otro asesor pero SIN oportunidad protegida:**
   - Si la relación del otro asesor no tiene actividad reciente, puedes iniciar una nueva oportunidad adjuntando la documentación del cliente.
3. **Si el cliente tiene una oportunidad protegida activa con otro broker:**
   - El sistema no permitirá duplicar la oportunidad para la misma necesidad de financiamiento.
   - Si el cliente acudió a ti voluntariamente porque ya no desea trabajar con el broker anterior, debes solicitar un **Cambio de Asesor** con la confirmación expresa del cliente.
4. **Si el cliente ya tiene créditos formalizados en el pasado:**
   - Los créditos históricos se conservan con el asesor original. Tú puedes gestionar las **nuevas necesidades** de financiamiento sin alterar los créditos antiguos.`,
    },
    // 2. Oportunidades y Protección
    {
      id: "art-oportunidad-protegida",
      slug: "oportunidad-protegida",
      title: "¿Qué significa una oportunidad protegida?",
      category: "oportunidades",
      categoryLabel: "Oportunidades",
      summary: `Conoce cómo funciona la protección comercial exclusiva (reserva inicial de ${initialOpportunityHoldDays} días y estatus protegido de hasta ${opportunityInactivityProtectionDays} días).`,
      keywords: ["oportunidad protegida", "reserva inicial", "hold", "proteccion", "exclusividad", "plazo"],
      isFaq: true,
      order: 4,
      contentMarkdown: `### ¿Qué es una Oportunidad Protegida?

Una oportunidad representa una **necesidad específica de financiamiento** para un cliente (por ejemplo: Crédito Simple PyME por $2,000,000 MXN para maquinaria).

Cuando registras una oportunidad en la plataforma:

1. **Reserva Inicial (${initialOpportunityHoldDays} días naturales):** 
   - Se te otorga una reserva temporal de **${initialOpportunityHoldDays} días naturales**.
   - Durante este tiempo ningún otro asesor puede registrar esa misma necesidad.
   - Tienes estos **${initialOpportunityHoldDays} días** para recopilar la documentación y subir evidencia formal de que estás gestionando el trámite.
2. **Estatus Protegido (hasta ${opportunityInactivityProtectionDays} días naturales):**
   - En cuanto subes evidencia válida (solicitud firmada, estados de cuenta, cotización formal), el estatus cambia a **Protegida**.
   - La protección dura hasta **${opportunityInactivityProtectionDays} días naturales** de gestión activa verificable.
   - Mientras mantengas actividad documentada en los últimos **${opportunityInactivityProtectionDays} días**, nadie más podrá tramitar esa misma oportunidad en la plataforma.
3. **Liberación por Inactividad:**
   - Si se vencen los **${initialOpportunityHoldDays} días** de reserva inicial sin documentación, o si la oportunidad pasa **${opportunityInactivityProtectionDays} días continuos** sin ninguna actividad real, la oportunidad se libera automáticamente.`,
    },
    {
      id: "art-actividades-que-mantienen-proteccion",
      slug: "actividades-que-mantienen-proteccion",
      title: "¿Qué actividades mantienen mi protección?",
      category: "oportunidades",
      categoryLabel: "Oportunidades",
      summary: `Diferencia clara entre avances comerciales reales que extienden tu vigencia (hasta ${opportunityInactivityProtectionDays} días) y simples notas informales de CRM.`,
      keywords: ["actividades", "proteccion", "crm", "notas", "solicitudes", "documentos", "estados de cuenta"],
      isFaq: true,
      order: 5,
      contentMarkdown: `### Actividades que SÍ y NO mantienen tu protección

Para que el sistema renueve el periodo de protección de tu oportunidad (hasta **${opportunityInactivityProtectionDays} días naturales**) y de tu relación comercial (hasta **${activeRelationshipValidityDays} días naturales**), la actividad debe demostrar avance tangible en el trámite.

#### Actividades que SÍ renuevan tu protección:
- **Subir Solicitud Formal de Crédito:** Firmada por el cliente o su representante legal.
- **Carga de Documentación Financiera:** Estados de cuenta bancarios, declaraciones fiscales anuales, constancia de situación fiscal (CSF).
- **Envío o Recepción de Cotización Formal:** Cotización o corrida financiera enviada al cliente.
- **Ingreso a Institución Financiera:** Solicitud formal ingresada a un banco o SOFOM aliada a través de la plataforma.
- **Avance de Dictamen o Aprobación:** Respuesta de pre-autorización, propuesta o aprobación definitiva.

#### Actividades que NO renuevan tu protección:
- **Notas manuales de CRM simples:** Notas como *"llamé al cliente"*, *"dejé mensaje en buzón"* o *"el cliente lo está pensando"*.
- **Comentarios sin evidencia documental:** Las anotaciones de texto sin archivo anexo o sin confirmación bilateral son para tu uso de agenda interna, pero **no extienden** los plazos de protección comercial.`,
    },
    // 3. Créditos Históricos y Atribución
    {
      id: "art-creditos-historicos-atribucion",
      slug: "creditos-historicos-atribucion",
      title: "Créditos Históricos: Atribución permanente y derechos del cliente",
      category: "creditos_historicos",
      categoryLabel: "Créditos Históricos",
      summary: "Por qué el broker originador conserva de por vida el crédito colocado pero esto no le da propiedad sobre futuros créditos del cliente.",
      keywords: ["credito historico", "atribucion", "comisiones historicas", "originador", "propiedad"],
      order: 6,
      contentMarkdown: `### Principios de Créditos Históricos

1. **Atribución Permanente al Originador:**
   - El broker que asesoró, tramitó y logró la dispersión de un crédito conserva su nombre y atribución como **Broker Originador** permanentemente en el sistema.
2. **Comisiones Históricas Intactas:**
   - Todas las comisiones generadas por ese crédito corresponden al broker originador conforme a los términos acordados al momento del cierre. Nadie puede modificar retroactivamente esa atribución.
3. **No Otorga Propiedad sobre Futuras Necesidades:**
   - Que un cliente tenga un crédito activo a 36 meses originado por ti no significa que todas las operaciones futuras del cliente durante esos 3 años te pertenezcan de manera obligatoria.
   - Si el cliente busca un crédito nuevo después y elige a otro asesor, ese nuevo trámite corresponderá al nuevo asesor, mientras tu crédito anterior seguirá pagándote las comisiones que le correspondan sin cambio alguno.`,
    },
    // 4. Renovaciones
    {
      id: "art-como-funciona-renovacion",
      slug: "como-funciona-renovacion",
      title: "¿Cómo funciona una renovación y la ventana de prioridad?",
      category: "renovaciones",
      categoryLabel: "Renovaciones",
      summary: `Apertura a ${renewalWindowDaysBeforeMaturity} días antes del vencimiento, ${renewalOriginatorPriorityDays} días hábiles de prioridad para el originador y necesidad de actividad real.`,
      keywords: ["renovacion", "ventana de renovacion", "vencimiento", "prioridad originador", "180 dias", "15 dias"],
      isFaq: true,
      order: 7,
      contentMarkdown: `### Reglas de la Ventana de Renovación

Cuando un crédito vigente se acerca a su término, la plataforma activa la gestión de renovación:

1. **Ventana de ${renewalWindowDaysBeforeMaturity} Días Previos:**
   - A los **${renewalWindowDaysBeforeMaturity} días naturales previos al vencimiento** del crédito, la oportunidad de renovación se visualiza en la sección de **Renovaciones**.
2. **Prioridad Inicial del Broker Originador (${renewalOriginatorPriorityDays} días hábiles):**
   - El broker que originó el crédito inicial dispone de un periodo preferente de **${renewalOriginatorPriorityDays} días hábiles** de prioridad para contactar al cliente y registrar la oportunidad de renovación en la plataforma.
   - Durante esos **${renewalOriginatorPriorityDays} días hábiles**, ningún otro asesor puede registrar una renovación para ese crédito.
3. **Necesidad de Actividad Real:**
   - La prioridad no es estática: para conservarla, debes registrar que has iniciado la gestión con el cliente (presentar propuesta o solicitar información financiera actualizada).
   - Si transcurren los **${renewalOriginatorPriorityDays} días hábiles** sin que registres actividad alguna, la oportunidad de renovación queda liberada.
4. **Respeto a Gestiones Previas:**
   - Si el cliente ya había otorgado formalmente autorización para una nueva línea de financiamiento antes de la ventana, se respetan las gestiones previamente protegidas.`,
    },
    // 5. Cambio de Broker
    {
      id: "art-como-solicito-cambio-de-broker",
      slug: "como-solicito-cambio-de-broker",
      title: "¿Cómo solicito un cambio de asesor o broker?",
      category: "cambio_broker",
      categoryLabel: "Cambio de Broker",
      summary: `Mecanismo digital y seguro para que el cliente confirme su voluntad de trabajar con un nuevo asesor (token válido por ${brokerElectionTokenValidityHours} horas).`,
      keywords: ["cambio de broker", "cambio de asesor", "token digital", "carta cliente", "voluntad cliente"],
      order: 8,
      contentMarkdown: `### Proceso de Cambio de Asesor por Elección del Cliente

Si un cliente registrado previamente con otro asesor desea formalmente ser atendido por ti para una nueva operación:

1. **Solicitud en Plataforma:**
   - En la ficha del cliente o durante la verificación, selecciona la opción **Solicitar Cambio de Asesor**.
2. **Método de Verificación:**
   - **Confirmación Digital (Recomendado):** El sistema genera un enlace seguro con un token digital que se envía por SMS o correo al teléfono o email oficial del cliente. El enlace tiene una vigencia de **${brokerElectionTokenValidityHours} horas naturales** para que el cliente confirme con un solo clic.
   - **Carta Membretada:** Puedes adjuntar una carta membretada firmada por el representante legal del cliente solicitando el cambio.
3. **Efecto de la Confirmación:**
   - Una vez validada la voluntad del cliente, se te asigna la titularidad para gestionar **nuevas oportunidades**.
   - Los créditos históricos y sus comisiones pasadas permanecen intactos con el broker que los originó.`,
    },
    // 6. Conflictos y Controversias
    {
      id: "art-como-se-resuelve-conflicto",
      slug: "como-se-resuelve-conflicto",
      title: "¿Cómo se resuelve un conflicto entre brokers?",
      category: "conflictos",
      categoryLabel: "Controversias",
      summary: `Diferencia entre bloqueo operativo y controversia real, evidencia requerida y dictamen de Mesa de Control (${inboundPriorityHours} horas de prioridad inbound).`,
      keywords: ["conflicto", "controversia", "mesa de control", "duplicado", "arbitraje", "evidencia"],
      isFaq: true,
      order: 9,
      contentMarkdown: `### Resolución Formal de Controversias

En Crédito Negocios las controversias se resuelven con base en hechos y bitácoras cronológicas inmutables, no en discusiones informales.

1. **Intento de Duplicado NO es Controversia:**
   - Si el sistema te impide dar de alta a un cliente o una oportunidad porque otro asesor ya la tiene protegida, esto es una regla operativa automática para cuidar las gestiones, no una controversia.
2. **¿Cuándo procede una controversia real?:**
   - Procede cuando dos asesores cuentan con evidencia documental de haber ingresado una solicitud para el mismo cliente ante la misma institución financiera en fechas coincidentes.
   - O cuando existe duda fundada sobre la autenticidad del consentimiento del cliente.
3. **Evidencia Requerida:**
   - Solicitudes firmadas con fecha y hora.
   - Acuses de recibo de instituciones financieras.
   - Correspondencia bilateral con el representante legal.
4. **Intervención de Mesa de Control:**
   - La Mesa de Control analiza la bitácora inmutable de la plataforma y la evidencia presentada.
   - Emite un dictamen vinculante en un plazo de respuesta preferente (hasta **${inboundPriorityHours} horas hábiles**).
   - No existen acuerdos informales de comisiones fuera de la resolución oficial.`,
    },
    // 7. Comisiones
    {
      id: "art-atribucion-comisiones",
      slug: "atribucion-comisiones",
      title: "¿Cómo funciona la atribución y consulta de comisiones?",
      category: "comisiones",
      categoryLabel: "Comisiones",
      summary: "Dónde consultar tus comisiones, qué operaciones generan pago y por qué no existen splits automáticos.",
      keywords: ["comisiones", "atribucion comisiones", "consulta comisiones", "split", "pago", "dispersion"],
      isFaq: true,
      order: 10,
      contentMarkdown: `### Transparencia y Atribución de Comisiones

1. **¿Dónde consulto mis comisiones?:**
   - En el menú principal, haz clic en **Comisiones**.
   - Allí encontrarás la lista de créditos colocados, el monto financiado, el porcentaje de comisión pactado, el estatus de dispersión y la fecha estimada de pago.
2. **¿Qué genera atribución de comisión?:**
   - La comisión se genera cuando una solicitud de crédito formalizada a través de la plataforma es aprobada y efectivamente dispersada por la institución financiera aliada.
3. **Comisiones Históricas Intactas:**
   - La comisión generada por un crédito colocado en el pasado pertenece de forma definitiva al broker originador, incluso si el cliente tramita futuros créditos con otro asesor.
4. **No existen divisiones (splits) automáticas:**
   - En la plataforma no se dividen comisiones de manera automática por reclamos o controversias. La comisión completa de una operación corresponde a la gestión que logró el financiamiento aprobado por el cliente.
   - Casos extraordinarios únicamente pueden ser autorizados por Mesa de Control mediante dictamen fundado.`,
    },
    // 8. Tareas del Manual Práctico
    {
      id: "art-como-registro-un-cliente",
      slug: "como-registro-un-cliente",
      title: "¿Cómo registro un cliente nuevo?",
      category: "manual_operativo",
      categoryLabel: "Manual Práctico",
      summary: "Paso a paso para dar de alta una empresa o persona física con actividad empresarial en la plataforma.",
      keywords: ["como registro cliente", "nuevo cliente", "alta cliente", "rfc", "formulario"],
      order: 11,
      contentMarkdown: `### Paso a paso: Registro de un cliente nuevo

1. Ve al menú lateral y haz clic en **Clientes**.
2. Haz clic en el botón superior derecho **+ Nuevo Cliente**.
3. Selecciona el tipo de persona (Persona Moral o Persona Física con Actividad Empresarial).
4. Ingresa el **RFC**, la Razón Social o Nombre Completo, teléfono de contacto y correo electrónico.
5. El sistema verificará automáticamente que los datos no coincidan con una oportunidad protegida activa.
6. Completa los datos generales y haz clic en **Guardar Cliente**.
7. ¡Listo! Tu cliente quedará registrado en tu cartera y podrás crearle inmediatamente su primera oportunidad de financiamiento.`,
    },
    {
      id: "art-como-creo-una-nueva-oportunidad",
      slug: "como-creo-una-nueva-oportunidad",
      title: "¿Cómo creo una nueva oportunidad?",
      category: "manual_operativo",
      categoryLabel: "Manual Práctico",
      summary: `Aprende a registrar una necesidad de financiamiento con monto, tipo de producto y plazo (con reserva inicial vigente de ${initialOpportunityHoldDays} días).`,
      keywords: ["crear oportunidad", "nueva oportunidad", "necesidad financiamiento", "monto", "producto"],
      order: 12,
      contentMarkdown: `### Paso a paso: Creación de una oportunidad

1. Abre la ficha de tu cliente desde la lista de **Clientes**.
2. En la pestaña u opción de **Oportunidades**, haz clic en **+ Nueva Oportunidad**.
3. Ingresa:
   - **Título descriptivo:** Ejemplo: *"Crédito simple para compra de maquinaria"*.
   - **Tipo de necesidad:** Capital de trabajo, arrendamiento, crédito simple, etc.
   - **Monto solicitado:** El importe estimado en pesos mexicanos.
   - **Plazo estimado y financiera preferente:** (opcional en esta etapa).
4. Haz clic en **Crear Oportunidad**.
5. Tu oportunidad iniciará en estado de **Reserva Inicial** por **${initialOpportunityHoldDays} días naturales** para que subas la documentación correspondiente.`,
    },
    {
      id: "art-que-significa-reserva-inicial",
      slug: "que-significa-reserva-inicial",
      title: "¿Qué significa “Reserva inicial”?",
      category: "manual_operativo",
      categoryLabel: "Manual Práctico",
      summary: `Qué es la reserva temporal de ${initialOpportunityHoldDays} días naturales y qué debes hacer para no perderla.`,
      keywords: ["reserva inicial", "hold", "7 dias", "plazo inicial", "subir documentos"],
      order: 13,
      contentMarkdown: `### ¿Qué es la Reserva Inicial?

La **Reserva Inicial** es un beneficio que te otorga la plataforma para proteger tu prospección:

- Al registrar una oportunidad nueva, el sistema te concede automáticamente **${initialOpportunityHoldDays} días naturales** de exclusividad temporal.
- Durante estos **${initialOpportunityHoldDays} días** ningún otro asesor puede registrar una solicitud idéntica para ese cliente.
- **Tu objetivo:** Antes de que terminen los **${initialOpportunityHoldDays} días naturales**, debes subir al menos un documento válido (solicitud firmada o estados financieros) para que la oportunidad pase a estado de **Oportunidad Protegida**.
- Si no subes documentación en los **${initialOpportunityHoldDays} días**, la reserva expira y la oportunidad se libera para que cualquier asesor pueda gestionarla.`,
    },
    {
      id: "art-como-convierto-oportunidad-en-protegida",
      slug: "como-convierto-oportunidad-en-protegida",
      title: "¿Cómo convierto una oportunidad en protegida?",
      category: "manual_operativo",
      categoryLabel: "Manual Práctico",
      summary: `Requisitos documentales para transformar tu reserva inicial en protección formal de hasta ${opportunityInactivityProtectionDays} días.`,
      keywords: ["convertir protegida", "proteger oportunidad", "subir evidencia", "documentos validos"],
      order: 14,
      contentMarkdown: `### Pasos para proteger tu oportunidad

1. Entra a la oportunidad desde la ficha del cliente o desde la lista de **Gestión de Créditos**.
2. Haz clic en el botón **Registrar Actividad / Evidencia**.
3. Selecciona un tipo de actividad válido:
   - *Carga de solicitud formal de crédito*
   - *Carga de estados de cuenta o declaraciones*
   - *Envío de cotización formal*
4. Adjunta el archivo o comprobante correspondiente.
5. Haz clic en **Guardar Actividad**.
6. El sistema validará la evidencia y actualizará el estatus inmediatamente a **Oportunidad Protegida**, otorgándote hasta **${opportunityInactivityProtectionDays} días naturales** de protección activa.`,
    },
    {
      id: "art-como-registro-nota-crm",
      slug: "como-registro-nota-crm",
      title: "¿Cómo registro una nota CRM?",
      category: "manual_operativo",
      categoryLabel: "Manual Práctico",
      summary: "Uso de notas internas para seguimiento de agenda y por qué no sustituyen a la evidencia formal.",
      keywords: ["nota crm", "bitacora", "comentario", "seguimiento", "agenda"],
      order: 15,
      contentMarkdown: `### Registro de Notas CRM

Las notas de CRM son herramientas para organizar tu día a día:

1. Dentro de la ficha del cliente o de la oportunidad, dirígete a la sección de **Bitácora / Notas**.
2. Escribe tu anotación (ejemplo: *"El cliente me pidió contactarlo el próximo martes tras reunión con su contador"*).
3. Haz clic en **Guardar Nota**.
4. **Importante recordar:** Las notas simples te ayudan en tu seguimiento interno, pero **no extienden** los plazos de reserva inicial ni la vigencia de la oportunidad protegida. Para extender la protección, registra siempre actividades con evidencia documental.`,
    },
    {
      id: "art-otra-persona-tiene-oportunidad-protegida",
      slug: "otra-persona-tiene-oportunidad-protegida",
      title: "¿Qué hago si otra persona ya tiene una oportunidad protegida?",
      category: "manual_operativo",
      categoryLabel: "Manual Práctico",
      summary: "Opciones disponibles si el financiamiento que buscas tramitar ya está en gestión activa por otro asesor.",
      keywords: ["otra persona tiene oportunidad", "bloqueo", "colision", "cambio asesor", "esperar liberacion"],
      order: 16,
      contentMarkdown: `### Si otra persona tiene una oportunidad protegida

Si al intentar registrar una oportunidad recibes un mensaje indicando que ya existe una oportunidad protegida para ese cliente y producto:

1. **Respeta la gestión activa:** El otro asesor se encuentra dentro de su periodo de protección documentado con el cliente.
2. **Si el cliente acudió a ti voluntariamente:**
   - Pregúntale si formalmente decidió no continuar con el asesor anterior.
   - De ser así, solicita una **Confirmación Digital de Elección de Asesor**.
3. **Si el cliente busca un producto completamente distinto:**
   - Puedes registrar una oportunidad si se trata de una necesidad financiera distinta y con distinta garantía o estructura.
4. **Mesa de Control:** Si consideras que la oportunidad del otro broker no tiene gestión real y está bloqueando al cliente indebidamente, puedes solicitar una revisión a Mesa de Control.`,
    },
    {
      id: "art-donde-reviso-mis-clientes",
      slug: "donde-reviso-mis-clientes",
      title: "¿Dónde reviso mis clientes?",
      category: "manual_operativo",
      categoryLabel: "Manual Práctico",
      summary: "Ubicación de tu cartera, filtros por estado de relación y acceso a expedientes.",
      keywords: ["donde reviso clientes", "mis clientes", "cartera", "lista clientes", "filtros"],
      order: 17,
      contentMarkdown: `### Acceso a tu cartera de clientes

1. En el menú de navegación izquierdo, haz clic en **Clientes**.
2. Verás la tabla con todos los clientes de tu cartera.
3. Puedes utilizar los filtros superiores para ver:
   - Clientes con **Relación Activa**.
   - Clientes **Sin Actividad Reciente**.
   - Clientes con **Oportunidades en Proceso**.
4. Haz clic sobre cualquier cliente para abrir su ficha completa, consultar sus créditos históricos y revisar sus documentos.`,
    },
    {
      id: "art-donde-reviso-mis-oportunidades",
      slug: "donde-reviso-mis-oportunidades",
      title: "¿Dónde reviso mis oportunidades?",
      category: "manual_operativo",
      categoryLabel: "Manual Práctico",
      summary: "Visualización de oportunidades en trámite, vigencias y estatus de protección.",
      keywords: ["donde reviso oportunidades", "mis oportunidades", "tramites", "estatus oportunidad"],
      order: 18,
      contentMarkdown: `### Consulta de oportunidades activas

1. En el menú principal, dirígete a **Gestión de Créditos** o al módulo de **Mis Solicitudes**.
2. Podrás ver el listado de todas tus oportunidades en curso.
3. En cada tarjeta o fila podrás identificar:
   - El cliente y monto solicitado.
   - El estatus de protección: **Reserva Inicial** (con días restantes) u **Oportunidad Protegida** (con fecha de vigencia).
   - El avance de trámite ante las financieras.`,
    },
    {
      id: "art-como-veo-proximas-renovaciones",
      slug: "como-veo-proximas-renovaciones",
      title: "¿Cómo veo las próximas renovaciones?",
      category: "manual_operativo",
      categoryLabel: "Manual Práctico",
      summary: `Uso del módulo de Renovaciones para dar seguimiento a créditos que vencen en los próximos ${renewalWindowDaysBeforeMaturity} días.`,
      keywords: ["proximas renovaciones", "modulo renovaciones", "vencimientos", "cartera a renovar"],
      order: 19,
      contentMarkdown: `### Visualización de Renovaciones

1. En el menú lateral, haz clic en **Renovaciones** (o Re-Gestión).
2. El sistema te mostrará automáticamente los créditos de tus clientes que entran en la ventana de **${renewalWindowDaysBeforeMaturity} días naturales previos a su vencimiento**.
3. Si el crédito fue originado por ti, verás el distintivo de **Prioridad de Originador** durante los primeros **${renewalOriginatorPriorityDays} días hábiles**.
4. Desde esta pantalla puedes hacer clic en **Iniciar Renovación** para crear la oportunidad correspondiente y comenzar la gestión con el cliente.`,
    },
    {
      id: "art-donde-consulto-mis-comisiones",
      slug: "donde-consulto-mis-comisiones",
      title: "¿Dónde consulto mis comisiones?",
      category: "manual_operativo",
      categoryLabel: "Manual Práctico",
      summary: "Acceso al módulo financiero de comisiones, liquidaciones y recibos.",
      keywords: ["donde consulto comisiones", "modulo comisiones", "pagos", "liquidaciones", "montos"],
      order: 20,
      contentMarkdown: `### Consulta de Comisiones

1. Ve a la barra lateral y selecciona **Comisiones**.
2. En este módulo verás el resumen financiero:
   - Comisiones devengadas y pagadas.
   - Comisiones en proceso de liquidación por operaciones recientemente dispersadas.
   - Detalle por cliente, financiera, monto financiado y fecha.
3. Si tienes dudas respecto a una liquidación específica, puedes contactar directamente a Mesa de Control desde la opción de soporte.`,
    },
    {
      id: "art-que-puede-ver-un-master-broker",
      slug: "que-puede-ver-un-master-broker",
      title: "¿Qué puede ver un Master Broker?",
      category: "master_broker",
      categoryLabel: "Supervisión y Red",
      summary: "Visibilidad consolidada de la red, supervisión de brokers subordinados y comisiones de estructura.",
      keywords: ["master broker", "supervision red", "red de brokers", "comisiones estructura", "subordinados"],
      allowedRoles: ["master_broker", "admin", "super_admin"],
      order: 21,
      contentMarkdown: `### Visibilidad y Facultades del Master Broker

El rol de **Master Broker** cuenta con herramientas de supervisión estratégica para coordinar a su red de asesores:

1. **Módulo de Red de Brokers:**
   - Visualización del desempeño consolidado de todos los brokers pertenecientes a su estructura.
   - Oportunidades ingresadas, montos tramitados y tasas de colocación de la red.
2. **Supervisión de Cartera y Oportunidades:**
   - Puede ver las oportunidades registradas por los miembros de su red para brindar apoyo comercial y seguimiento.
   - No suplanta la titularidad directa del broker que originó la oportunidad.
3. **Comisiones de Estructura:**
   - Consulta consolidada de las sobrecomisiones (overrate) generadas por la colocación de los asesores de su red.
4. **Intervención en Controversias:**
   - Puede consultar el estado de controversias en las que participe algún asesor de su red y aportar evidencia de supervisión ante Mesa de Control.`,
    },
    {
      id: "art-que-hago-si-una-accion-esta-bloqueada",
      slug: "que-hago-si-una-accion-esta-bloqueada",
      title: "¿Qué hago si no entiendo por qué una acción está bloqueada?",
      category: "manual_operativo",
      categoryLabel: "Manual Práctico",
      summary: "Explicación de bloqueos frecuentes por permisos, oportunidades de terceros o plazos vencidos.",
      keywords: ["accion bloqueada", "no puedo guardar", "error", "permiso", "bloqueo", "soporte"],
      isFaq: true,
      order: 22,
      contentMarkdown: `### ¿Por qué una acción puede estar bloqueada?

Si encuentras un botón deshabilitado o un mensaje que impide realizar una acción, las causas más habituales son:

1. **Oportunidad protegida por otro asesor:** El sistema protege las gestiones con evidencia vigente. Revisa si el cliente ya cuenta con un trámite activo para esa necesidad.
2. **Falta de evidencia para avanzar de estatus:** Si intentas enviar a aprobación una solicitud sin haber adjuntado los documentos requeridos por la financiera, el botón de envío estará deshabilitado.
3. **Plazo de reserva inicial vencido:** Si pasaron los **${initialOpportunityHoldDays} días naturales** sin adjuntar documentación, la oportunidad se cerró automáticamente por inactividad. Puedes crear una nueva si el cliente sigue disponible.
4. **Permisos de usuario o rol:** Ciertas acciones (como aprobar dictámenes o autorizar cambios de asesor) son de competencia exclusiva de Mesa de Control o Administradores de la plataforma.`,
    },
  ];
}

// Export estático inicial para retrocompatibilidad
export const HELP_ARTICLES: HelpArticle[] = buildHelpArticles(DEFAULT_COMMERCIAL_RULES_CONFIG);

export class CommercialHelpService {
  constructor(
    private storage: ICommercialHelpStorage,
    private configService?: ICommercialConfigService
  ) {}

  // -------------------------------------------------------------
  // Reglas de Operación
  // -------------------------------------------------------------
  async getOperationalRulesVersions(): Promise<OperationalRulesVersion[]> {
    return await this.storage.getOperationalRulesVersions();
  }

  async getCurrentOperationalRules(userId?: string): Promise<{
    version: OperationalRulesVersion;
    hasAcknowledged: boolean;
    acknowledgedAt: Date | null;
    currentConfig?: CommercialRulesConfig;
  } | undefined> {
    const current = await this.storage.getCurrentOperationalRulesVersion();
    if (!current) return undefined;

    let hasAcknowledged = false;
    let acknowledgedAt: Date | null = null;

    if (userId) {
      const ack = await this.storage.getUserRuleAcknowledgment(userId, current.id);
      if (ack) {
        hasAcknowledged = true;
        acknowledgedAt = ack.acknowledgedAt;
      }
    }

    const currentConfig = this.configService
      ? await this.configService.getConfig()
      : DEFAULT_COMMERCIAL_RULES_CONFIG;

    return {
      version: current,
      hasAcknowledged,
      acknowledgedAt,
      currentConfig,
    };
  }

  async getOperationalRulesByVersion(
    versionOrId: string,
    userId?: string
  ): Promise<{
    version: OperationalRulesVersion;
    hasAcknowledged: boolean;
    acknowledgedAt: Date | null;
  } | undefined> {
    let rule = await this.storage.getOperationalRulesVersionByVersion(versionOrId);
    if (!rule) {
      rule = await this.storage.getOperationalRulesVersionById(versionOrId);
    }
    if (!rule) return undefined;

    let hasAcknowledged = false;
    let acknowledgedAt: Date | null = null;

    if (userId) {
      const ack = await this.storage.getUserRuleAcknowledgment(userId, rule.id);
      if (ack) {
        hasAcknowledged = true;
        acknowledgedAt = ack.acknowledgedAt;
      }
    }

    return {
      version: rule,
      hasAcknowledged,
      acknowledgedAt,
    };
  }

  async recordAcknowledgment(
    userId: string,
    ruleVersionIdOrVersion: string,
    ipAddress?: string
  ): Promise<{
    success: boolean;
    alreadyAcknowledged: boolean;
    acknowledgedAt: Date;
    ruleVersionId: string;
  }> {
    let target = await this.storage.getOperationalRulesVersionById(ruleVersionIdOrVersion);
    if (!target) {
      target = await this.storage.getOperationalRulesVersionByVersion(ruleVersionIdOrVersion);
    }
    if (!target) {
      throw new Error(`La versión de reglas especificada no existe: ${ruleVersionIdOrVersion}`);
    }

    const existing = await this.storage.getUserRuleAcknowledgment(userId, target.id);
    if (existing) {
      return {
        success: true,
        alreadyAcknowledged: true,
        acknowledgedAt: existing.acknowledgedAt,
        ruleVersionId: target.id,
      };
    }

    const created = await this.storage.createUserRuleAcknowledgment({
      userId,
      ruleVersionId: target.id,
      ipAddress: ipAddress || null,
    });

    return {
      success: true,
      alreadyAcknowledged: false,
      acknowledgedAt: created.acknowledgedAt,
      ruleVersionId: target.id,
    };
  }

  async createOperationalRulesVersion(
    data: InsertOperationalRulesVersion & { createdBy?: string | null }
  ): Promise<OperationalRulesVersion> {
    return await this.storage.createOperationalRulesVersion(data);
  }

  // -------------------------------------------------------------
  // Artículos del Centro de Ayuda (Generación Dinámica)
  // -------------------------------------------------------------
  async getArticles(options?: {
    query?: string;
    category?: string;
    slug?: string;
    userRole?: string;
    configOverride?: CommercialRulesConfig;
  }): Promise<HelpArticle[]> {
    const config =
      options?.configOverride ||
      (this.configService
        ? await this.configService.getConfig()
        : DEFAULT_COMMERCIAL_RULES_CONFIG);

    const articles = buildHelpArticles(config);

    const userRole = (options?.userRole || "broker") as "broker" | "master_broker" | "admin" | "super_admin";
    let list = articles.filter((article) => {
      if (!article.allowedRoles) return true;
      return article.allowedRoles.includes(userRole);
    });

    if (options?.slug) {
      return list.filter((a) => a.slug === options.slug);
    }

    if (options?.category && options.category !== "all") {
      list = list.filter((a) => a.category === options.category);
    }

    if (options?.query && options.query.trim().length > 0) {
      const normalize = (str: string) =>
        str
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();

      const q = normalize(options.query.trim());
      // Búsqueda flexible e insensible a acentos en título, keywords, summary y contenido
      list = list.filter((a) => {
        const titleMatch = normalize(a.title).includes(q);
        const keywordMatch = a.keywords.some((k) => normalize(k).includes(q));
        const summaryMatch = normalize(a.summary).includes(q);
        const contentMatch = normalize(a.contentMarkdown).includes(q);
        return titleMatch || keywordMatch || summaryMatch || contentMatch;
      });
    }

    return list.sort((a, b) => (a.order || 99) - (b.order || 99));
  }

  async getArticleBySlug(
    slug: string,
    userRole?: string,
    configOverride?: CommercialRulesConfig
  ): Promise<HelpArticle | undefined> {
    const results = await this.getArticles({ slug, userRole, configOverride });
    return results[0];
  }

  async getCategories(
    userRole?: string,
    configOverride?: CommercialRulesConfig
  ): Promise<{ id: string; label: string; count: number }[]> {
    const articles = await this.getArticles({ userRole, configOverride });
    const counts = new Map<string, number>();

    const categoryLabels: Record<string, string> = {
      clientes: "Clientes y Cartera",
      oportunidades: "Oportunidades",
      creditos_historicos: "Créditos Históricos",
      renovaciones: "Renovaciones",
      cambio_broker: "Cambio de Broker",
      conflictos: "Controversias",
      comisiones: "Comisiones",
      manual_operativo: "Manual Práctico",
      master_broker: "Supervisión y Red",
    };

    for (const a of articles) {
      counts.set(a.category, (counts.get(a.category) || 0) + 1);
    }

    return Object.entries(categoryLabels).map(([id, label]) => ({
      id,
      label,
      count: counts.get(id) || 0,
    })).filter((cat) => cat.count > 0);
  }
}

export function createCommercialHelpService(
  storageOverride?: ICommercialHelpStorage,
  configServiceOverride?: ICommercialConfigService
): CommercialHelpService {
  const configService = configServiceOverride || defaultCommercialConfigService;

  if (storageOverride) {
    return new CommercialHelpService(storageOverride, configService);
  }

  const isMemory = process.env.USE_MEMORY_STORAGE === "true" || process.env.NODE_ENV === "test";
  if (isMemory) {
    return new CommercialHelpService(new MockCommercialHelpStorage(), configService);
  }

  const { db } = require("./db");
  return new CommercialHelpService(new DrizzleCommercialHelpStorage(db), configService);
}

export const commercialHelpService = createCommercialHelpService();
