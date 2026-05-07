#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(process.cwd(), "client", "src");
const outFile = path.resolve(process.cwd(), "qa-button-checklist.csv");

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function classifyRole(testId) {
  const t = testId.toLowerCase();
  if (t.includes("admin") || t.includes("user-management") || t.includes("import") || t.includes("approve") || t.includes("reject")) {
    return "admin/super_admin";
  }
  if (t.includes("network") || t.includes("master")) {
    return "master_broker+";
  }
  return "broker+";
}

function classifyArea(filePath) {
  const lower = filePath.toLowerCase().replace(/\\/g, "/");
  if (lower.includes("pages/")) return "page";
  if (lower.includes("components/modals")) return "modal";
  if (lower.includes("components/")) return "component";
  return "other";
}

const rows = [];
for (const file of walk(root)) {
  const content = fs.readFileSync(file, "utf8");
  const regex = /data-testid\s*=\s*["'`]([^"'`]+)["'`]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const testId = match[1];
    if (!testId.includes("button")) continue;
    const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
    rows.push({
      role: classifyRole(testId),
      area: classifyArea(rel),
      button_testid: testId,
      file: rel,
      expected_action: "Click triggers expected flow or state change",
      result: "PENDING",
      severity_if_fail: "HIGH",
      notes: "",
    });
  }
}

rows.sort((a, b) => a.button_testid.localeCompare(b.button_testid));
const dedup = [];
const seen = new Set();
for (const r of rows) {
  const key = `${r.button_testid}|${r.file}`;
  if (seen.has(key)) continue;
  seen.add(key);
  dedup.push(r);
}

const header = [
  "role",
  "area",
  "button_testid",
  "file",
  "expected_action",
  "result",
  "severity_if_fail",
  "notes",
];

const csvLines = [header.join(",")];
for (const r of dedup) {
  const line = header
    .map((k) => String(r[k]).replace(/"/g, '""'))
    .map((v) => `"${v}"`)
    .join(",");
  csvLines.push(line);
}

fs.writeFileSync(outFile, csvLines.join("\n"), "utf8");
console.log(`Checklist generado: ${outFile}`);
console.log(`Total botones registrados: ${dedup.length}`);
