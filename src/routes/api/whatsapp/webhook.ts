import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

const textHeaders = { "content-type": "text/plain; charset=utf-8" };
const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const anthropicVersion = "2023-06-01";

type EventStore = "whatsapp_webhook_events" | "broadcasts";
let resolvedEventStore: EventStore | null = null;

function env(name: string) {
  return process.env[name];
}

function getVerifyToken() {
  return env("WHATSAPP_WEBHOOK_VERIFY_TOKEN") ?? env("BOTLY_WHATSAPP_VERIFY_TOKEN");
}

function getAppSecret() {
  return env("WHATSAPP_APP_SECRET") ?? env("META_OAUTH_APP_SECRET");
}

function getWhatsAppAccessToken() {
  return env("WHATSAPP_ACCESS_TOKEN") ?? env("META_WHATSAPP_ACCESS_TOKEN");
}

function getWhatsAppPhoneNumberId() {
  return env("WHATSAPP_PHONE_NUMBER_ID") ?? env("META_WHATSAPP_PHONE_NUMBER_ID");
}

function getAnthropicApiKey() {
  return env("ANTHROPIC_API_KEY");
}

function getAnthropicModel() {
  // User requested Haiku 4.5 as the only model.
  return env("ANTHROPIC_MODEL") ?? "claude-haiku-4-5";
}

function getHaiku45ModelCandidates() {
  const preferred = getAnthropicModel();
  const candidates = [preferred, "claude-haiku-4-5", "claude-haiku-4-5-20251001"];
  return [...new Set(candidates.filter((value) => value.trim().length > 0))];
}

function mapAnthropicErrorToUserMessage(rawError: string) {
  const lower = rawError.toLowerCase();
  if (lower.includes("credit balance is too low") || lower.includes("billing")) {
    return "خدمة الرد الذكي متوقفة مؤقتاً بسبب مشكلة رصيد في مزود الذكاء. نرجع نخدمك أول ما يتحدث الرصيد.";
  }
  if (lower.includes("invalid_api_key") || lower.includes("authentication")) {
    return "خدمة الرد الذكي متوقفة مؤقتاً بسبب مشكلة إعدادات التوثيق.";
  }
  if (lower.includes("rate_limit")) {
    return "خدمة الرد الذكي مزدحمة مؤقتاً، حاول بعد دقائق.";
  }
  return "خدمة الرد الذكي متوقفة مؤقتاً بسبب خطأ تقني.";
}

function isStrictSignatureMode() {
  return (env("WHATSAPP_STRICT_SIGNATURE") ?? "false").toLowerCase() === "true";
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
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

function isMissingTableError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("42p01") || text.includes("does not exist") || text.includes("relation");
}

function fromBroadcastBody(body: unknown) {
  if (typeof body !== "string") return {} as Record<string, unknown>;
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function getEventStore(): Promise<EventStore> {
  if (resolvedEventStore) return resolvedEventStore;
  const probe = await supabaseAdmin.from("whatsapp_webhook_events").select("id").limit(1);
  resolvedEventStore = isMissingTableError(probe.error) ? "broadcasts" : "whatsapp_webhook_events";
  return resolvedEventStore;
}

async function loadBotProducts() {
  const store = await getEventStore();

  if (store === "broadcasts") {
    const rows = await supabaseAdmin
      .from("broadcasts")
      .select("id,body,created_at")
      .eq("audience", "botly:botly_product")
      .order("created_at", { ascending: false })
      .limit(100);

    return (rows.data ?? []).map((row) => {
      const payload = fromBroadcastBody(row.body);
      return {
        description: getString(payload.description),
        currentPrice: getNumber(payload.currentPrice) ?? 0,
        discountPrice: getNumber(payload.discountPrice),
        currency: getString(payload.currency) || "IQD",
        color: getString(payload.color),
        size: getString(payload.size),
        quantity: getNumber(payload.quantity),
      };
    });
  }

  const primary = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id,payload,created_at")
    .eq("source", "botly")
    .eq("event_type", "botly_product")
    .order("created_at", { ascending: false })
    .limit(100);

  if (isMissingTableError(primary.error)) {
    resolvedEventStore = "broadcasts";
    return loadBotProducts();
  }

  const rows =
    !primary.error
      ? primary.data
      : (
          await supabaseAdmin
            .from("whatsapp_webhook_events")
            .select("id,payload,received_at")
            .eq("provider", "botly_product")
            .order("received_at", { ascending: false })
            .limit(100)
        ).data;

  return (rows ?? []).map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    return {
      description: getString(payload.description),
      currentPrice: getNumber(payload.currentPrice) ?? 0,
      discountPrice: getNumber(payload.discountPrice),
      currency: getString(payload.currency) || "IQD",
      color: getString(payload.color),
      size: getString(payload.size),
      quantity: getNumber(payload.quantity),
    };
  });
}

function buildCatalogContext(products: Awaited<ReturnType<typeof loadBotProducts>>, customerText: string) {
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
      const options = [product.color && `لون ${product.color}`, product.size && `مقاس ${product.size}`]
        .filter(Boolean)
        .join("، ");
      const stock = product.quantity !== undefined ? `، الكمية ${product.quantity}` : "";
      return `${index + 1}. ${product.description} - السعر ${price} ${product.currency}${discount}${options ? `، ${options}` : ""}${stock}`;
    });

  return ranked.length ? ranked.join("\n") : "لا توجد منتجات محفوظة حالياً في كتالوج التاجر.";
}

async function callClaude(customerText: string, catalog: string, model: string, apiKey: string) {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": anthropicVersion,
    },
    body: JSON.stringify({
      model,
      max_tokens: 180,
      system: `أنت مساعد مبيعات لمتجر واتساب.

قواعد الرد (إلزامية):
- اكتب باللهجة العراقية البسيطة فقط.
- الرد يكون قصير جداً: سطر واحد أو سطرين كحد أقصى.
- لا تكتب ترحيب طويل.
- لا تستخدم إيموجي.
- لا تستخدم أسماء (لا اسمي ولا اسم الزبون).
- لا تستخدم كلمات زائدة مثل: "تدلل", "حياك", "أهلاً وسهلاً" إلا إذا ضروري جداً.
- اعتمد فقط على المنتجات الموجودة في قاعدة البيانات.
- لا تخترع منتجات أو أسعار أو تفاصيل غير موجودة.
- إذا ماكو منتج مناسب، قل بشكل مباشر: "حالياً غير متوفر , سنعلمك حال توفر المنتج"
- إذا سأل عن سعر منتج: اذكر السعر مباشرة بدون مقدمات.
- إذا سأل بشكل عام: جاوبه بسؤال واحد محدد يساعده يختار (مثل: النوع أو السعر).

أسلوب الرد:
- واضح، مختصر، عملي.
- ممنوع الإطالة.`,
      messages: [
        {
          role: "user",
          content: `رسالة الزبون: ${customerText}\n\nكتالوج المنتجات الحقيقي:\n${catalog}`,
        },
      ],
    }),
  });
}

async function generateClaudeReply(customerText: string) {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    console.error("[Claude] Missing ANTHROPIC_API_KEY");
    return { text: null, model: null as string | null, error: "Missing ANTHROPIC_API_KEY" };
  }

  const products = await loadBotProducts();
  const catalog = buildCatalogContext(products, customerText);

  let lastError = "";
  for (const model of getHaiku45ModelCandidates()) {
    const response = await callClaude(customerText, catalog, model, apiKey);
    if (!response.ok) {
      const providerError = await response.text().catch(() => "");
      lastError = `model=${model} status=${response.status} body=${providerError}`;
      console.error("[Claude] Reply generation failed", lastError);
      continue;
    }

    const data = (await response.json().catch(() => null)) as
      | { content?: Array<{ type?: string; text?: string }> }
      | null;
    const text = data?.content?.find((part) => part.type === "text")?.text?.trim();
    if (text) return { text, model, error: null as string | null };
  }

  return {
    text: null,
    model: null as string | null,
    error: lastError || "Unknown Claude provider failure",
  };
}

async function sendWhatsAppText(to: string, body: string) {
  const accessToken = getWhatsAppAccessToken();
  const phoneNumberId = getWhatsAppPhoneNumberId();

  if (!accessToken || !phoneNumberId) {
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
  return {
    ok: false,
    status: response.status,
    error: await response.text().catch(() => "Unknown WhatsApp API error"),
  };
}

async function storeWebhookEvent(summary: ReturnType<typeof readWebhookSummary>, payloadForStorage: Json) {
  const store = await getEventStore();

  if (store === "broadcasts") {
    const insert = await supabaseAdmin.from("broadcasts").insert({
      title: "meta_webhook",
      body: JSON.stringify(payloadForStorage),
      status: "meta_webhook_event",
      audience: "botly:meta_webhook",
      audience_label: "botly",
      recipients: 0,
    });
    return insert.error ?? null;
  }

  const primary = await supabaseAdmin.from("whatsapp_webhook_events").insert({
    source: summary.source,
    event_type: summary.eventType,
    phone_number_id: summary.phoneNumberId,
    wa_message_id: summary.waMessageId,
    from_number: summary.fromNumber,
    payload: payloadForStorage,
  });

  if (!primary.error) return null;
  if (isMissingTableError(primary.error)) {
    resolvedEventStore = "broadcasts";
    return storeWebhookEvent(summary, payloadForStorage);
  }

  const fallback = await supabaseAdmin.from("whatsapp_webhook_events").insert({
    provider: "meta",
    payload: payloadForStorage,
  } as never);
  return fallback.error ?? null;
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

        return new Response("Webhook verification failed", { status: 403, headers: textHeaders });
      },
      POST: async ({ request }) => {
        try {
          const rawBody = await request.text();
          const hasValidSignature = await verifyMetaSignature(request, rawBody);

          if (!hasValidSignature) {
            if (isStrictSignatureMode()) {
              return new Response(JSON.stringify({ ok: false, error: "Invalid signature" }), {
                status: 401,
                headers: jsonHeaders,
              });
            }
            console.warn("[WhatsApp webhook] Invalid signature, continuing (strict mode is off)");
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
          let claudeReply: string | null = null;
          let claudeError: string | null = null;
          let usedModel: string | null = null;
          let sendResult: Awaited<ReturnType<typeof sendWhatsAppText>> | null = null;

          if (incoming.from && incoming.text) {
            const aiResult = await generateClaudeReply(incoming.text);
            claudeReply = aiResult.text;
            claudeError = aiResult.error;
            usedModel = aiResult.model;
            if (claudeReply) {
              sendResult = await sendWhatsAppText(incoming.from, claudeReply);
              if (!sendResult.ok) console.error("[WhatsApp webhook] Failed to send reply", sendResult);
            } else if (incoming.from && claudeError) {
              const userSafeError = mapAnthropicErrorToUserMessage(claudeError);
              sendResult = await sendWhatsAppText(incoming.from, userSafeError);
              if (!sendResult.ok) console.error("[WhatsApp webhook] Failed to send diagnostic reply", sendResult);
            }
          }

          const payloadForStorage = {
            ...(payload && typeof payload === "object"
              ? (payload as Record<string, unknown>)
              : { raw: payload }),
            botly_ai: {
              provider: "anthropic",
              model: usedModel ?? getAnthropicModel(),
              incoming_type: incoming.type,
              replied: Boolean(claudeReply),
              sent: Boolean(sendResult?.ok),
              error: claudeError,
            },
          };

          const summary = readWebhookSummary(payload);
          const storageError = await storeWebhookEvent(summary, payloadForStorage as Json);
          if (storageError) {
            console.error("[WhatsApp webhook] Failed to persist event", storageError);
            return new Response(JSON.stringify({ ok: false, error: "Storage failed" }), {
              status: 500,
              headers: jsonHeaders,
            });
          }

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: jsonHeaders,
          });
        } catch (error) {
          console.error("[WhatsApp webhook] Unhandled error", error);
          return new Response(JSON.stringify({ ok: false, error: "Webhook runtime error" }), {
            status: 500,
            headers: jsonHeaders,
          });
        }
      },
    },
  },
});
