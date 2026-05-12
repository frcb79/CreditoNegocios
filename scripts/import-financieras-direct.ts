import fs from "fs";
import path from "path";
import { importFinancieras } from "../server/excelImport";
import { storage } from "../server/storage";

function parseArgs() {
  const args = process.argv.slice(2);
  let file = "scripts/financieras-from-ficha.xlsx";
  let email = "francocb79@gmail.com";

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--file" && args[i + 1]) {
      file = args[i + 1];
      i += 1;
      continue;
    }
    if (args[i] === "--email" && args[i + 1]) {
      email = args[i + 1];
      i += 1;
    }
  }

  return { file, email };
}

async function run() {
  const { file, email } = parseArgs();
  const filePath = path.resolve(process.cwd(), file);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo no encontrado: ${filePath}`);
  }

  const user = await storage.getUserByEmail(email);
  if (!user) {
    throw new Error(`No existe usuario con email: ${email}`);
  }

  const buffer = fs.readFileSync(filePath);
  const result = await importFinancieras(buffer, user.id);

  console.log(JSON.stringify({
    file: filePath,
    userId: user.id,
    email,
    result,
  }, null, 2));

  if (!result.success || result.errors.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("[import-financieras-direct]", error?.message || error);
  process.exit(1);
});
