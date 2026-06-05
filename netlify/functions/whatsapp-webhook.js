const textHeaders = { "content-type": "text/plain; charset=utf-8" };
const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function cleanEnv(value) {
  const trimmed = value?.trim();
  if (!trimmed || /^<.*>$/.test(trimmed)) return undefined;
  return trimmed;
}

function getVerifyToken() {
  return cleanEnv(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? process.env.BOTLY_WHATSAPP_VERIFY_TOKEN);
}

function getAppSecret() {
  return cleanEnv(process.env.WHATSAPP_APP_SECRET ?? process.env.META_OAUTH_APP_SECRET);
}

function getWhatsAppAccessToken() {
  return cleanEnv(process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.META_WHATSAPP_ACCESS_TOKEN);
}

function getWhatsAppPhoneNumberId() {
  return cleanEnv(process.env.WHATSAPP_PHONE_NUMBER_ID ?? process.env.META_WHATSAPP_PHONE_NUMBER_ID);
}

function getOpenAIApiKey() {
  return cleanEnv(process.env.OPENAI_API_KEY);
}

function getOpenAIModel() {
  return cleanEnv(process.env.OPENAI_MODEL) ?? "gpt-4.1-mini";
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyMetaSignature(request, rawBody) {
  const appSecret = getAppSecret();
  if (!appSecret) {
    console.log("[WhatsApp Function] No app secret set; skipping signature check");
    return true;
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature?.startsWith("sha256=")) {
    console.warn("[WhatsApp Function] Missing x-hub-signature-256 header");
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return timingSafeEqual(signature, `sha256=${bytesToHex(digest)}`);
}

function readIncomingMessage(payload) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  const text =
    message?.text?.body ??
    message?.button?.text ??
    message?.interactive?.button_reply?.title ??
    "";

  return {
    from: message?.from ?? null,
    id: message?.id ?? null,
    type: message?.type ?? null,
    text: text.trim(),
    phoneNumberId: value?.metadata?.phone_number_id ?? null,
  };
}

async function sendWhatsAppText(to, body) {
  const accessToken = getWhatsAppAccessToken();
  const phoneNumberId = getWhatsAppPhoneNumberId();
  if (!accessToken || !phoneNumberId) {
    console.error("[WhatsApp Function] Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
    return { ok: false, status: 0, error: "Missing WhatsApp credentials" };
  }

  const response = await fetch(`https://graph.facebook.com/v24.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });

  if (response.ok) return { ok: true, status: response.status };
  const error = await response.text().catch(() => "Unknown WhatsApp API error");
  console.error("[WhatsApp Function] Graph API send failed:", response.status, error);
  return { ok: false, status: response.status, error };
}

async function generateReply(customerText) {
  const fallbackReply = "\u0623\u0647\u0644\u0627\u064b\u060c \u0634\u0646\u0648 \u062a\u062f\u0648\u0631\u061f";
  const apiKey = getOpenAIApiKey();
  if (!apiKey) return fallbackReply;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: getOpenAIModel(),
        max_tokens: 160,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "\u0623\u0646\u062a \u0645\u0633\u0627\u0639\u062f \u0628\u064a\u0639 \u0639\u0631\u0627\u0642\u064a. \u0631\u062f \u0628\u0627\u0644\u0644\u0647\u062c\u0629 \u0627\u0644\u0639\u0631\u0627\u0642\u064a\u0629 \u0628\u0627\u062e\u062a\u0635\u0627\u0631 \u0634\u062f\u064a\u062f\u060c \u0628\u062f\u0648\u0646 \u0625\u064a\u0645\u0648\u062c\u064a\u060c \u0648\u0628\u062f\u0648\u0646 \u0630\u0643\u0631 \u0623\u0646\u0643 \u0628\u0648\u062a. \u0625\u0630\u0627 \u0627\u0644\u0633\u0624\u0627\u0644 \u063a\u064a\u0631 \u0648\u0627\u0636\u062d \u0627\u0633\u0623\u0644 \u0634\u0646\u0648 \u064a\u062f\u0648\u0631 \u0628\u0627\u0644\u0636\u0628\u0637.",
          },
          { role: "user", content: customerText },
        ],
      }),
    });
    if (!response.ok) {
      console.error("[WhatsApp Function] OpenAI failed:", response.status, await response.text());
      return fallbackReply;
    }
    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || fallbackReply;
  } catch (error) {
    console.error("[WhatsApp Function] OpenAI threw:", error);
    return fallbackReply;
  }
}

async function storeWebhookEvent(payload, incoming, sent) {
  const supabaseUrl = cleanEnv(process.env.SUPABASE_URL);
  const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) return;

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/whatsapp_webhook_events`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source: payload?.object ?? "whatsapp_business_account",
        event_type: incoming.type ? `message.${incoming.type}` : "unknown",
        phone_number_id: incoming.phoneNumberId,
        wa_message_id: incoming.id,
        from_number: incoming.from,
        payload: { ...payload, botly_netlify_function: { sent } },
      }),
    });
    if (!response.ok) {
      console.error("[WhatsApp Function] Supabase insert failed:", response.status, await response.text());
    }
  } catch (error) {
    console.error("[WhatsApp Function] Supabase insert threw:", error);
  }
}

export default async function handler(request) {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && challenge && token === getVerifyToken()) {
      return new Response(challenge, { status: 200, headers: textHeaders });
    }
    return new Response("Webhook verification failed", { status: 403, headers: textHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const rawBody = await request.text();
  const validSignature = await verifyMetaSignature(request, rawBody);
  if (!validSignature) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid signature" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const incoming = readIncomingMessage(payload);
  let sendResult = null;

  if (incoming.from && incoming.text) {
    const reply = await generateReply(incoming.text);
    sendResult = await sendWhatsAppText(incoming.from, reply);
  }

  await storeWebhookEvent(payload, incoming, Boolean(sendResult?.ok));

  return new Response(JSON.stringify({ ok: true, sent: Boolean(sendResult?.ok) }), {
    status: 200,
    headers: jsonHeaders,
  });
}
