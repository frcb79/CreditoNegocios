import fs from "fs";
import path from "path";

describe("SEC-P0-02: direct client credit list authorization", () => {
  const routes = fs.readFileSync(path.resolve(__dirname, "../../server/routes.ts"), "utf8");
  const clientCredits = routes.split("app.get('/api/credits/client/:clientId'")[1]
    ?.split("// Matching M2")[0];

  it("filters each persisted credit by immutable historical origin", () => {
    expect(clientCredits).toContain("allCredits.filter(credit => canViewCreditByOrigin(principal, credit))");
    expect(clientCredits).not.toContain("brokerId: isAdmin ? undefined : userId");
  });
  it("projects confidential proposal before returning client credit results", () => {
    expect(clientCredits).toContain("credits.map(credit => projectSubmissionCredit(credit, user?.role))");
  });
});
