import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  clientCommercialRelationships,
  operationalRulesVersions,
  commercialAuditLogs,
  clients,
  credits,
  documents,
  creditSubmissionRequests,
  DEFAULT_COMMERCIAL_RULES_CONFIG,
  type Client,
  type Credit,
  type Document,
  type CreditSubmissionRequest,
  type ClientCommercialRelationship,
  type OperationalRulesVersion,
  type InsertClientCommercialRelationship,
  type InsertOperationalRulesVersion,
  type CommercialRulesConfig,
} from "../shared/schema";
import type { ICommercialConfigService } from "./commercialConfigService";

export interface ICommercialBackfillStorage {
  getClients(): Promise<Client[]>;
  getCredits(): Promise<Credit[]>;
  getDocuments(): Promise<Document[]>;
  getCreditSubmissionRequests(): Promise<CreditSubmissionRequest[]>;
  getExistingRelationships(): Promise<ClientCommercialRelationship[]>;
  createCommercialRelationship(data: InsertClientCommercialRelationship): Promise<ClientCommercialRelationship>;
  getOperationalRulesVersion(version: string): Promise<OperationalRulesVersion | undefined>;
  createOperationalRulesVersion(data: InsertOperationalRulesVersion): Promise<OperationalRulesVersion>;
  createAuditLog?(data: any): Promise<any>;
}

export interface CommercialBackfillOptions {
  referenceDate?: Date;
  inactivityWindowDays?: number; // Override explícito; si se omite, se lee de la configuración central
  config?: CommercialRulesConfig; // Configuración inyectable
}


export interface CommercialBackfillClientResult {
  clientId: string;
  clientName: string;
  brokerId: string;
  assignedStatus: "active" | "legacy_unverified";
  evidenceReason: string;
  lastValidActivityAt: Date;
  isNew: boolean;
}

export interface CommercialBackfillSummary {
  totalClients: number;
  newRelationshipsCreated: number;
  alreadyExistingSkipped: number;
  assignedActive: number;
  assignedLegacyUnverified: number;
  rulesVersionSeeded: boolean;
  rulesVersionAlreadyExisted: boolean;
  clientDetails: CommercialBackfillClientResult[];
}

export const INITIAL_OPERATIONAL_RULES_V1: InsertOperationalRulesVersion = {
  version: "1.0.0",
  title: "Reglas de Operación y Gobernanza Comercial v1.0",
  summary:
    "Criterios normativos iniciales que rigen la relación comercial entre clientes y brokers, protección de oportunidades, renovaciones y arbitraje en Crédito Negocios.",
  contentMarkdown: `# Reglas de Operación y Gobernanza Comercial

**Versión:** 1.0.0  
**Fecha de Entrada en Vigor:** 24 de Septiembre, 2026  
**Ámbito:** Red de Brokers, Master Brokers y Mesa de Control de Crédito Negocios.

---

## 1. Principio Rector

La plataforma Crédito Negocios protege el **trabajo comercial efectivamente realizado**, no la simple antigüedad de una relación ni el registro preliminar de un cliente. El cliente es una entidad independiente con libertad de contratación; ningún broker posee derechos de propiedad perpetuos ni exclusivos sobre ningún cliente.

---

## 2. Atribución Histórica de Créditos (Inmutable)

1. Cuando un broker origina un crédito que es formalmente aprobado y dispersado, la atribución de dicho crédito permanece ligada de por vida a ese broker originador.
2. La colocación de un crédito a largo plazo (e.g. 24, 36 o 48 meses) **NO otorga exclusividad comercial general** sobre las futuras operaciones o nuevas necesidades del cliente durante la vida de ese crédito.
3. Las comisiones pactadas y devengadas sobre el crédito original corresponden a quien lo colocó y no son alteradas retroactivamente por cambios de asesor en operaciones posteriores.

---

## 3. Relación Comercial de Cartera y Oportunidades Concretas

1. La plataforma reconoce una **Relación Comercial Activa** mientras el broker demuestre interacción comercial válida con el cliente dentro de los últimos 90 días.
2. Lo que se protege de forma exclusiva es una **Oportunidad Concreta de Financiamiento** (Cliente + Necesidad/Producto + Broker + Plazo).
3. **Plazo de Validación Inicial:** El broker dispone de 7 días naturales a partir del registro para presentar evidencia de oportunidad real. De no presentarse, se libera para cualquier otro asesor.
4. **Vigencia de Oportunidad Protegida:** Una vez validada la evidencia, la oportunidad permanece protegida hasta por 45 días naturales de gestión activa verificable.
5. Las notas manuales simples de CRM (e.g. "llamé al cliente") **NO extienden** los periodos de protección. Se exige correspondencia bilateral, documentos financieros o avances de trámite.

---

## 4. Prioridad ante Solicitudes Directas (Inbound)

Si un cliente acude directamente a Crédito Negocios y existe una relación comercial activa con un broker:
* El broker relacionado dispone de **48 horas hábiles de prioridad** para activar la oportunidad.
* Si el broker pertenece a una red de Master Broker, el Master Broker recibe visibilidad de supervisión pero no el derecho operativo directo.
* Si transcurren las 48 horas sin activación, Mesa de Control reasigna la oportunidad.

---

## 5. Elección de Broker por el Cliente

1. El cliente puede confirmar en cualquier momento su deseo de trabajar con un nuevo broker mediante el mecanismo de **Confirmación Digital de Elección** (token seguro con vigencia de 72 horas naturales enviado a un contacto autorizado).
2. La confirmación digital registra de manera fehaciente fecha, hora, IP, medio y contacto.
3. El cambio de broker aplica exclusivamente hacia operaciones futuras; no altera créditos históricos.

---

## 6. Política sobre Apropiación de Trabajo Previo

1. La atribución económica y comercial sigue a la oportunidad que efectivamente originó la solución financiera.
2. Si un broker obtiene una aprobación con una financiera y un segundo broker intenta cerrar esa misma aprobación, la operación permanece atribuida al primer broker. No existen splits automáticos.
3. Si el segundo broker estructura una operación genuinamente nueva con distinta financiera y nueva aprobación, le corresponde a dicho broker.

---

## 7. Ventanas de Renovación

1. A los **180 días previos al vencimiento** de un crédito, se abre la ventana de renovación.
2. El broker originador dispone de **15 días hábiles de prioridad** para registrar la oportunidad de renovación.
3. Esta ventana respeta en todo momento oportunidades previas válidamente gestionadas por terceros con consentimiento del cliente.`,
  effectiveDate: "2026-09-24",
  isCurrent: true,
  requiresAcknowledgment: true,
};

export class CommercialBackfillService {
  constructor(
    private storage: ICommercialBackfillStorage,
    private configService?: ICommercialConfigService
  ) {}

  /**
   * Ejecuta el backfill conservador e idempotente de relaciones comerciales
   * y la siembra de la versión inicial de reglas de operación v1.0.0.
   */
  async runBackfill(options: CommercialBackfillOptions = {}): Promise<CommercialBackfillSummary> {
    const referenceDate = options.referenceDate || new Date();

    // Obtener configuración centralizada de reglas comerciales sin números mágicos dispersos
    let config: CommercialRulesConfig = DEFAULT_COMMERCIAL_RULES_CONFIG;
    if (options.config) {
      config = options.config;
    } else if (this.configService) {
      config = await this.configService.getConfig();
    }

    const inactivityDays = options.inactivityWindowDays ?? config.activeRelationshipValidityDays;
    const cutoffDate = new Date(referenceDate.getTime() - inactivityDays * 24 * 60 * 60 * 1000);

    const [allClients, allCredits, allDocs, allSubmissions, existingRelationships] =
      await Promise.all([
        this.storage.getClients(),
        this.storage.getCredits(),
        this.storage.getDocuments(),
        this.storage.getCreditSubmissionRequests(),
        this.storage.getExistingRelationships(),
      ]);

    // Mapa de relaciones existentes por clientId para garantizar idempotencia O(1)
    const existingRelMap = new Map<string, ClientCommercialRelationship>();
    for (const rel of existingRelationships) {
      existingRelMap.set(rel.clientId, rel);
    }

    // Agrupar registros auxiliares por clientId
    const creditsByClient = new Map<string, Credit[]>();
    for (const cred of allCredits) {
      const list = creditsByClient.get(cred.clientId) || [];
      list.push(cred);
      creditsByClient.set(cred.clientId, list);
    }

    const docsByClient = new Map<string, Document[]>();
    for (const doc of allDocs) {
      if (doc.clientId) {
        const list = docsByClient.get(doc.clientId) || [];
        list.push(doc);
        docsByClient.set(doc.clientId, list);
      }
    }

    const submissionsByClient = new Map<string, CreditSubmissionRequest[]>();
    for (const sub of allSubmissions) {
      const list = submissionsByClient.get(sub.clientId) || [];
      list.push(sub);
      submissionsByClient.set(sub.clientId, list);
    }

    const summary: CommercialBackfillSummary = {
      totalClients: allClients.length,
      newRelationshipsCreated: 0,
      alreadyExistingSkipped: 0,
      assignedActive: 0,
      assignedLegacyUnverified: 0,
      rulesVersionSeeded: false,
      rulesVersionAlreadyExisted: false,
      clientDetails: [],
    };

    // Procesar cada cliente
    for (const client of allClients) {
      const existing = existingRelMap.get(client.id);

      if (existing) {
        summary.alreadyExistingSkipped++;
        summary.clientDetails.push({
          clientId: client.id,
          clientName: client.businessName || `${client.firstName || ""} ${client.lastName || ""}`.trim() || "Sin Nombre",
          brokerId: existing.brokerId,
          assignedStatus: existing.status as "active" | "legacy_unverified",
          evidenceReason: `Registro de relación comercial preexistente (status: ${existing.status})`,
          lastValidActivityAt: existing.lastValidActivityAt || new Date(client.createdAt || referenceDate),
          isNew: false,
        });
        continue;
      }

      // Evaluar evidencia comercial verificable dentro de la ventana configurada
      const clientSubs = submissionsByClient.get(client.id) || [];
      const clientDocs = docsByClient.get(client.id) || [];
      const clientCreds = creditsByClient.get(client.id) || [];

      // A. Solicitud de crédito reciente en <= inactivityDays
      const recentSubmission = clientSubs.find((s) => {
        const d = s.updatedAt ? new Date(s.updatedAt) : s.createdAt ? new Date(s.createdAt) : null;
        return d !== null && d >= cutoffDate;
      });

      // B. Documento comercial o financiero subido recientemente en <= inactivityDays
      const recentDoc = clientDocs.find((d) => {
        const dDate = d.uploadedAt ? new Date(d.uploadedAt) : null;
        return dDate !== null && dDate >= cutoffDate;
      });

      // C. Cliente de creación reciente en <= inactivityDays
      const isRecentCreation = client.createdAt ? new Date(client.createdAt) >= cutoffDate : false;

      // D. Crédito recién formalizado o iniciado en <= inactivityDays
      const recentCredit = clientCreds.find((c) => {
        const startDate = c.startDate ? new Date(c.startDate) : null;
        const createdDate = c.createdAt ? new Date(c.createdAt) : null;
        return (startDate !== null && startDate >= cutoffDate) || (createdDate !== null && createdDate >= cutoffDate);
      });

      let status: "active" | "legacy_unverified" = "legacy_unverified";
      let evidenceReason = `Sin actividad comercial verificable en los últimos ${inactivityDays} días`;
      let lastValidActivityAt = client.createdAt ? new Date(client.createdAt) : referenceDate;

      if (recentSubmission) {
        status = "active";
        const subDate = new Date(recentSubmission.updatedAt || recentSubmission.createdAt || referenceDate);
        if (subDate > lastValidActivityAt) lastValidActivityAt = subDate;
        evidenceReason = `Solicitud de crédito reciente (${recentSubmission.status}) registrada/actualizada el ${subDate.toISOString().split("T")[0]}`;
      } else if (recentDoc) {
        status = "active";
        const docDate = new Date(recentDoc.uploadedAt || referenceDate);
        if (docDate > lastValidActivityAt) lastValidActivityAt = docDate;
        evidenceReason = `Documento comercial reciente (${recentDoc.type}) cargado el ${docDate.toISOString().split("T")[0]}`;
      } else if (recentCredit) {
        status = "active";
        const creditDate = new Date(recentCredit.startDate || recentCredit.createdAt || referenceDate);
        if (creditDate > lastValidActivityAt) lastValidActivityAt = creditDate;
        evidenceReason = `Crédito reciente iniciado el ${creditDate.toISOString().split("T")[0]}`;
      } else if (isRecentCreation) {
        status = "active";
        const clientCreatedDate = new Date(client.createdAt || referenceDate);
        lastValidActivityAt = clientCreatedDate;
        evidenceReason = `Cliente creado recientemente en plataforma el ${clientCreatedDate.toISOString().split("T")[0]}`;
      } else {
        // ¿Tiene créditos activos pero antiguos (> inactivityDays)?
        const hasOlderActiveCredit = clientCreds.some((c) => c.status === "active" || c.status === "disbursed");
        if (hasOlderActiveCredit) {
          status = "legacy_unverified";
          evidenceReason =
            `Posee crédito activo pero originado hace más de ${inactivityDays} días sin evidencia de seguimiento reciente (estado neutral legacy_unverified)`;
        } else {
          status = "legacy_unverified";
          evidenceReason = `Cliente previo a la ventana de ${inactivityDays} días sin interacción comercial comprobable`;
        }
      }

      // Fechas de vigencia de la relación si es active
      const activeUntil =
        status === "active"
          ? new Date(lastValidActivityAt.getTime() + inactivityDays * 24 * 60 * 60 * 1000)
          : null;
      const dormantUntil =

        status === "active"
          ? new Date(lastValidActivityAt.getTime() + 120 * 24 * 60 * 60 * 1000)
          : null;

      // Crear registro de relación comercial de forma segura
      await this.storage.createCommercialRelationship({
        tenantId: client.tenantId || null,
        clientId: client.id,
        brokerId: client.brokerId,
        status,
        lastValidActivityAt,
        lastActivityType: status === "active" ? "system_backfill_evidence" : null,
        lastActivitySummary: evidenceReason,
        activeUntil,
        dormantUntil,
        notes: `Migración inicial Fase 2: ${evidenceReason}`,
      });

      if (status === "active") {
        summary.assignedActive++;
      } else {
        summary.assignedLegacyUnverified++;
      }
      summary.newRelationshipsCreated++;

      summary.clientDetails.push({
        clientId: client.id,
        clientName: client.businessName || `${client.firstName || ""} ${client.lastName || ""}`.trim() || "Sin Nombre",
        brokerId: client.brokerId,
        assignedStatus: status,
        evidenceReason,
        lastValidActivityAt,
        isNew: true,
      });
    }

    // 2. Siembra idempotente de las Reglas de Operación (v1.0.0)
    const existingRules = await this.storage.getOperationalRulesVersion(INITIAL_OPERATIONAL_RULES_V1.version);
    if (existingRules) {
      summary.rulesVersionAlreadyExisted = true;
    } else {
      await this.storage.createOperationalRulesVersion(INITIAL_OPERATIONAL_RULES_V1);
      summary.rulesVersionSeeded = true;
    }

    return summary;
  }
}

export class DrizzleCommercialBackfillStorage implements ICommercialBackfillStorage {
  constructor(private db: any) {}

  async getClients(): Promise<Client[]> {
    return await this.db.select().from(clients);
  }

  async getCredits(): Promise<Credit[]> {
    return await this.db.select().from(credits);
  }

  async getDocuments(): Promise<Document[]> {
    return await this.db.select().from(documents);
  }

  async getCreditSubmissionRequests(): Promise<CreditSubmissionRequest[]> {
    return await this.db.select().from(creditSubmissionRequests);
  }

  async getExistingRelationships(): Promise<ClientCommercialRelationship[]> {
    return await this.db.select().from(clientCommercialRelationships);
  }

  async createCommercialRelationship(
    data: InsertClientCommercialRelationship
  ): Promise<ClientCommercialRelationship> {
    const id = randomUUID();
    const [created] = await this.db
      .insert(clientCommercialRelationships)
      .values({ ...data, id, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    return created;
  }

  async getOperationalRulesVersion(version: string): Promise<OperationalRulesVersion | undefined> {
    const [found] = await this.db
      .select()
      .from(operationalRulesVersions)
      .where(eq(operationalRulesVersions.version, version));
    return found;
  }

  async createOperationalRulesVersion(
    data: InsertOperationalRulesVersion
  ): Promise<OperationalRulesVersion> {
    const id = randomUUID();
    const [created] = await this.db
      .insert(operationalRulesVersions)
      .values({ ...data, id, createdAt: new Date() })
      .returning();
    return created;
  }

  async createAuditLog(data: any): Promise<any> {
    const id = randomUUID();
    const [created] = await this.db
      .insert(commercialAuditLogs)
      .values({ ...data, id, createdAt: new Date() })
      .returning();
    return created;
  }
}

