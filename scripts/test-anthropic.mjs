import { readFileSync, existsSync } from "node:fs";

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;

    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;

      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadLocalEnv();

const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

if (!apiKey) {
  throw new Error("Missing ANTHROPIC_API_KEY. Set it locally before running this test.");
}

const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model,
    max_tokens: 100,
    messages: [{ role: "user", content: "مرحبا" }],
  }),
});

const data = await response.json();

if (!response.ok) {
  console.error(data);
  throw new Error(`Anthropic test failed with status ${response.status}`);
}

const botReply = data.content?.find((part) => part.type === "text")?.text;
console.log(botReply ?? data);
