import { compareOfferIntermediaryCommissions } from "../../server/offerVersionService";

const version = (commissionRates: unknown) => ({
  conditions: { commissionRates },
}) as any;

const baseRates = {
  type: "porcentaje",
  financiera: { apertura: 4 },
  broker: { apertura: 2, renovacion: 1 },
  masterBroker: { apertura: 3, renovacion: 1.5 },
  channels: { directBroker: { platformGrossMargin: 2 } },
  platformNet: { direct: 2, master: 1 },
};

describe("COM-28 - Materialidad por oferta/version y beneficiario", () => {
  it("primera publicación no genera reaceptación retroactiva", () => {
    expect(compareOfferIntermediaryCommissions(null, version(baseRates))).toEqual({
      isInitialPublication: true,
      requiresManualReview: false,
      directBrokerChanged: false,
      masterBrokerChanged: false,
      requiresAnyAcceptance: false,
    });
  });

  it("sólo cambia la tasa pagadera al Broker directo", () => {
    const newer = structuredClone(baseRates);
    newer.broker.apertura = 2.5;
    const result = compareOfferIntermediaryCommissions(version(baseRates), version(newer));
    expect(result.directBrokerChanged).toBe(true);
    expect(result.masterBrokerChanged).toBe(false);
    expect(result.requiresAnyAcceptance).toBe(true);
  });

  it("sólo cambia cuota del Master; no afecta las comisiones de Broker directo", () => {
    const newer = structuredClone(baseRates);
    newer.masterBroker.renovacion = 2;
    const result = compareOfferIntermediaryCommissions(version(baseRates), version(newer));
    expect(result.directBrokerChanged).toBe(false);
    expect(result.masterBrokerChanged).toBe(true);
  });

  it("cambios de margen interno de CN/financiera sin cambio pagadero no inventan aceptación", () => {
    const newer = structuredClone(baseRates);
    newer.financiera.apertura = 5;
    newer.channels.directBroker.platformGrossMargin = 3;
    newer.platformNet.direct = 3;
    const result = compareOfferIntermediaryCommissions(version(baseRates), version(newer));
    expect(result.requiresAnyAcceptance).toBe(false);
  });

  it("equivalencias decimales, orden de campos y tasas representadas como strings", () => {
    const newer = {
      masterBroker: { renovacion: "1.50", apertura: "3.00" },
      broker: { renovacion: "1", apertura: "2.0" },
      financiera: { apertura: "4.00" },
      type: "porcentaje",
    };
    const result = compareOfferIntermediaryCommissions(version(baseRates), version(newer));
    expect(result.requiresAnyAcceptance).toBe(false);
    expect(result.requiresManualReview).toBe(false);
  });

  it("ausencia de esquemas pagaderos antes/después requiere revisión, no asume aceptación", () => {
    const result = compareOfferIntermediaryCommissions(
      version(baseRates),
      version({ type: "porcentaje", broker: { apertura: 2 } }),
    );
    expect(result.requiresManualReview).toBe(true);
    expect(result.requiresAnyAcceptance).toBe(false);
  });

  it("cambio de modalidad porcentual a fija afecta a ambos beneficiarios", () => {
    const newer = { ...baseRates, type: "monto_fijo" };
    const result = compareOfferIntermediaryCommissions(version(baseRates), version(newer));
    expect(result.directBrokerChanged).toBe(true);
    expect(result.masterBrokerChanged).toBe(true);
  });
});
