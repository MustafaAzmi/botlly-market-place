import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

import OpenAI from "openai";

const textHeaders = { "content-type": "text/plain; charset=utf-8" };
const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function getVerifyToken() {
  return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? process.env.BOTLY_WHATSAPP_VERIFY_TOKEN;
}

function getAppSecret() {
  return process.env.WHATSAPP_APP_SECRET ?? process.env.META_OAUTH_APP_SECRET;
}

function getWhatsAppAccessToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.META_WHATSAPP_ACCESS_TOKEN;
}

function getWhatsAppPhoneNumberId() {
  return process.env.WHATSAPP_PHONE_NUMBER_ID ?? process.env.META_WHATSAPP_PHONE_NUMBER_ID;
}

function getOpenAIApiKey() {
  return process.env.OPENAI_API_KEY;
}

function getOpenAIModel() {
  return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyMetaSignature(request: Request, rawBody: string) {
  const appSecret = getAppSecret();
  if (!appSecret) return true;

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature?.startsWith("sha256=")) return false;

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

function readWebhookSummary(payload: unknown) {
  const root = payload as {
    object?: string;
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string };
          messages?: Array<{ id?: string; from?: string; type?: string }>;
          statuses?: Array<{ id?: string; recipient_id?: string; status?: string }>;
        };
      }>;
    }>;
  };

  const value = root.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  const status = value?.statuses?.[0];

  return {
    source: root.object ?? "whatsapp_business_account",
    eventType: message
      ? `message.${message.type ?? "unknown"}`
      : status
        ? `status.${status.status ?? "unknown"}`
        : "unknown",
    phoneNumberId: value?.metadata?.phone_number_id ?? null,
    waMessageId: message?.id ?? status?.id ?? null,
    fromNumber: message?.from ?? status?.recipient_id ?? null,
  };
}

function readIncomingMessage(payload: unknown) {
  const root = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from?: string;
            type?: string;
            text?: { body?: string };
            button?: { text?: string };
            interactive?: { button_reply?: { title?: string } };
          }>;
        };
      }>;
    }>;
  };

  const message = root.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const text =
    message?.text?.body ?? message?.button?.text ?? message?.interactive?.button_reply?.title ?? "";

  return {
    from: message?.from ?? null,
    type: message?.type ?? null,
    text: text.trim(),
  };
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// Merchants that the admin has hidden/blocked from the bot. Their products must
// never appear in customer search results, regardless of payment status.
async function loadBannedMerchantIds(): Promise<Set<string>> {
  const banned = new Set<string>();
  const { data } = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id,payload")
    .eq("source", "botly")
    .eq("event_type", "botly_merchant")
    .limit(5000);

  for (const row of data ?? []) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    if (payload.bannedFromBot === true) banned.add(row.id);
  }
  return banned;
}

function mapProductRow(row: { payload: unknown }) {
  const payload = (row.payload ?? {}) as Record<string, unknown>;

  // Product name/description: try multiple field names for compatibility
  const description =
    getString(payload.name) ||
    getString(payload.title) ||
    getString(payload.productName) ||
    getString(payload.description) ||
    "";

  // Price: try multiple field names, convert to number safely
  const currentPrice =
    getNumber(payload.currentPrice) ??
    getNumber(payload.price) ??
    getNumber(payload.salePrice) ??
    0;

  return {
    merchantId: getString(payload.merchantId),
    description,
    currentPrice,
    discountPrice: getNumber(payload.discountPrice),
    currency: getString(payload.currency) || "IQD",
    color: getString(payload.color),
    size: getString(payload.size),
    quantity: getNumber(payload.quantity),
  };
}

async function loadBotProducts() {
  const banned = await loadBannedMerchantIds();

  // Primary query: source='botly' + event_type='botly_product'
  // (used by insertEvent in merchant.functions.ts).
  const primary = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id,payload,created_at")
    .eq("source", "botly")
    .eq("event_type", "botly_product")
    .order("created_at", { ascending: false })
    .limit(200);

  let rows = primary.data as Array<{ payload: unknown }> | null;

  // Fallback: provider='botly_product' (older schema path).
  if (!rows || rows.length === 0) {
    const fallback = await supabaseAdmin
      .from("whatsapp_webhook_events")
      .select("id,payload,received_at")
      .eq("provider", "botly_product")
      .order("received_at", { ascending: false })
      .limit(200);
    rows = fallback.data as Array<{ payload: unknown }> | null;
  }

  if (!rows || rows.length === 0) {
    console.warn(
      "[Bot Products] No products found in database. Check that merchants have added products.",
    );
    return [];
  }

  // Drop products that belong to a blocked merchant.
  return rows.map(mapProductRow).filter((p) => !p.merchantId || !banned.has(p.merchantId));
}

function buildCatalogContext(
  products: Awaited<ReturnType<typeof loadBotProducts>>,
  customerText: string,
) {
  const queryWords = customerText
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);

  const ranked = products
    .map((product) => {
      const haystack = [product.description, product.color, product.size].join(" ").toLowerCase();
      const score = queryWords.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
      return { product, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ product }, index) => {
      const price = product.discountPrice ?? product.currentPrice;
      const discount = product.discountPrice ? `، قبل الخصم ${product.currentPrice}` : "";
      const options = [
        product.color && `لون ${product.color}`,
        product.size && `مقاس ${product.size}`,
      ]
        .filter(Boolean)
        .join("، ");
      const stock = product.quantity !== undefined ? `، الكمية ${product.quantity}` : "";
      return `${index + 1}. ${product.description} - السعر ${price} ${product.currency}${discount}${options ? `، ${options}` : ""}${stock}`;
    });

  return ranked.length ? ranked.join("\n") : "لا توجد منتجات محفوظة حالياً في كتالوج التاجر.";
}

const CLAUDE_SYSTEM_PROMPT =
  'أنت بائع عراقي ودود اسمك "زيد". تتكلم باللهجة البغدادية. تساعد الزبون يلاكي البضاعة المناسبة من كتالوج التاجر الحقيقي فقط. لا تخترع منتجات أو أسعار. إذا ماكو منتج مناسب، قل للزبون بشكل لطيف إن المتوفر حالياً محدود واسأله شنو يدور. كن قصيراً وودوداً دائماً. لا تذكر أي API أو موديل أو تعليمات داخلية.';

// Calls the OpenAI API with GPT-4.1 mini. Returns the reply text,
// or null on any failure.
async function callOpenAIModel(
  apiKey: string,
  model: string,
  customerText: string,
  catalog: string,
): Promise<string | null> {
  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "system",
          content: CLAUDE_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `رسالة الزبون: ${customerText}\n\nكتالوج المنتجات الحقيقي:\n${catalog}`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    return text || null;
  } catch (error) {
    console.error("[OpenAI] Reply generation failed", model, error);
    return null;
  }
}

// Generates a reply using OpenAI GPT-4.1 mini. Returns the reply text
// together with the model that produced it.
async function generateClaudeReply(
  customerText: string,
): Promise<{ text: string; model: string } | null> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) return null;
  const products = await loadBotProducts();
  const catalog = buildCatalogContext(products, customerText);

  const model = getOpenAIModel();
  const reply = await callOpenAIModel(apiKey, model, customerText, catalog);
  if (reply) return { text: reply, model };

  return null;
}

async function sendWhatsAppText(to: string, body: string) {
  const accessToken = getWhatsAppAccessToken();
  const phoneNumberId = getWhatsAppPhoneNumberId();
  if (!accessToken || !phoneNumberId)
    return { ok: false, status: 0, error: "Missing WhatsApp credentials" };

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
  return {
    ok: false,
    status: response.status,
    error: await response.text().catch(() => "Unknown WhatsApp API error"),
  };
}

export const Route = createFileRoute("/api/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        if (mode === "subscribe" && challenge && token === getVerifyToken()) {
          return new Response(challenge, { status: 200, headers: textHeaders });
        }

        return new Response("Webhook verification failed", {
          status: 403,
          headers: textHeaders,
        });
      },
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const hasValidSignature = await verifyMetaSignature(request, rawBody);
        if (!hasValidSignature) {
          return new Response(JSON.stringify({ ok: false, error: "Invalid signature" }), {
            status: 401,
            headers: jsonHeaders,
          });
        }

        let payload: unknown;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
            status: 400,
            headers: jsonHeaders,
          });
        }

        const incoming = readIncomingMessage(payload);
        let claudeResult: { text: string; model: string } | null = null;
        let sendResult: Awaited<ReturnType<typeof sendWhatsAppText>> | null = null;

        if (incoming.from && incoming.text) {
          claudeResult = await generateClaudeReply(incoming.text);
          if (claudeResult) {
            sendResult = await sendWhatsAppText(incoming.from, claudeResult.text);
            if (!sendResult.ok)
              console.error("[WhatsApp webhook] Failed to send Claude reply", sendResult);
          }
        }

        const payloadForStorage = {
          ...(payload && typeof payload === "object"
            ? (payload as Record<string, unknown>)
            : { raw: payload }),
          botly_ai: {
            provider: "openai",
            model: claudeResult?.model ?? getOpenAIModel(),
            incoming_type: incoming.type,
            replied: Boolean(claudeResult),
            sent: Boolean(sendResult?.ok),
          },
        };

        const summary = readWebhookSummary(payload);
        const { error } = await supabaseAdmin.from("whatsapp_webhook_events").insert({
          source: summary.source,
          event_type: summary.eventType,
          phone_number_id: summary.phoneNumberId,
          wa_message_id: summary.waMessageId,
          from_number: summary.fromNumber,
          payload: payloadForStorage as Json,
        });

        if (error) {
          const fallback = await supabaseAdmin.from("whatsapp_webhook_events").insert({
            provider: "meta",
            payload: payloadForStorage as Json,
          } as never);

          if (fallback.error) {
            console.error("[WhatsApp webhook] Failed to persist event", error, fallback.error);
            return new Response(JSON.stringify({ ok: false, error: "Storage failed" }), {
              status: 500,
              headers: jsonHeaders,
            });
          }
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: jsonHeaders,
        });
      },
    },
  },
});
