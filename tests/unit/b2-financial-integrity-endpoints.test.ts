// @ts-ignore
import request from "supertest";
import express from "express";
import { storage } from "../../server/storage";
import {
  calculateAndPersistCascadingCommission,
  resolveOfferVersionCommissionRates,
  MissingCommissionRateError,
  MissingOfferVersionError,
  UnconfirmedDispersalAmountError,
  UnauthorizedDistributionError,
  ImmutableCommercialSnapshotError,
  consolidateCommercialProposalSnapshot,
} from "../../server/commissionService";
import { registerRoutes, createCascadingCommissionRecord } from "../../server/routes";
import { randomUUID } from "crypto";

describe("Fase 2B.1B — Cierre de Integridad Financiera y Eliminación de Rutas No Canónicas", () => {
  let app: express.Express;
  let currentAuthUser: any = null;

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    // Mock session auth middleware
    app.use((req: any, _res, next) => {
      if (currentAuthUser) {
        req.isAuthenticated = () => true;
        req.user = { claims: { sub: currentAuthUser.id } };
        req.tenantContext = {
          tenantId: currentAuthUser.tenantId || "default-tenant",
          membership: {
            role: currentAuthUser.role === "super_admin" || currentAuthUser.role === "admin" ? "owner" : "member",
            canOriginate: true,
          },
        };
      } else {
        req.isAuthenticated = () => false;
      }
      next();
    });

    await registerRoutes(app);
  });

  beforeEach(() => {
    currentAuthUser = null;
  });

  describe("ASTRA-02: limited Admin cannot mutate financial proposals without permissions", () => {
    it("rejects proposal write, institution response and file upload for Admin with view-only permissions", async () => {
      const limited = await storage.createUser({
        email: `admin-no-approval-${randomUUID()}@example.test`,
        role: "admin", firstName: "Admin", lastName: "Limitado", isActive: true,
        permissions: { modules: ["dashboard", "creditos"], actions: ["view"], scope: "global" },
      } as any);
      const broker = await storage.createUser({
        email: `broker-limited-target-${randomUUID()}@example.test`,
        role: "broker", firstName: "Broker", lastName: "Prueba", isActive: true,
      } as any);
      const client = await storage.createClient({
        brokerId: broker.id, type: "persona_moral", businessName: "Cliente Seguro",
      } as any);
      const institution = await storage.createFinancialInstitution({
        name: `Financiera RBAC ${randomUUID()}`, isActive: true,
      } as any);
      const submission = await storage.createCreditSubmissionRequest({
        clientId: client.id, brokerId: broker.id, requestedAmount: "100000.00",
      } as any);
      const target = await storage.createCreditSubmissionTarget({
        requestId: submission.id, financialInstitutionId: institution.id, status: "sent",
      } as any);
      currentAuthUser = limited;
      const original = await storage.getCreditSubmissionTarget(target.id);
      const proposal = { approvedAmount: 50000, interestRate: 12, term: 12 };
      expect((await request(app).post(`/api/credit-submission-targets/${target.id}/institution-proposal`).send(proposal)).status).toBe(403);
      expect((await request(app).patch(`/api/credit-submission-targets/${target.id}/mark-institution-response`).send({ approved: true, proposal })).status).toBe(403);
      expect((await request(app).post(`/api/credit-submission-targets/${target.id}/upload-proposal`)
        .attach("proposalDocument", Buffer.from("test"), "test.txt")).status).toBe(403);
      expect((await request(app).patch(`/api/credit-submission-targets/${target.id}/approve`).send({})).status).toBe(403);
      expect((await request(app).patch(`/api/credit-submission-targets/${target.id}/reject`).send({})).status).toBe(403);
      expect((await request(app).patch(`/api/credit-submission-targets/${target.id}/return-to-broker`).send({})).status).toBe(403);
      expect((await request(app).patch(`/api/credit-submission-targets/${target.id}/mark-sent`).send({})).status).toBe(403);
      const after = await storage.getCreditSubmissionTarget(target.id);
      expect(after?.status).toBe(original?.status);
      expect(after?.institutionProposal).toEqual(original?.institutionProposal);
      expect(after?.proposalDocument).toBe(original?.proposalDocument);
    });
  });

  describe("SEC-P0: document upload and reassignment are client-scoped", () => {
    it("denies file attachment to a foreign client and cross-client reassignment", async () => {
      const brokerA = await storage.createUser({
        email: `doc-owner-${randomUUID()}@example.test`, role: "broker", isActive: true,
      } as any);
      const brokerB = await storage.createUser({
        email: `doc-outsider-${randomUUID()}@example.test`, role: "broker", isActive: true,
      } as any);
      const clientA = await storage.createClient({
        type: "persona_moral", brokerId: brokerA.id, businessName: "Empresa protegida A",
      } as any);
      const clientB = await storage.createClient({
        type: "persona_moral", brokerId: brokerB.id, businessName: "Empresa protegida B",
      } as any);

      currentAuthUser = brokerB;
      const foreignUpload = await request(app).post("/api/documents")
        .field("clientId", clientA.id).field("type", "ine")
        .attach("file", Buffer.from("%PDF-1.4 prueba"), {
          filename: "documento.pdf", contentType: "application/pdf",
        });
      expect(foreignUpload.status).toBe(403);
      expect(foreignUpload.body.code).toBe("DOCUMENT_CLIENT_NOT_AUTHORIZED");
      expect(await storage.getDocuments({ clientId: clientA.id })).toHaveLength(0);

      const clientC = await storage.createClient({
        type: "persona_moral", brokerId: brokerA.id, businessName: "Empresa propia C",
      } as any);
      const creditC = await storage.createCredit({
        brokerId: brokerA.id, clientId: clientC.id, amount: "120000.00", status: "draft",
      } as any);
      currentAuthUser = brokerA;
      const mismatched = await request(app).post("/api/documents")
        .field("clientId", clientA.id).field("creditId", creditC.id).field("type", "rfc")
        .attach("file", Buffer.from("%PDF-1.4 cliente distinto"), {
          filename: "mismatch.pdf", contentType: "application/pdf",
        });
      expect(mismatched.status).toBe(409);
      expect(mismatched.body.code).toBe("DOCUMENT_CLIENT_CREDIT_MISMATCH");
      expect(await storage.getDocuments({ clientId: clientA.id })).toHaveLength(0);

      const original = await storage.createDocument({
        brokerId: brokerA.id, uploadedBy: brokerA.id, clientId: clientA.id,
        type: "ine", fileName: "protegido.pdf",
        filePath: "/uploads/fake-original.pdf",
      } as any);
      currentAuthUser = brokerA;
      const retarget = await request(app).put(`/api/documents/${original.id}`)
        .send({ clientId: clientB.id, type: "rfc" });
      expect(retarget.status).toBe(403);
      expect(retarget.body.code).toBe("DOCUMENT_CLIENT_NOT_AUTHORIZED");
      const after = await storage.getDocument(original.id);
      expect(after?.clientId).toBe(clientA.id);
      expect(after?.type).toBe("ine");
    });
  });

  describe("SEC-P0: Master read access cannot mutate Broker documents", () => {
    it("rejects modification and deletion of subordinate's file", async () => {
      const master = await storage.createUser({
        email: `doc-master-${randomUUID()}@example.test`,
        role: "master_broker", isActive: true,
      } as any);
      const broker = await storage.createUser({
        email: `doc-subordinate-${randomUUID()}@example.test`,
        role: "broker", masterBrokerId: master.id, isActive: true,
      } as any);
      const document = await storage.createDocument({
        brokerId: broker.id, uploadedBy: broker.id, type: "ine",
        fileName: "subordinado.pdf", filePath: "/uploads/subordinado-no-real.pdf",
      } as any);
      currentAuthUser = master;
      const update = await request(app).put(`/api/documents/${document.id}`)
        .send({ type: "rfc" });
      expect(update.status).toBe(403);
      const deletion = await request(app).delete(`/api/documents/${document.id}`);
      expect(deletion.status).toBe(403);
      const unchanged = await storage.getDocument(document.id);
      expect(unchanged?.type).toBe("ine");
      expect(unchanged?.brokerId).toBe(broker.id);
    });
  });

  describe("SEC-P0: identity/lineage cannot be mass-assigned via edit routes", () => {
    it("does not move a client or a credit to another Broker/client/tenant", async () => {
      const admin = await storage.createUser({
        email: `immutable-owner-admin-${randomUUID()}@example.test`,
        role: "super_admin", isActive: true,
      } as any);
      const brokerA = await storage.createUser({
        email: `immutable-broker-a-${randomUUID()}@example.test`,
        role: "broker", isActive: true,
      } as any);
      const brokerB = await storage.createUser({
        email: `immutable-broker-b-${randomUUID()}@example.test`,
        role: "broker", isActive: true,
      } as any);
      const clientA = await storage.createClient({
        type: "persona_moral", brokerId: brokerA.id, businessName: "Cliente irreversible A",
      } as any);
      const clientB = await storage.createClient({
        type: "persona_moral", brokerId: brokerB.id, businessName: "Cliente irreversible B",
      } as any);
      const credit = await storage.createCredit({
        brokerId: brokerA.id, clientId: clientA.id,
        amount: "200000.00", status: "draft",
      } as any);
      currentAuthUser = admin;

      const changedClient = await request(app).put(`/api/clients/${clientA.id}`)
        .send({ brokerId: brokerB.id, businessName: "Cliente retitulado" });
      expect(changedClient.status).toBe(409);
      expect(changedClient.body.code).toBe("CLIENT_OWNERSHIP_IMMUTABLE");
      const changedCredit = await request(app).put(`/api/credits/${credit.id}`)
        .send({ clientId: clientB.id, brokerId: brokerB.id, amount: "500000.00" });
      expect(changedCredit.status).toBe(409);
      expect(changedCredit.body.code).toBe("CREDIT_OWNERSHIP_IMMUTABLE");

      const alteredLineage = await request(app).put(`/api/credits/${credit.id}`)
        .send({ linkedSubmissionId: `forged-${randomUUID()}` });
      expect(alteredLineage.status).toBe(409);
      expect(alteredLineage.body.code).toBe("CREDIT_OWNERSHIP_IMMUTABLE");

      const savedClient = await storage.getClient(clientA.id);
      const savedCredit = await storage.getCredit(credit.id);
      expect(savedClient?.brokerId).toBe(brokerA.id);
      expect(savedClient?.businessName).toBe("Cliente irreversible A");
      expect(savedCredit?.clientId).toBe(clientA.id);
      expect(savedCredit?.brokerId).toBe(brokerA.id);
      expect(savedCredit?.amount).toBe("200000.00");

      // Generic editing of non-identity profile fields remains available.
      const allowedProfile = await request(app).put(`/api/clients/${clientA.id}`)
        .send({ businessName: "Cliente A actualizado" });
      expect(allowedProfile.status).toBe(200);
      expect(allowedProfile.body.brokerId).toBe(brokerA.id);
    });
  });

  describe("ASTRA-01: canalización de oportunidades por propietario histórico", () => {
    it("rechaza a otro Broker y al nuevo Master sin alterar targets; conserva el acceso administrativo", async () => {
      const brokerA = await storage.createUser({
        email: `channel-owner-${randomUUID()}@example.test`,
        role: "broker", isActive: true, firstName: "Broker", lastName: "Origen",
      } as any);
      const brokerB = await storage.createUser({
        email: `channel-other-${randomUUID()}@example.test`,
        role: "broker", isActive: true, firstName: "Broker", lastName: "Ajeno",
      } as any);
      const masterOld = await storage.createUser({
        email: `channel-old-master-${randomUUID()}@example.test`,
        role: "master_broker", isActive: true, firstName: "Master", lastName: "Histórico",
      } as any);
      const masterNew = await storage.createUser({
        email: `channel-new-master-${randomUUID()}@example.test`,
        role: "master_broker", isActive: true, firstName: "Master", lastName: "Nuevo",
      } as any);
      const admin = await storage.createUser({
        email: `channel-admin-${randomUUID()}@example.test`,
        role: "super_admin", isActive: true, firstName: "Super", lastName: "Admin",
      } as any);
      const client = await storage.createClient({
        brokerId: brokerA.id, type: "persona_moral", businessName: "Oportunidad de Origen",
      } as any);
      const lender = await storage.createFinancialInstitution({
        name: `Financiera Canalización ${randomUUID()}`, isActive: true,
      } as any);
      const submission = await storage.createCreditSubmissionRequest({
        clientId: client.id, brokerId: brokerA.id, originMasterBrokerId: masterOld.id,
        requestedAmount: "100000.00", status: "approved",
      } as any);
      await storage.updateUser(brokerA.id, { masterBrokerId: masterNew.id } as any);

      currentAuthUser = brokerB;
      const outsider = await request(app).post(`/api/credit-submissions/${submission.id}/targets`)
        .send({ financialInstitutionIds: [lender.id] });
      expect(outsider.status).toBe(403);
      expect(outsider.body.code).toBe("SUBMISSION_NOT_AUTHORIZED");

      currentAuthUser = masterNew;
      const movedNetwork = await request(app).post(`/api/credit-submissions/${submission.id}/targets`)
        .send({ financialInstitutionIds: [lender.id] });
      expect(movedNetwork.status).toBe(403);
      expect(movedNetwork.body.code).toBe("SUBMISSION_NOT_AUTHORIZED");

      expect(await storage.getCreditSubmissionTargets({ requestId: submission.id })).toHaveLength(0);

      // Platform-owned direct origination is exempt from Broker formalization;
      // verify legitimate administrator channeling remains available.
      const platformSubmission = await storage.createCreditSubmissionRequest({
        clientId: client.id, brokerId: admin.id, requestedAmount: "100000.00", status: "approved",
      } as any);
      currentAuthUser = admin;
      const allowed = await request(app).post(`/api/credit-submissions/${platformSubmission.id}/targets`)
        .send({ financialInstitutionIds: [lender.id] });
      expect(allowed.status).toBe(201);
      const targets = await storage.getCreditSubmissionTargets({ requestId: platformSubmission.id });
      expect(targets).toHaveLength(1);
      expect(targets[0].financialInstitutionId).toBe(lender.id);
      expect(await storage.getCreditSubmissionTargets({ requestId: submission.id })).toHaveLength(0);
    });
  });

  describe("LEG-10: no institution disclosure without verified CLIENT consent", () => {
    it("fails closed for mark-sent and institution PDF, ignoring operator-supplied consent", async () => {
      const admin = await storage.createUser({
        email: `leg10-admin-${randomUUID()}@example.test`,
        role: "super_admin", isActive: true,
      } as any);
      const broker = await storage.createUser({
        email: `leg10-broker-${randomUUID()}@example.test`,
        role: "broker", isActive: true,
      } as any);
      const client = await storage.createClient({
        brokerId: broker.id, type: "persona_moral",
        businessName: "Consentimiento del cliente pendiente",
      } as any);
      const institution = await storage.createFinancialInstitution({
        name: `Financiera LEG10 ${randomUUID()}`, isActive: true,
      } as any);
      const submission = await storage.createCreditSubmissionRequest({
        clientId: client.id, brokerId: broker.id,
        requestedAmount: "100000.00", status: "approved",
      } as any);
      const target = await storage.createCreditSubmissionTarget({
        requestId: submission.id, financialInstitutionId: institution.id,
        status: "approved", isWinner: false,
      } as any);

      currentAuthUser = admin;
      const forged = await request(app)
        .patch(`/api/credit-submission-targets/${target.id}/mark-sent`)
        .send({ consentAccepted: true, consentSigner: client.id, signedByBroker: true });
      expect(forged.status).toBe(409);
      expect(forged.body.code).toBe("CLIENT_CONSENT_REQUIRED");

      const pdf = await request(app)
        .post(`/api/credit-submission-targets/${target.id}/generate-pdf`)
        .send({ clientConsent: true, consentDocumentId: "fictional" });
      expect(pdf.status).toBe(409);
      expect(pdf.body.code).toBe("CLIENT_CONSENT_REQUIRED");
      expect(String(pdf.headers["content-type"])).toContain("application/json");
      expect(pdf.headers["content-disposition"]).toBeUndefined();

      // Neither route can mutate the target or pretend transmission occurred.
      const stored = await storage.getCreditSubmissionTarget(target.id);
      const parent = await storage.getCreditSubmissionRequest(submission.id);
      expect(stored?.status).toBe("approved");
      expect(stored?.creditId).toBeNull();
      expect(parent?.status).toBe("approved");
    });
  });

  describe("OPE-P0: selected target cannot be administratively reopened", () => {
    it("rejects approving, rejecting, returning and resending a winner; siblings stay reviewable", async () => {
      const admin = await storage.createUser({
        email: `frozen-review-admin-${randomUUID()}@example.test`,
        role: "super_admin", isActive: true,
      } as any);
      const broker = await storage.createUser({
        email: `frozen-review-broker-${randomUUID()}@example.test`,
        role: "broker", isActive: true,
      } as any);
      const client = await storage.createClient({
        brokerId: broker.id, type: "persona_moral", businessName: "Historial Protegido",
      } as any);
      const instA = await storage.createFinancialInstitution({
        name: `Financiera Estado A ${randomUUID()}`, isActive: true,
      } as any);
      const instB = await storage.createFinancialInstitution({
        name: `Financiera Estado B ${randomUUID()}`, isActive: true,
      } as any);
      const submission = await storage.createCreditSubmissionRequest({
        clientId: client.id, brokerId: broker.id, requestedAmount: "120000.00",
        status: "in_progress",
      } as any);
      const winner = await storage.createCreditSubmissionTarget({
        requestId: submission.id, financialInstitutionId: instA.id,
        status: "selected_winner", isWinner: true, creditId: "historical-credit-A",
      } as any);
      const sibling = await storage.createCreditSubmissionTarget({
        requestId: submission.id, financialInstitutionId: instB.id,
        status: "pending_admin",
      } as any);
      currentAuthUser = admin;
      for(const path of ["approve", "reject", "return-to-broker", "mark-sent"]) {
        const result = await request(app)
          .patch(`/api/credit-submission-targets/${winner.id}/${path}`).send({});
        expect(result.status).toBe(409);
        expect(result.body.code).toBe("TARGET_ALREADY_SELECTED");
      }
      const frozen = await storage.getCreditSubmissionTarget(winner.id);
      expect(frozen?.status).toBe("selected_winner");
      expect(frozen?.creditId).toBe("historical-credit-A");
      expect(frozen?.isWinner).toBe(true);
      expect((await storage.getCreditSubmissionRequest(submission.id))?.status).toBe("in_progress");
      // Different institution/target remains independently actionable.
      const valid = await request(app)
        .patch(`/api/credit-submission-targets/${sibling.id}/approve`).send({});
      expect(valid.status).toBe(200);
      expect((await storage.getCreditSubmissionTarget(sibling.id))?.status).toBe("approved");
    });
  });

  describe("FIN-P0: institution proposal keeps canonical offer/version", () => {
    it("preserves explicit published version and derives its rates on the server", async () => {
      const admin = await storage.createUser({
        email: `offer-lineage-admin-${randomUUID()}@example.test`, role: "super_admin",
        firstName: "Admin", lastName: "Financiero", isActive: true,
      } as any);
      const broker = await storage.createUser({
        email: `offer-lineage-broker-${randomUUID()}@example.test`, role: "broker",
        firstName: "Broker", lastName: "Linea", isActive: true,
      } as any);
      const inst = await storage.createFinancialInstitution({
        name: `Financiera Oferta Identificada ${randomUUID()}`, isActive: true,
      } as any);
      const otherInstitution = await storage.createFinancialInstitution({
        name: `Financiera Ajena ${randomUUID()}`, isActive: true,
      } as any);
      const offer = await storage.createInstitutionProduct({
        institutionId: inst.id, name: "PyME Lineage", customName: "PyME Lineage",
        productType: "credito_simple", isActive: true,
      } as any, {
        versionNumber: 1,
        conditions: {
          minAmount: 10000, maxAmount: 250000, minTermMonths: 6, maxTermMonths: 48,
          commissionRates: {
            financiera: { apertura: 5 }, masterBroker: { apertura: 1 }, broker: { apertura: 2 },
          },
        },
        requirements: { targetProfiles: ["persona_moral"] },
        changeReason: "Version inicial para trazabilidad",
      } as any);
      const [draft] = await storage.getInstitutionProductVersions(offer.id);
      await storage.publishInstitutionProductVersion(offer.id, draft.id, {
        publishedBy: admin.id, changeReason: "Publicacion vigente para prueba",
      });
      const client = await storage.createClient({
        brokerId: broker.id, type: "persona_moral", businessName: "Cliente Lineage",
      } as any);
      const sub = await storage.createCreditSubmissionRequest({
        clientId: client.id, brokerId: broker.id, requestedAmount: "100000.00",
      } as any);
      const target = await storage.createCreditSubmissionTarget({
        requestId: sub.id, financialInstitutionId: inst.id, status: "sent",
      } as any);
      const wrongInstitutionTarget = await storage.createCreditSubmissionTarget({
        requestId: sub.id, financialInstitutionId: otherInstitution.id, status: "sent",
      } as any);
      const proposal = {
        approvedAmount: 90000, interestRate: 12, term: 24,
        institutionProductId: offer.id, versionNumber: 1,
      };
      currentAuthUser = admin;
      const wrong = await request(app)
        .post(`/api/credit-submission-targets/${wrongInstitutionTarget.id}/institution-proposal`)
        .send(proposal);
      expect(wrong.status).toBe(409);
      expect(wrong.body.code).toBe("OFFER_VERSION_INSTITUTION_MISMATCH");

      const incomplete = await request(app)
        .post(`/api/credit-submission-targets/${target.id}/institution-proposal`)
        .send({ ...proposal, versionNumber: undefined });
      expect(incomplete.status).toBe(409);
      expect(incomplete.body.code).toBe("OFFER_VERSION_IDENTITY_INCOMPLETE");

      const noVersion = await request(app)
        .post(`/api/credit-submission-targets/${target.id}/institution-proposal`)
        .send({ approvedAmount: 90000, interestRate: 12, term: 24 });
      expect(noVersion.status).toBe(409);
      expect(noVersion.body.code).toBe("OFFER_VERSION_REQUIRED_FOR_PUBLISHED_INSTITUTION");
      expect((await storage.getCreditSubmissionTarget(target.id))?.institutionProposal).toBeFalsy();

      const noVersionViaResponse = await request(app)
        .patch(`/api/credit-submission-targets/${target.id}/mark-institution-response`)
        .send({ approved: true, proposal: { approvedAmount: 90000, interestRate: 12, term: 24 } });
      expect(noVersionViaResponse.status).toBe(409);
      expect(noVersionViaResponse.body.code).toBe("OFFER_VERSION_REQUIRED_FOR_PUBLISHED_INSTITUTION");

      const noProposalApproval = await request(app)
        .patch(`/api/credit-submission-targets/${target.id}/mark-institution-response`)
        .send({ approved: true });
      expect(noProposalApproval.status).toBe(409);
      expect(noProposalApproval.body.code).toBe("INSTITUTION_PROPOSAL_REQUIRED");

      const saved = await request(app)
        .post(`/api/credit-submission-targets/${target.id}/institution-proposal`)
        .send({ ...proposal, commissionRates: { broker: { apertura: 99 } } });
      expect(saved.status).toBe(200);
      const persisted = await storage.getCreditSubmissionTarget(target.id);
      const snapshot = persisted?.institutionProposal as any;
      expect(snapshot.institutionProductId).toBe(offer.id);
      expect(snapshot.versionNumber).toBe(1);
      expect(snapshot.commissionRates.broker.apertura).toBe(2);
      expect(snapshot.commissionRates.financiera.apertura).toBe(5);

      const limitedAdmin = await storage.createUser({
        email: `offer-lineage-limited-${randomUUID()}@example.test`,
        role: "admin", firstName: "Admin", lastName: "Limitado", isActive: true,
      } as any);
      currentAuthUser = limitedAdmin;
      const redacted = await request(app)
        .post(`/api/credit-submission-targets/${target.id}/institution-proposal`)
        .send(proposal);
      expect(redacted.status).toBe(200);
      expect(redacted.body.institutionProposal.commissionRates).toBeUndefined();
      currentAuthUser = admin;

      const erase = await request(app)
        .post(`/api/credit-submission-targets/${target.id}/institution-proposal`)
        .send({ approvedAmount: 90000, interestRate: 12, term: 24 });
      expect(erase.status).toBe(409);
      expect(erase.body.code).toBe("OFFER_VERSION_IDENTITY_MISMATCH");
    });
  });

  describe("ASTRA-01/02: submission authorization and financial DTO isolation", () => {
    it("denies Broker B access to Broker A's client submissions and proposal document", async () => {
      const brokerA = await storage.createUser({
        email: `broker-a-astra-${randomUUID()}@example.test`,
        firstName: "Broker", lastName: "A", role: "broker", isActive: true,
      } as any);
      const brokerB = await storage.createUser({
        email: `broker-b-astra-${randomUUID()}@example.test`,
        firstName: "Broker", lastName: "B", role: "broker", isActive: true,
      } as any);
      const client = await storage.createClient({
        brokerId: brokerA.id, type: "persona_moral", businessName: "Cliente Privado Astra",
      } as any);
      const institution = await storage.createFinancialInstitution({
        name: `Financiera Confidencial ${randomUUID()}`,
        commissionRate: "6.0",
        commissionRates: { financiera: { apertura: 6 }, broker: { apertura: 2 },
          platformNet: 3.5 },
        notes: "interno-no-exponer",
      } as any);
      const submission = await storage.createCreditSubmissionRequest({
        clientId: client.id, brokerId: brokerA.id,
        requestedAmount: "100000.00", status: "in_progress",
      } as any);
      const target = await storage.createCreditSubmissionTarget({
        requestId: submission.id, financialInstitutionId: institution.id,
        status: "institution_approved", proposalDocument: "package.json",
        institutionProposal: { approvedAmount: 90000, interestRate: 12, term: 24,
          commissionRates: { financiera: { apertura: 6 }, broker: { apertura: 2 } } },
      } as any);

      currentAuthUser = brokerB;
      expect((await request(app).get(`/api/credit-submissions/client/${client.id}`)).status).toBe(403);
      expect((await request(app).get(`/api/credit-submissions/${submission.id}`)).status).toBe(403);
      expect((await request(app).get(`/api/credit-submission-requests/${submission.id}`)).status).toBe(403);
      expect((await request(app).get(`/api/credit-submission-targets/${target.id}/proposal-document`)).status).toBe(403);
      expect((await request(app).post(`/api/credit-submission-targets/${target.id}/generate-pdf`)).status).toBe(403);
      expect((await request(app).patch(`/api/credit-submission-targets/${target.id}/select-winner`).send({})).status).toBe(403);

      currentAuthUser = brokerA;
      const own = await request(app).get(`/api/credit-submissions/client/${client.id}`);
      expect(own.status).toBe(200);
      expect(own.body).toHaveLength(1);
      expect(own.body[0].broker?.password).toBeUndefined();
      expect(own.body[0].targets[0].institution?.commissionRates).toBeUndefined();
      expect(own.body[0].targets[0].institution?.notes).toBeUndefined();
      expect(own.body[0].targets[0].institutionProposal?.commissionRates).toBeUndefined();
      expect((await request(app).get(`/api/credit-submission-targets/${target.id}/proposal-document`)).status).toBe(200);
      // LEG-10: ownership allows internal reading, but not exporting a
      // client-data package for the institution without the client's consent.
      const ownPdf = await request(app).post(`/api/credit-submission-targets/${target.id}/generate-pdf`);
      expect(ownPdf.status).toBe(409);
      expect(ownPdf.body.code).toBe("CLIENT_CONSENT_REQUIRED");
      expect(ownPdf.headers["content-type"]).toContain("application/json");
      expect(ownPdf.headers["content-disposition"]).toBeUndefined();

      const my = await request(app).get("/api/credit-submission-requests/my-submissions");
      expect(my.status).toBe(200);
      const mine = my.body.find((x: any) => x.id === submission.id);
      expect(mine).toBeDefined();
      expect(mine.broker?.password).toBeUndefined();
      expect(mine.targets[0].institution?.commissionRates).toBeUndefined();
    });

    it("preserves historical Master A access and excludes new Master B", async () => {
      const masterA = await storage.createUser({
        email: `master-a-astra-${randomUUID()}@example.test`,
        role: "master_broker", firstName: "Master", lastName: "A",
      } as any);
      const masterB = await storage.createUser({
        email: `master-b-astra-${randomUUID()}@example.test`,
        role: "master_broker", firstName: "Master", lastName: "B",
      } as any);
      const broker = await storage.createUser({
        email: `broker-m-astra-${randomUUID()}@example.test`,
        role: "broker", masterBrokerId: masterA.id,
      } as any);
      const client = await storage.createClient({
        brokerId: broker.id, type: "persona_moral", businessName: "Historico",
      } as any);
      const inst = await storage.createFinancialInstitution({
        name: `Financial Master Lineage ${randomUUID()}`,
      } as any);
      const sub = await storage.createCreditSubmissionRequest({
        clientId: client.id, brokerId: broker.id,
        originMasterBrokerId: masterA.id, requestedAmount: "100000.00",
      } as any);
      const target = await storage.createCreditSubmissionTarget({
        requestId: sub.id, financialInstitutionId: inst.id, proposalDocument: "package.json",
      } as any);
      await storage.updateUser(broker.id, { masterBrokerId: masterB.id });
      currentAuthUser = masterB;
      expect((await request(app).get(`/api/credit-submissions/${sub.id}`)).status).toBe(403);
      expect((await request(app).get(`/api/credit-submission-targets/${target.id}/proposal-document`)).status).toBe(403);
      currentAuthUser = masterA;
      expect((await request(app).get(`/api/credit-submissions/${sub.id}`)).status).toBe(200);
      expect((await request(app).get(`/api/credit-submission-targets/${target.id}/proposal-document`)).status).toBe(200);
    });

    it("denies winner selection to finance-only Admin without credit edit permission", async () => {
      const admin = await storage.createUser({
        email: `limited-winner-${randomUUID()}@example.test`,
        role: "admin", isActive: true, status: "active",
        permissions: { modules: ["financieras"], actions: ["view"], scope: "global" },
      } as any);
      currentAuthUser = admin;
      const res = await request(app).patch("/api/credit-submission-targets/nonexistent/select-winner").send({});
      expect(res.status).toBe(403);
    });

    it("Admin without financiera.edit cannot change institutions; finance.view never reveals platform margins", async () => {
      const inst = await storage.createFinancialInstitution({
        name: `Financial Restricted ${randomUUID()}`, isActive: true,
        commissionRates: {
          financiera: { apertura: 5 }, broker: { apertura: 2 },
          platformNet: 3, channels: { directBroker: { platformGrossMargin: 3 } },
        },
        notes: "Secret internal",
      } as any);
      const restricted = await storage.createUser({
        email: `restricted-astra-${randomUUID()}@example.test`,
        role: "admin", permissions: {modules:["financieras"], actions:["view"], scope:"global"},
      } as any);
      currentAuthUser = restricted;
      const allowed = await request(app).get(`/api/financial-institutions/${inst.id}`);
      expect(allowed.status).toBe(200);
      expect(allowed.body.commissionRates?.platformNet).toBeUndefined();
      expect(allowed.body.commissionRates?.channels).toBeUndefined();
      expect(allowed.body.notes).toBeUndefined();
      // A module view grant is not an implicit grant to see credit files.
      expect((await request(app).get("/api/credit-submissions")).status).toBe(403);
      expect((await request(app).get("/api/credit-submission-requests/my-submissions")).status).toBe(403);
      expect((await request(app).patch(`/api/financial-institutions/${inst.id}`)
        .send({ description: "Unauthorized edit" })).status).toBe(403);
      expect((await request(app).patch(`/api/financial-institutions/${inst.id}/toggle-status`)
        .send({})).status).toBe(403);
    });

    it("Admin with edit rights still cannot alter Super Admin-only commissions", async () => {
      const inst = await storage.createFinancialInstitution({
        name: `Financial Restricted Economics ${randomUUID()}`,
        commissionRate: "4.0",
      } as any);
      const admin = await storage.createUser({
        email: `economic-admin-astra-${randomUUID()}@example.test`,
        role: "admin", permissions: {modules:["financieras"], actions:["view","edit"], scope:"global"},
      } as any);
      currentAuthUser = admin;
      const res = await request(app).patch(`/api/financial-institutions/${inst.id}`)
        .send({ commissionRate: "7.0" });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FINANCIAL_INTERNAL_RATE_SUPER_ADMIN_REQUIRED");
      expect((await storage.getFinancialInstitution(inst.id))?.commissionRate).toBe("4.0");
    });
  });

  describe("COM-28: generic product edits must not rewrite published offer economics", () => {
    it("forbids commission and matching modifications outside the draft/publish flow", async () => {
      const admin = await storage.createUser({
        email: `offer-bypass-${randomUUID()}@example.test`,
        firstName: "Admin", lastName: "Version",
        role: "super_admin", isActive: true, status: "active",
      } as any);
      currentAuthUser = admin;
      const res = await request(app)
        .put("/api/institution-products/some-offer")
        .send({ configuration: { commissionRates: { financiera: { apertura: 10 } } } });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("OFFER_VERSIONED_EDIT_REQUIRED");

      const forcedStatus = await request(app)
        .put("/api/institution-products/some-offer")
        .send({ status: "published" });
      expect(forcedStatus.status).toBe(409);
      expect(forcedStatus.body.code).toBe("OFFER_VERSIONED_EDIT_REQUIRED");
    });
  });

  describe("COM-28: institution defaults cannot bypass offer-level versions", () => {
    it("rejects financial commission edits when there is a published offer", async () => {
      const admin = await storage.createUser({
        email: `offer-rates-${randomUUID()}@example.test`,
        firstName: "Admin", lastName: "Offers",
        role: "super_admin", isActive: true, status: "active",
      } as any);
      const inst = await storage.createFinancialInstitution({
        name: `Offer Commission Guard ${randomUUID()}`,
        commissionRate: "4.0", isActive: true,
      } as any);
      currentAuthUser = admin;
      const offersSpy = jest.spyOn(storage,"getInstitutionProducts")
        .mockResolvedValue([{ id: "offer-versioned" }] as any);
      const versionsSpy = jest.spyOn(storage,"getInstitutionProductVersions")
        .mockResolvedValue([{ status: "published", versionNumber: 1 }] as any);
      const creditsSpy = jest.spyOn(storage,"getCredits").mockResolvedValue([]);
      try {
        const res = await request(app)
          .patch(`/api/financial-institutions/${inst.id}`)
          .send({ commissionRate: "5.0" });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe("OFFER_SCOPED_COMMISSION_VERSION_REQUIRED");
        const unchanged = await storage.getFinancialInstitution(inst.id);
        expect(unchanged?.commissionRate).toBe("4.0");
      } finally {
        offersSpy.mockRestore();
        versionsSpy.mockRestore();
        creditsSpy.mockRestore();
      }
    });

    it("allows legacy pre-publication drafts without globally revoking commercial acceptance", async () => {
      const admin = await storage.createUser({
        email: `offer-draft-${randomUUID()}@example.test`,
        firstName: "Admin", lastName: "Draft",
        role: "super_admin", isActive: true, status: "active",
      } as any);
      const inst = await storage.createFinancialInstitution({
        name: `Draft Rate ${randomUUID()}`,
        commissionRate: "4.0", isActive: true,
      } as any);
      currentAuthUser = admin;
      const offersSpy = jest.spyOn(storage,"getInstitutionProducts").mockResolvedValue([]);
      const creditsSpy = jest.spyOn(storage,"getCredits").mockResolvedValue([]);
      try {
        const res = await request(app)
          .patch(`/api/financial-institutions/${inst.id}`)
          .send({ commissionRate: "5.0" });
        expect(res.status).toBe(200);
        const updated = await storage.getFinancialInstitution(inst.id);
        expect(updated?.commissionRate).toBe("5.0");
      } finally {
        offersSpy.mockRestore();
        creditsSpy.mockRestore();
      }
    });
  });

  // =========================================================================
  // 1. REGLA 1 (COM-21): DESEMBOLSOS VERIFICABLES
  // =========================================================================
  describe("1. Desembolsos verificables (COM-21)", () => {
    it("Negativa: createCascadingCommissionRecord rechaza fallbacks a approvedAmount", async () => {
      const credit = await storage.createCredit({
        clientId: `client-${randomUUID().slice(0, 8)}`,
        brokerId: `broker-${randomUUID().slice(0, 8)}`,
        amount: "1000000.00",
        status: "approved",
      } as any);

      await expect(
        createCascadingCommissionRecord({
          creditId: credit.id,
          brokerId: credit.brokerId,
          approvedAmount: 1000000, // Solo approvedAmount, sin confirmedDisbursedAmount
          commissionType: "apertura",
        })
      ).rejects.toThrow(UnconfirmedDispersalAmountError);
    });

    it("Negativa: createCascadingCommissionRecord rechaza montos <= 0 o no confirmados", async () => {
      const credit = await storage.createCredit({
        clientId: `client-${randomUUID().slice(0, 8)}`,
        brokerId: `broker-${randomUUID().slice(0, 8)}`,
        amount: "1000000.00",
        status: "approved",
      } as any);

      await expect(
        createCascadingCommissionRecord({
          creditId: credit.id,
          brokerId: credit.brokerId,
          confirmedDisbursedAmount: 0,
          commissionType: "apertura",
        })
      ).rejects.toThrow(UnconfirmedDispersalAmountError);

      await expect(
        createCascadingCommissionRecord({
          creditId: credit.id,
          brokerId: credit.brokerId,
          confirmedDisbursedAmount: -500,
          commissionType: "apertura",
        })
      ).rejects.toThrow(UnconfirmedDispersalAmountError);
    });

    it("Seguridad: PUT /api/credits/:id con dispersión bloquea cálculo automático sobre montos declarados por frontend", async () => {
      const admin = await storage.createUser({
        email: `admin-put-${randomUUID()}@example.com`,
        firstName: "Admin",
        lastName: "Put",
        role: "admin",
        isActive: true,
        status: "active",
      } as any);
      currentAuthUser = admin;

      const credit = await storage.createCredit({
        clientId: `client-${randomUUID().slice(0, 8)}`,
        brokerId: admin.id,
        amount: "800000.00",
        status: "approved",
      } as any);

      // Frontend intenta disparar comisiones declarando confirmedDisbursedAmount
      const res = await request(app)
        .put(`/api/credits/${credit.id}`)
        .send({
          status: "disbursed",
          confirmedDisbursedAmount: 800000,
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("DISBURSEMENT_CONFIRMATION_REQUIRED");
      const unchanged = await storage.getCredit(credit.id);
      expect(unchanged?.status).toBe("approved");

      // Verificar que NO se crearon comisiones espurias sin evidencia real de core bancario
      const comms = await storage.getCommissions({ creditId: credit.id });
      expect(comms.length).toBe(0);
    });

    it("Seguridad: PUT no permite inyectar evidencia de dispersión confirmada en finalProposal", async () => {
      const admin = await storage.createUser({
        email: `admin-forged-${randomUUID()}@example.com`,
        firstName: "Admin", lastName: "Forged", role: "admin", isActive: true, status: "active",
      } as any);
      currentAuthUser = admin;
      const credit = await storage.createCredit({
        clientId: `client-${randomUUID().slice(0, 8)}`,
        brokerId: admin.id,
        amount: "100000.00",
        status: "approved",
      } as any);
      const forged = await request(app)
        .put(`/api/credits/${credit.id}`)
        .send({ finalProposal: {
          disbursementStatus: "confirmed",
          disbursementConfirmation: { confirmedAmount: 100000, status: "confirmed" },
        }});
      expect(forged.status).toBe(409);
      expect(forged.body.code).toBe("DISBURSEMENT_EVIDENCE_WRITE_FORBIDDEN");
      const unchanged = await storage.getCredit(credit.id);
      expect((unchanged?.finalProposal as any)?.disbursementStatus).not.toBe("confirmed");
    });

    it("Seguridad: mark-dispersed actualiza estado a dispersed pero bloquea comisiones sobre approvedAmount reportando dependencia FIN-13/14", async () => {
      const admin = await storage.createUser({
        email: `admin-disp-${randomUUID()}@example.com`,
        firstName: "Admin",
        lastName: "Disp",
        role: "admin",
        isActive: true,
        status: "active",
      } as any);
      currentAuthUser = admin;

      const broker = await storage.createUser({
        email: `broker-disp-${randomUUID()}@example.com`,
        firstName: "Broker",
        lastName: "Disp",
        role: "broker",
        isActive: true,
        status: "active",
      } as any);

      const client = await storage.createClient({
        brokerId: broker.id,
        type: "persona_moral",
        businessName: "Empresa Dispersión Test SA",
      } as any);

      const institution = await storage.createFinancialInstitution({
        name: `Financiera Dispersión-${randomUUID().slice(0, 6)}`,
        commissionRate: "4.0",
        commissionRates: {
          broker: { apertura: "2.0" },
          masterBroker: { apertura: "1.0" },
          financiera: { apertura: "4.0" },
        },
        isActive: true,
      } as any);

      const subRequest = await storage.createCreditSubmissionRequest({
        clientId: client.id,
        brokerId: broker.id,
        requestedAmount: "1200000.00",
        purpose: "Capital de trabajo",
        status: "in_progress",
      } as any);

      const target = await storage.createCreditSubmissionTarget({
        requestId: subRequest.id,
        financialInstitutionId: institution.id,
        status: "selected_winner",
        isWinner: true,
        institutionProposal: {
          approvedAmount: 1200000,
          interestRate: 15.5,
          term: 24,
          openingCommission: 2.5,
        },
      } as any);

      const res = await request(app)
        .patch(`/api/credit-submission-targets/${target.id}/mark-dispersed`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("dispersed");
      expect(res.body.dispersedAt).toBeDefined();

      // Verificar que NO se crearon comisiones simuladas con approvedAmount
      const comms = await storage.getCommissions({ creditId: res.body.creditId });
      expect(comms.length).toBe(0);
    });
  });

  // =========================================================================
  // 2. REGLA 2 (COM-22): SNAPSHOT COMERCIAL INMUTABLE
  // =========================================================================
  describe("2. Snapshot comercial inmutable (COM-22)", () => {
    it("Positiva: select-winner consolida snapshot comercial formal con datos validados desde servidor", async () => {
      const admin = await storage.createUser({
        email: `admin-sel-${randomUUID()}@example.com`,
        firstName: "Admin",
        lastName: "Sel",
        role: "admin",
        isActive: true,
        status: "active",
      } as any);
      currentAuthUser = admin;

      const master = await storage.createUser({
        email: `master-sel-${randomUUID()}@example.com`,
        firstName: "Master",
        lastName: "Sel",
        role: "master_broker",
        isActive: true,
        status: "active",
      } as any);

      const broker = await storage.createUser({
        email: `broker-sel-${randomUUID()}@example.com`,
        firstName: "Broker",
        lastName: "Sel",
        role: "broker",
        masterBrokerId: master.id,
        isActive: true,
        status: "active",
      } as any);

      const client = await storage.createClient({
        brokerId: broker.id,
        type: "persona_moral",
        businessName: "Cliente Formal Snapshot SA",
      } as any);

      const institution = await storage.createFinancialInstitution({
        name: `Financiera Snapshot-${randomUUID().slice(0, 6)}`,
        commissionRate: "4.5",
        isActive: true,
      } as any);

      const subRequest = await storage.createCreditSubmissionRequest({
        clientId: client.id,
        brokerId: broker.id,
        originMasterBrokerId: master.id,
        requestedAmount: "1500000.00",
        purpose: "Expansion",
        status: "in_progress",
      } as any);

      const target = await storage.createCreditSubmissionTarget({
        requestId: subRequest.id,
        financialInstitutionId: institution.id,
        status: "approved",
        isWinner: false,
        institutionProposal: {
          approvedAmount: 1400000,
          interestRate: 14.0,
          term: 36,
          openingCommission: 2.0,
          commissionRates: {
            broker: { apertura: "1.75" },
            masterBroker: { apertura: "0.75" },
            financiera: { apertura: "3.5" },
          },
        },
      } as any);

      const res = await request(app)
        .patch(`/api/credit-submission-targets/${target.id}/select-winner`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.credit).toBeDefined();

      expect(res.body.credit.finalProposal.commissionRates).toBeUndefined();
      const createdCredit = await storage.getCredit(res.body.credit.id) as any;
      expect(createdCredit.finalProposal).toBeDefined();
      expect(createdCredit.finalProposal.isCommercialSnapshot).toBe(true);
      expect(createdCredit.finalProposal.originBrokerId).toBe(broker.id);
      expect(createdCredit.finalProposal.originMasterBrokerId).toBe(master.id);
      expect(createdCredit.finalProposal.commissionRates.broker.apertura).toBe("1.75");
      expect(createdCredit.finalProposal.commissionRates.masterBroker.apertura).toBe("0.75");

      currentAuthUser = broker;
      const replay = await request(app)
        .patch(`/api/credit-submission-targets/${target.id}/select-winner`).send({});
      expect(replay.status).toBe(200);
      expect(replay.body.alreadySelected).toBe(true);
      expect(replay.body.credit.id).toBe(createdCredit.id);
      expect(replay.body.credit.finalProposal.commissionRates).toBeUndefined();
      expect(replay.body.target.institutionProposal.commissionRates).toBeUndefined();
    });

    it("Negativa: consolidateCommercialProposalSnapshot bloquea modificación de snapshot comercial congelado", () => {
      const credit = {
        id: "credit-immutable-1",
        finalProposal: {
          institutionProductId: "offer-orig-1",
          versionNumber: 1,
          originBrokerId: "broker-orig-1",
          originMasterBrokerId: "master-orig-1",
          commissionRates: {
            broker: { apertura: "2.0" },
            masterBroker: { apertura: "1.0" },
            financiera: { apertura: "4.0" },
          },
          isCommercialSnapshot: true,
          snapshotCreatedAt: "2026-10-01T12:00:00.000Z",
        },
      };

      // Intento 1: Cambiar tasas pactadas
      expect(() => {
        consolidateCommercialProposalSnapshot({
          credit,
          proposalData: {
            institutionProductId: "offer-orig-1",
            versionNumber: 1,
            originBrokerId: "broker-orig-1",
            originMasterBrokerId: "master-orig-1",
            commissionRates: {
              broker: { apertura: "2.5" }, // Intento de alteración
              masterBroker: { apertura: "1.0" },
            },
          },
        });
      }).toThrow(ImmutableCommercialSnapshotError);

      // Intento 2: Cambiar Master beneficiario
      expect(() => {
        consolidateCommercialProposalSnapshot({
          credit,
          proposalData: {
            institutionProductId: "offer-orig-1",
            versionNumber: 1,
            originBrokerId: "broker-orig-1",
            originMasterBrokerId: "master-malicioso", // Intento de cambio de Master
          },
        });
      }).toThrow(ImmutableCommercialSnapshotError);

      // Intento 3: Cambiar versión de oferta
      expect(() => {
        consolidateCommercialProposalSnapshot({
          credit,
          proposalData: {
            institutionProductId: "offer-orig-1",
            versionNumber: 2, // Intento de cambio de versión
          },
        });
      }).toThrow(ImmutableCommercialSnapshotError);
    });

    it("Negativa: PUT /api/credits/:id responde 409 COMMERCIAL_SNAPSHOT_IMMUTABLE al intentar sobreescribir snapshot consolidado", async () => {
      const admin = await storage.createUser({
        email: `admin-put-imm-${randomUUID()}@example.com`,
        firstName: "Admin",
        lastName: "Imm",
        role: "admin",
        isActive: true,
        status: "active",
      } as any);
      currentAuthUser = admin;

      const credit = await storage.createCredit({
        clientId: `client-${randomUUID().slice(0, 8)}`,
        brokerId: admin.id,
        amount: "1000000.00",
        status: "approved",
        finalProposal: {
          institutionProductId: "offer-locked",
          versionNumber: 1,
          originBrokerId: "broker-locked",
          originMasterBrokerId: "master-locked",
          commissionRates: {
            broker: { apertura: "2.0" },
            masterBroker: { apertura: "1.0" },
            financiera: { apertura: "3.5" },
          },
          isCommercialSnapshot: true,
          snapshotCreatedAt: new Date().toISOString(),
        },
      } as any);

      const res = await request(app)
        .put(`/api/credits/${credit.id}`)
        .send({
          finalProposal: {
            institutionProductId: "offer-locked",
            versionNumber: 1,
            originBrokerId: "broker-locked",
            originMasterBrokerId: "otro-master-infiltrado", // Modificación no permitida
            commissionRates: {
              broker: { apertura: "3.0" },
            },
          },
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("COMMERCIAL_SNAPSHOT_IMMUTABLE");
    });

    it("Positiva: PUT /api/credits/:id preserva snapshot comercial intacto cuando se actualizan otros campos", async () => {
      const admin = await storage.createUser({
        email: `admin-put-safe-${randomUUID()}@example.com`,
        firstName: "Admin",
        lastName: "Safe",
        role: "admin",
        isActive: true,
        status: "active",
      } as any);
      currentAuthUser = admin;

      const timestamp = new Date("2026-10-01T10:00:00Z").toISOString();
      const credit = await storage.createCredit({
        clientId: `client-${randomUUID().slice(0, 8)}`,
        brokerId: admin.id,
        amount: "1000000.00",
        status: "approved",
        finalProposal: {
          institutionProductId: "offer-safe-preserve",
          versionNumber: 2,
          originBrokerId: "broker-safe",
          originMasterBrokerId: "master-safe",
          commissionRates: {
            broker: { apertura: "1.8" },
            masterBroker: { apertura: "0.8" },
            financiera: { apertura: "3.0" },
          },
          isCommercialSnapshot: true,
          snapshotCreatedAt: timestamp,
        },
      } as any);

      // Actualizar solo notas y propósito
      const res = await request(app)
        .put(`/api/credits/${credit.id}`)
        .send({
          purpose: "Capital de trabajo ampliado",
        });

      expect(res.status).toBe(200);
      expect(res.body.purpose).toBe("Capital de trabajo ampliado");
      expect(res.body.finalProposal).toBeDefined();
      expect(res.body.finalProposal.isCommercialSnapshot).toBe(true);
      expect(res.body.finalProposal.snapshotCreatedAt).toBe(timestamp);
      expect(res.body.finalProposal.originMasterBrokerId).toBe("master-safe");
      expect(res.body.finalProposal.commissionRates.broker.apertura).toBe("1.8");
    });
  });

  // =========================================================================
  // 3. REGLA 3 (COM-23): CÁLCULO CANÓNICO OBLIGATORIO
  // =========================================================================
  describe("3. Cálculo canónico obligatorio (COM-23)", () => {
    it("Seguridad: strictRateCheck: false no puede ser usado para evitar controles de tasa ausente", async () => {
      const institution = await storage.createFinancialInstitution({
        name: `Financiera Strict-${randomUUID().slice(0, 6)}`,
        isActive: true,
      } as any);

      const offer = await storage.createInstitutionProduct({
        financialInstitutionId: institution.id,
        name: "Oferta con Tasa Faltante",
        code: `OFR-INC-${randomUUID().slice(0, 6)}`,
        productType: "simple_credit",
        isActive: true,
      } as any);

      await storage.createInstitutionProductDraftVersion(offer.id, {
        versionNumber: 1,
        status: "published",
        conditions: {
          commissionRates: {
            financiera: { apertura: "3.0" },
            // broker y masterBroker ausentes
          },
        },
      } as any);

      const credit = await storage.createCredit({
        clientId: "client-strict-test",
        brokerId: "broker-strict-test",
        amount: "500000.00",
        status: "approved",
      } as any);

      // Intento de saltar controles pasando strictRateCheck: false
      await expect(
        calculateAndPersistCascadingCommission({
          credit,
          institutionProductId: offer.id,
          versionNumber: 1,
          confirmedDisbursedAmount: 500000,
          commissionType: "apertura",
          strictRateCheck: false as any, // Se prohíbe el bypass
        })
      ).rejects.toThrow(MissingCommissionRateError);
    });

    it("Positiva: Tasa autorizada de 0% es respetada y calcula comisión de $0.00 legítimamente", async () => {
      const institution = await storage.createFinancialInstitution({
        name: `Financiera ZeroRate-${randomUUID().slice(0, 6)}`,
        isActive: true,
      } as any);

      const offer = await storage.createInstitutionProduct({
        financialInstitutionId: institution.id,
        name: "Oferta Tasa Cero Autorizada",
        code: `ZERO-${randomUUID().slice(0, 6)}`,
        productType: "simple_credit",
        isActive: true,
      } as any);

      await storage.createInstitutionProductDraftVersion(offer.id, {
        versionNumber: 1,
        status: "published",
        conditions: {
          commissionRates: {
            broker: { apertura: "0" }, // 0% autorizada
            masterBroker: { apertura: "0" }, // 0% autorizada
            financiera: { apertura: "0" }, // 0% autorizada
          },
        },
      } as any);

      const credit = await storage.createCredit({
        clientId: "client-zero-test",
        brokerId: "broker-zero-test",
        originMasterBrokerId: "master-zero-test",
        amount: "1000000.00",
        status: "approved",
      } as any);

      const comm = await calculateAndPersistCascadingCommission({
        credit,
        institutionProductId: offer.id,
        versionNumber: 1,
        confirmedDisbursedAmount: 1000000,
        commissionType: "apertura",
      });

      expect(parseFloat(comm.brokerShare || "0")).toBe(0);
      expect(parseFloat(comm.masterBrokerShare || "0")).toBe(0);
      expect(parseFloat(comm.amount || "0")).toBe(0);
    });

    it("Negativa: Financiera con tasa 0% mientras Broker/Master tienen >0% es bloqueada por exceso de distribución", async () => {
      const credit = await storage.createCredit({
        clientId: "client-dist-zero",
        brokerId: "broker-dist-zero",
        originMasterBrokerId: "master-dist-zero",
        amount: "1000000.00",
        status: "approved",
        finalProposal: {
          commissionRates: {
            financiera: { apertura: "0" }, // Financiera autorizó 0%
            broker: { apertura: "1.0" }, // Broker reclama 1%
            masterBroker: { apertura: "0.5" },
          },
          isCommercialSnapshot: true,
        },
      } as any);

      await expect(
        calculateAndPersistCascadingCommission({
          credit,
          confirmedDisbursedAmount: 1000000,
          commissionType: "apertura",
        })
      ).rejects.toThrow(UnauthorizedDistributionError);
    });

    it("Positiva: Modificaciones en tarifas vivas de Master Broker no alteran cálculos canónicos de propuestas consolidadas", async () => {
      const master = await storage.createUser({
        email: `master-rates-${randomUUID()}@example.com`,
        role: "master_broker",
        networkCommissionRates: {
          "fin-canon": { apertura: "1.0" },
        },
        isActive: true,
        status: "active",
      } as any);

      const broker = await storage.createUser({
        email: `broker-rates-${randomUUID()}@example.com`,
        role: "broker",
        masterBrokerId: master.id,
        isActive: true,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        clientId: "client-canon-test",
        brokerId: broker.id,
        originMasterBrokerId: master.id,
        financialInstitutionId: "fin-canon",
        amount: "1000000.00",
        status: "approved",
        finalProposal: {
          commissionRates: {
            broker: { apertura: "2.5" },
            masterBroker: { apertura: "1.0" },
            financiera: { apertura: "4.0" },
          },
          isCommercialSnapshot: true,
        },
      } as any);

      // Master cambia posteriormente sus tarifas a 0.25%
      await storage.updateUser(master.id, {
        networkCommissionRates: {
          "fin-canon": { apertura: "0.25" },
        },
      } as any);

      // El cálculo debe respetar el 2.5% congelado, nunca el 0.25% vivo del Master
      const comm = await calculateAndPersistCascadingCommission({
        credit,
        confirmedDisbursedAmount: 1000000,
        commissionType: "apertura",
      });

      expect(parseFloat(comm.brokerShare || "0")).toBe(25000); // 2.5% de 1M
      expect(parseFloat(comm.masterBrokerShare || "0")).toBe(10000); // 1.0% de 1M
    });
  });

  // =========================================================================
  // 4. REGLA 4 (COM-24): PRESERVACIÓN E IDEMPOTENCIA
  // =========================================================================
  describe("4. Preservación, derechos históricos e idempotencia (COM-24)", () => {
    it("Positiva: Idempotencia estricta por idempotencyKey en multidispersión por tramos", async () => {
      const credit = await storage.createCredit({
        clientId: "client-tranche-idemp",
        brokerId: "broker-tranche-1",
        originMasterBrokerId: "master-tranche-1",
        amount: "2000000.00",
        status: "approved",
        finalProposal: {
          commissionRates: {
            broker: { apertura: "2.0" },
            masterBroker: { apertura: "1.0" },
            financiera: { apertura: "3.5" },
          },
          isCommercialSnapshot: true,
        },
      } as any);

      const trancheKey1 = `tranche-1-${randomUUID()}`;

      // Primer tramo de dispersión confirmada: $1,000,000
      const comm1 = await calculateAndPersistCascadingCommission({
        credit,
        confirmedDisbursedAmount: 1000000,
        commissionType: "apertura",
        dispersalIndex: 1,
        idempotencyKey: trancheKey1,
      });

      expect(parseFloat(comm1.brokerShare || "0")).toBe(20000);

      // Reintento idéntico del tramo 1
      const comm1Retry = await calculateAndPersistCascadingCommission({
        credit,
        confirmedDisbursedAmount: 1000000,
        commissionType: "apertura",
        dispersalIndex: 1,
        idempotencyKey: trancheKey1,
      });

      expect(comm1Retry.id).toBe(comm1.id);
      expect(parseFloat(comm1Retry.brokerShare || "0")).toBe(20000);

      // Segundo tramo de dispersión confirmada: $1,000,000 independiente
      const trancheKey2 = `tranche-2-${randomUUID()}`;
      const comm2 = await calculateAndPersistCascadingCommission({
        credit,
        confirmedDisbursedAmount: 1000000,
        commissionType: "apertura",
        dispersalIndex: 2,
        idempotencyKey: trancheKey2,
      });

      expect(comm2.id).not.toBe(comm1.id);
      expect(parseFloat(comm2.brokerShare || "0")).toBe(20000);
    });

    it("Positiva: Cambio posterior de red del broker preserva al Master beneficiario histórico", async () => {
      const masterOriginal = await storage.createUser({
        email: `master-orig-${randomUUID()}@example.com`,
        role: "master_broker",
        isActive: true,
        status: "active",
      } as any);

      const masterNuevo = await storage.createUser({
        email: `master-new-${randomUUID()}@example.com`,
        role: "master_broker",
        isActive: true,
        status: "active",
      } as any);

      const broker = await storage.createUser({
        email: `broker-mig-${randomUUID()}@example.com`,
        role: "broker",
        masterBrokerId: masterOriginal.id,
        isActive: true,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        clientId: "client-hist-master",
        brokerId: broker.id,
        originMasterBrokerId: masterOriginal.id,
        amount: "1000000.00",
        status: "approved",
        finalProposal: {
          originBrokerId: broker.id,
          originMasterBrokerId: masterOriginal.id,
          commissionRates: {
            broker: { apertura: "1.5" },
            masterBroker: { apertura: "1.0" },
            financiera: { apertura: "3.0" },
          },
          isCommercialSnapshot: true,
        },
      } as any);

      // Broker cambia de red posteriormente a masterNuevo
      await storage.updateUser(broker.id, {
        masterBrokerId: masterNuevo.id,
      } as any);

      // Al liquidar la operación consolidada, el beneficiario es el masterOriginal
      const comm = await calculateAndPersistCascadingCommission({
        credit,
        confirmedDisbursedAmount: 1000000,
        commissionType: "apertura",
      });

      expect(comm.masterBrokerId).toBe(masterOriginal.id);
      expect(parseFloat(comm.masterBrokerShare || "0")).toBe(10000);
    });
  });
});
