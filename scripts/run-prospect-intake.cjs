const {spawnSync} = require("node:child_process");
const result=spawnSync(process.execPath,["--import","tsx","--test","scripts/test-prospect-intake.ts"],{stdio:"inherit",env:{...process.env,NODE_ENV:"test",USE_MEMORY_STORAGE:"true"}});
process.exit(result.status ?? 1);
