
import { MemStorage } from "../../server/storage";
import { getPublishedLegalDocument } from "../../server/legalDocuments";

describe("P0 - Invitación con activación y evidencia legal atómica", () => {
  const terms = getPublishedLegalDocument("terminos")!;
  const privacy = getPublishedLegalDocument("aviso")!;
  const params = (user: any, token: string) => ({
    userId: user.id, token, passwordHash: "$2b$hashed-for-unit-only",
    ipAddress: "203.0.113.10", userAgent: "Jest test",
    termsDoc: { id: terms.id, document: terms.document, version: terms.version, contentSha256: terms.contentSha256 },
    privacyDoc: { id: privacy.id, document: privacy.document, version: privacy.version, contentSha256: privacy.contentSha256 },
  });
  it("crea 2 evidencias y contraseña y consume token en una sola operación", async () => {
    const s = new MemStorage();
    const user = await s.createUser({email:"activation-"+Date.now()+"@test.example",firstName:"Ana",lastName:"Prueba",role:"broker",password:null,authMethod:"local"} as any);
    const token = "test-activation-legal-"+Date.now();
    await s.setPasswordResetToken(user.id, token, new Date(Date.now()+86400000));
    const evidence = await s.completeInvitationActivation(params(user,token));
    expect(evidence.map(x=>x.acceptanceType).sort()).toEqual(["accept_terms","acknowledge_privacy"]);
    expect(evidence.every(x=>x.ipAddress === "203.0.113.10")).toBe(true);
    expect((await s.getUser(user.id))?.password).toBe("$2b$hashed-for-unit-only");
    expect(await s.getUserByResetToken(token)).toBeUndefined();
    await expect(s.completeInvitationActivation(params(user,token))).rejects.toThrow();
    expect((await s.getLegalAcceptancesByUser(user.id))).toHaveLength(2);
  });
  it("hash o versión legal alterados no crean contraseña ni aceptaciones", async () => {
    const s = new MemStorage();
    const user = await s.createUser({email:"invalid-"+Date.now()+"@test.example",firstName:"Juan",lastName:"Prueba",role:"broker",password:null,authMethod:"local"} as any);
    const token = "invalid-legal-"+Date.now();
    await s.setPasswordResetToken(user.id,token,new Date(Date.now()+86400000));
    const p = params(user,token);
    p.termsDoc.contentSha256 = "invalid-hash";
    await expect(s.completeInvitationActivation(p)).rejects.toThrow();
    expect((await s.getUser(user.id))?.password).toBeNull();
    expect((await s.getLegalAcceptancesByUser(user.id))).toHaveLength(0);
  });
});
