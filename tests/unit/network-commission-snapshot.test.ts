import { buildNetworkCommissionSnapshot } from "../../server/networkCommissionSnapshot";

const published = () => ({
  financiera: { apertura: 4, renovacion: 2, sobretasa: 1 },
  masterBroker: { apertura: 3, renovacion: 1, sobretasa: 0 },
  broker: { apertura: 2, renovacion: 0.5, sobretasa: 0 },
});

describe("Master network commission frozen snapshot", () => {
  it("uses assigned broker share and freezes the Master residual, leaving CN economics intact", () => {
    const source = published();
    const frozen = buildNetworkCommissionSnapshot(source, { apertura: 1.75, renovacion: 0.4 });
    expect(frozen.financiera).toEqual({ apertura: 4, renovacion: 2, sobretasa: 1 });
    expect(frozen.broker).toEqual({ apertura: 1.75, renovacion: 0.4, sobretasa: 0 });
    expect(frozen.masterBroker).toEqual({ apertura: 1.25, renovacion: 0.6, sobretasa: 0 });
    expect(source.masterBroker.apertura).toBe(3);
    expect(source.broker.apertura).toBe(2);
  });

  it("keeps original offer economics when there is no network allocation", () => {
    const source = published();
    expect(buildNetworkCommissionSnapshot(source, null)).toEqual(source);
  });

  it("accepts offers with opening commission only and zero renewal", () => {
    const source = published();
    delete (source.masterBroker as any).renovacion;
    delete (source.broker as any).renovacion;
    const frozen = buildNetworkCommissionSnapshot(source, { apertura: 1.5, renovacion: 0 });
    expect(frozen.broker).toEqual({ apertura: 1.5, renovacion: 0, sobretasa: 0 });
    expect(frozen.masterBroker).toEqual({ apertura: 1.5, renovacion: 0, sobretasa: 0 });
  });

  it("preserves explicit zero broker share", () => {
    const frozen = buildNetworkCommissionSnapshot(published(), { apertura: 0, renovacion: 0 });
    expect(frozen.broker.apertura).toBe(0);
    expect(frozen.masterBroker.apertura).toBe(3);
  });

  it.each([
    [{ apertura: 3.01, renovacion: 0 }, "NETWORK_COMMISSION_EXCEEDS_OFFER_CEILING"],
    [{ apertura: 2, renovacion: 1.01 }, "NETWORK_COMMISSION_EXCEEDS_OFFER_CEILING"],
    [{ apertura: -1, renovacion: 0 }, "NETWORK_COMMISSION_INVALID_BROKER_APERTURA"],
    [{ apertura: "Infinity", renovacion: 0 }, "NETWORK_COMMISSION_INVALID_BROKER_APERTURA"],
    [{ apertura: 1, renovacion: "not a rate" }, "NETWORK_COMMISSION_INVALID_BROKER_RENOVACION"],
  ])("rejects malformed or above-ceiling allocations", (allocation, error) => {
    expect(() => buildNetworkCommissionSnapshot(published(), allocation)).toThrow(error);
  });
});
