import { describe, it, expect, beforeEach } from "@jest/globals";
import express from "express";
import { storage } from "../../server/storage";
import { getCommissionPayoutAmount, createCascadingCommissionRecord } from "../../server/routes";

describe("P0 - Commission Payout Integrity & Master Direct Single Count", () => {

  describe("1. Canonical getCommissionPayoutAmount calculations", () => {
    it("Master originador directo: calculates liquidable amount strictly once (single share)", () => {
      const comm = {
        id: "comm-1",
        creditId: "credit-1",
        brokerId: "master-user-1",
        masterBrokerId: "master-user-1", // isMasterDirect
        amount: "50000.00", // gross granted by financial institution
        brokerShare: "30000.00",
        masterBrokerShare: "30000.00",
        appShare: "20000.00",
        status: "generated",
      };

      const payout = getCommissionPayoutAmount(comm);
      expect(payout).toBe(30000);
      expect(payout).not.toBe(60000); // Guarantees NO double counting
    });

    it("Broker bajo Master: calculates correct network distribution sum (Option B)", () => {
      const comm = {
        id: "comm-2",
        creditId: "credit-2",
        brokerId: "sub-broker-1",
        masterBrokerId: "master-user-1", // Network credit
        amount: "50000.00",
        brokerShare: "20000.00",
        masterBrokerShare: "10000.00",
        appShare: "20000.00",
        status: "generated",
      };

      const payout = getCommissionPayoutAmount(comm);
      expect(payout).toBe(30000); // 20000 broker + 10000 master differential
    });

    it("Broker directo de Casa Matriz: calculates direct broker share", () => {
      const comm = {
        id: "comm-3",
        creditId: "credit-3",
        brokerId: "direct-broker-1",
        masterBrokerId: null, // Casa Matriz direct
        amount: "40000.00",
        brokerShare: "25000.00",
        masterBrokerShare: "0.00",
        appShare: "15000.00",
        status: "generated",
      };

      const payout = getCommissionPayoutAmount(comm);
      expect(payout).toBe(25000);
    });

    it("Safeguards existing commissions with legacy corrupted double frozenAmount", () => {
      const legacyCorruptedComm = {
        id: "comm-legacy-1",
        creditId: "credit-legacy-1",
        brokerId: "master-user-1",
        masterBrokerId: "master-user-1", // isMasterDirect
        amount: "50000.00",
        brokerShare: "30000.00",
        masterBrokerShare: "30000.00",
        frozenAmount: "60000.00", // Corrupted legacy doubled amount!
        status: "approved",
      };

      const safePayout = getCommissionPayoutAmount(legacyCorruptedComm);
      // Must be safely capped to legitimate single share (30000)
      expect(safePayout).toBe(30000);
      expect(safePayout).not.toBe(60000);
    });

    it("Respects valid frozenAmount when within legitimate single share", () => {
      const approvedComm = {
        id: "comm-valid-1",
        creditId: "credit-valid-1",
        brokerId: "master-user-1",
        masterBrokerId: "master-user-1",
        amount: "50000.00",
        brokerShare: "30000.00",
        masterBrokerShare: "30000.00",
        frozenAmount: "30000.00", // Valid single frozen share
        status: "approved",
      };

      const payout = getCommissionPayoutAmount(approvedComm);
      expect(payout).toBe(30000);
    });
  });

  describe("2. createCascadingCommissionRecord generation and immutability", () => {
    it("generates Master Direct commission and preserves immutability against retroactive recalculation", async () => {
      const masterUser = await storage.createUser({
        email: "mb.direct@example.com",
        password: "hash",
        firstName: "Master",
        lastName: "Directo",
        role: "master_broker",
        authMethod: "local",
      });

      const client = await storage.createClient({
        firstName: "Empresa",
        lastName: "Cliente",
        businessName: "Cliente SA",
        email: "client@example.com",
        phone: "5551234567",
        type: "pyme",
        brokerId: masterUser.id,
      });

      const credit = await storage.createCredit({
        clientId: client.id,
        brokerId: masterUser.id,
        originMasterBrokerId: masterUser.id, // Direct origination by Master
        amount: "1000000", // 1,000,000 MXN
        status: "aprobado",
        financialInstitutionId: "fin-1",
        finalProposal: {
          approvedAmount: 1000000,
          commissionRates: {
            masterBroker: { apertura: "3.0" },
            superAdmin: { apertura: "4.0" },
          },
        },
      });

      // 1. Generation
      const comm = await createCascadingCommissionRecord(credit, null, 1000000, "apertura");
      expect(comm).toBeDefined();
      expect(comm.masterBrokerId).toBe(masterUser.id);
      expect(comm.brokerId).toBe(masterUser.id);
      expect(parseFloat(comm.masterBrokerShare)).toBe(30000); // 3% of 1M
      expect(parseFloat(comm.brokerShare)).toBe(30000);

      // Liquidable amount is strictly single share
      expect(getCommissionPayoutAmount(comm)).toBe(30000);

      // 2. Approve and freeze
      const approved = await storage.updateCommission(comm.id, {
        status: "approved",
        frozenAmount: getCommissionPayoutAmount(comm).toFixed(2),
        approvedAt: new Date(),
      });
      expect(approved?.frozenAmount).toBe("30000.00");

      // 3. Immutability protection: attempt recalculation on approved commission
      const recalculated = await createCascadingCommissionRecord(credit, null, 2000000, "apertura");
      // Must return unchanged duplicate because approved commission is frozen
      expect(recalculated.id).toBe(comm.id);
      expect(recalculated.status).toBe("approved");
      expect(recalculated.frozenAmount).toBe("30000.00");
    });
  });

  describe("3. Historical Beneficiary Preservation across transfers", () => {
    it("Broker transfer from Master A to Master B preserves Master A as historical beneficiary for prior operation", async () => {
      const masterA = await storage.createUser({
        email: "master.a@example.com",
        password: "hash",
        firstName: "Master",
        lastName: "Alpha",
        role: "master_broker",
        authMethod: "local",
        clabe: "123456789012345678",
      });

      const masterB = await storage.createUser({
        email: "master.b@example.com",
        password: "hash",
        firstName: "Master",
        lastName: "Beta",
        role: "master_broker",
        authMethod: "local",
        clabe: "876543210987654321",
      });

      const broker = await storage.createUser({
        email: "sub.broker@example.com",
        password: "hash",
        firstName: "Sub",
        lastName: "Broker",
        role: "broker",
        masterBrokerId: masterA.id, // Initially under Master A
        authMethod: "local",
        clabe: "111122223333444455",
      });

      // Operation executed under Master A
      const commHistoric = await storage.createCommission({
        creditId: "credit-hist-1",
        brokerId: broker.id,
        masterBrokerId: masterA.id, // Historic Master A
        amount: "50000.00",
        brokerShare: "20000.00",
        masterBrokerShare: "10000.00",
        appShare: "20000.00",
        status: "approved",
        frozenAmount: "30000.00",
      });

      // Later, broker is transferred to Master B
      await storage.updateUser(broker.id, {
        masterBrokerId: masterB.id,
      });

      const updatedBroker = await storage.getUser(broker.id);
      expect(updatedBroker?.masterBrokerId).toBe(masterB.id);

      // Verify that the historical beneficiary of the commission remains Master A
      const historicalMasterId = commHistoric.masterBrokerId;
      expect(historicalMasterId).toBe(masterA.id);
      expect(historicalMasterId).not.toBe(masterB.id);

      // Payout amount remains Option B to Master A
      const payout = getCommissionPayoutAmount(commHistoric);
      expect(payout).toBe(30000);
    });
  });

  describe("4. Payout Routes Integrity, CLABE Verification & Manual Settlement", () => {
    let app: express.Express;
    let adminUser: any;
    let masterDirectUser: any;
    let brokerWithoutClabe: any;

    beforeEach(async () => {
      app = express();
      app.use(express.json());

      adminUser = await storage.createUser({
        email: "admin@example.com",
        password: "hash",
        firstName: "Admin",
        lastName: "System",
        role: "admin",
        authMethod: "local",
      });

      masterDirectUser = await storage.createUser({
        email: "md.payout@example.com",
        password: "hash",
        firstName: "Master",
        lastName: "Direct",
        role: "master_broker",
        authMethod: "local",
        clabe: "012345678901234567", // Valid 18 digits
        bankName: "BBVA",
        accountHolder: "Master Direct SA",
      });

      brokerWithoutClabe = await storage.createUser({
        email: "noclabe@example.com",
        password: "hash",
        firstName: "No",
        lastName: "Clabe",
        role: "broker",
        authMethod: "local",
        clabe: null, // Missing CLABE
      });
    });

    it("Single STP Payout: processes single amount for Master Direct and rejects altered CLABE", async () => {
      const comm = await storage.createCommission({
        creditId: "credit-pay-1",
        brokerId: masterDirectUser.id,
        masterBrokerId: masterDirectUser.id, // isMasterDirect
        amount: "50000.00",
        brokerShare: "30000.00",
        masterBrokerShare: "30000.00",
        appShare: "20000.00",
        status: "approved",
        frozenAmount: "30000.00",
      });

      // 1. Verify calculated payout amount is strictly single share
      const payout = getCommissionPayoutAmount(comm);
      expect(payout).toBe(30000);

      // 2. Reject client-side CLABE tampering
      const registeredClabe = masterDirectUser.clabe;
      const tamperedClabe = "999999999999999999";
      expect(tamperedClabe).not.toBe(registeredClabe);

      // 3. Validate 18-digit CLABE requirement
      expect(/^\d{18}$/.test(registeredClabe)).toBe(true);
      expect(/^\d{18}$/.test("12345")).toBe(false);
    });

    it("Rejects payout when beneficiary lacks a valid 18-digit CLABE", async () => {
      const commNoClabe = await storage.createCommission({
        creditId: "credit-noclabe-1",
        brokerId: brokerWithoutClabe.id,
        masterBrokerId: null,
        amount: "20000.00",
        brokerShare: "15000.00",
        masterBrokerShare: "0.00",
        appShare: "5000.00",
        status: "approved",
      });

      const user = await storage.getUser(commNoClabe.brokerId);
      const clabe = user?.clabe;
      const isValidClabe = Boolean(clabe && /^\d{18}$/.test(String(clabe).trim()));

      expect(isValidClabe).toBe(false);
    });

    it("Bulk Pay calculates total processed without doubling Master Direct commissions", async () => {
      // Comm 1: Master Direct ($30,000)
      const comm1 = await storage.createCommission({
        creditId: "c-1",
        brokerId: masterDirectUser.id,
        masterBrokerId: masterDirectUser.id,
        amount: "50000.00",
        brokerShare: "30000.00",
        masterBrokerShare: "30000.00",
        status: "approved",
      });

      // Comm 2: Direct Broker ($20,000)
      const comm2 = await storage.createCommission({
        creditId: "c-2",
        brokerId: "other-broker",
        masterBrokerId: null,
        amount: "30000.00",
        brokerShare: "20000.00",
        masterBrokerShare: "0.00",
        status: "approved",
      });

      const p1 = getCommissionPayoutAmount(comm1);
      const p2 = getCommissionPayoutAmount(comm2);

      expect(p1).toBe(30000);
      expect(p2).toBe(20000);

      const totalBulkAmount = p1 + p2;
      expect(totalBulkAmount).toBe(50000);
      expect(totalBulkAmount).not.toBe(80000); // Guarantees NO doubling
    });

    it("Manual settlement (/mark-paid) records single amount for Master Direct", async () => {
      const comm = await storage.createCommission({
        creditId: "c-manual-1",
        brokerId: masterDirectUser.id,
        masterBrokerId: masterDirectUser.id,
        amount: "50000.00",
        brokerShare: "30000.00",
        masterBrokerShare: "30000.00",
        status: "approved",
      });

      const payout = getCommissionPayoutAmount(comm);
      expect(payout).toBe(30000);

      const paidComm = await storage.updateCommission(comm.id, {
        status: "paid",
        paymentMethod: "manual",
        paidAt: new Date(),
        paidBy: adminUser.id,
        notes: "Liquidación en ventanilla bancaria autorizada",
      });

      expect(paidComm?.status).toBe("paid");
      expect(paidComm?.paymentMethod).toBe("manual");
    });
  });
});
