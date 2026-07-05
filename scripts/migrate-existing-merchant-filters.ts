import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadLocalEnvironment() {
  const source = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    process.env[match[1]] = value;
  }
}

loadLocalEnvironment();

const { migrateExistingMerchantFiltersAndImages } = await import(
  "../src/lib/admin.functions"
);
const report = await migrateExistingMerchantFiltersAndImages();

console.log(`BOTLY_MIGRATION_REPORT=${JSON.stringify(report)}`);
