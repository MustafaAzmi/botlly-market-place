import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const checks = [];

function add(name, ok, detail) {
  checks.push({ name, ok, detail });
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

const envPath = join(root, ".env");
add(".env exists locally", existsSync(envPath), existsSync(envPath) ? "found" : "not found");

const fileEnv = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    fileEnv[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
}

function envValue(name) {
  const value = (process.env[name] ?? fileEnv[name])?.trim();
  if (!value || /^<.*>$/.test(value)) return "";
  return value;
}

const requiredEnvGroups = [
  ["SUPABASE_URL"],
  ["SUPABASE_SERVICE_ROLE_KEY"],
  ["WHATSAPP_ACCESS_TOKEN", "META_WHATSAPP_ACCESS_TOKEN"],
  ["WHATSAPP_PHONE_NUMBER_ID", "META_WHATSAPP_PHONE_NUMBER_ID"],
  ["WHATSAPP_WEBHOOK_VERIFY_TOKEN", "BOTLY_WHATSAPP_VERIFY_TOKEN"],
  ["OPENAI_API_KEY"],
];

for (const group of requiredEnvGroups) {
  const found = group.find((key) => envValue(key));
  add(`env ${group.join(" or ")}`, Boolean(found), found ? `set as ${found}` : "missing");
}

const sender = read("src/lib/whatsapp/send.server.ts");
const netlifyToml = read("netlify.toml");
const netlifyFunction = read("netlify/functions/whatsapp-webhook.js");

add(
  "Netlify webhook function exists",
  netlifyFunction.includes("export default async function handler"),
  "standalone function can receive Meta webhooks",
);
add(
  "Netlify webhook redirect exists",
  netlifyToml.includes('from = "/api/whatsapp/webhook"') &&
    netlifyToml.includes('to = "/.netlify/functions/whatsapp-webhook"'),
  "Meta callback path is routed directly to the function",
);

add(
  "WhatsApp placeholder guard",
  sender.includes("/^<.*>$/.test(trimmed)"),
  "placeholder credentials are treated as missing",
);
add(
  "WhatsApp send failure logging",
  sender.includes("[WhatsApp] Graph API send failed"),
  "Graph API errors are logged",
);

const webhook = read("src/routes/api/whatsapp/webhook.ts");
add(
  "webhook sends fallback reply",
  webhook.includes('enhancedResult?.text ?? "أهلاً، شو تدور؟"'),
  "fallback text exists when AI generation fails",
);
add(
  "webhook storage is non-fatal",
  webhook.includes("[Storage] Event insert setup failed"),
  "Supabase setup failures no longer abort the webhook response",
);
add(
  "webhook returns 200 after processing",
  webhook.includes('JSON.stringify({ ok: true })'),
  "Meta receives ok after valid payload processing",
);

const migrationFiles = [
  "supabase/migrations/20260530170000_create_whatsapp_webhook_events.sql",
  "supabase/migrations/20260601000000_add_parsing_metadata.sql",
  "supabase/migrations/20260601100000_social_commerce_search.sql",
  "supabase/migrations/20260601200000_merchant_visibility_controls.sql",
];

const migrations = migrationFiles.map(read).join("\n");
add(
  "no nonexistent UUID sequence grant",
  !migrations.includes("whatsapp_webhook_events_id_seq"),
  "UUID table does not reference a serial sequence",
);
add(
  "metadata references UUID webhook ids",
  !/webhook_event_id\s+BIGINT/i.test(migrations),
  "metadata tables match whatsapp_webhook_events.id uuid",
);
add(
  "search RPC returns UUID ids",
  !/RETURNS TABLE\s*\([^)]*id\s+bigint/is.test(migrations),
  "search RPC result id matches uuid table id",
);

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  const mark = check.ok ? "OK" : "FAIL";
  console.log(`${mark} ${check.name}: ${check.detail}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll Botly checks passed.");
}
