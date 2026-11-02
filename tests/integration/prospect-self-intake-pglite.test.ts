import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
it("verifies the complete self-service flow against isolated PostgreSQL (PGlite)", () => {
  const output = execFileSync(process.execPath,["--import","tsx","--test","--test-reporter=tap","scripts/test-prospect-intake.ts"], {
    cwd:resolve(process.cwd()), timeout:60000, encoding:"utf8",
    env:{...process.env,NODE_ENV:"test",USE_MEMORY_STORAGE:"true"},
  });
  expect(output).toMatch(/# fail 0/);
  expect(output).toMatch(/# tests 14/);
},65000);
