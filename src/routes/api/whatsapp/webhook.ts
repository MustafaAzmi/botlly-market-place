import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

import OpenAI from "openai";

// Import new parsing modules
import {
  detectIraqiDialect,
  normalizeArabicText,
  expandPriceShortcuts,
  extractArabicKeywords,
} from "@/lib/whatsapp/iraqi-arabic";
import { detectSpam, isRepeatedMessage } from "@/lib/whatsapp/spam-detector";
import { scoreProductParsing, scoreLanguageClarity } from "@/lib/whatsapp/confidence-scoring";
import { fallbackExtraction } from "@/lib/whatsapp/fallback-extraction";
import {
  buildIraqiReplyPrompt,
  applyGuardrails,
  sanitizeReplyForWhatsApp,
  generateFallbackReply,
} from "@/lib/whatsapp/reply-generator";
import type {
  ConfidenceScore,
  ParsingMetadata,
  ParsedProduct,
  GuardrailConfig,
} from "@/lib/whatsapp/types";

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

const IRAQI_SYSTEM_PROMPT = `أنت مساعد بيع عراقي اسمك "زيد". كلامك عراقي طبيعي بغدادي فقط.
لازم:
- تكون مختصر جداً (سطر واحد أو اثنين فقط)
- ما تستخدم إيموجي أبداً
- ما تستخدم كلام رسمي أو تسويقي
- ترد على الزبون بطريقة طبيعية زي الشات العراقي
- تعتمد على الكتالوج الحقيقي فقط

إذا ما حصلت البضاعة، قول: "مو موجودة حاليا"
إذا ما فهمت شنو يدور، قول: "مو واضح شنو تقول، احتاج تفاصيل اكثر"

أمثلة ردود صحيحة:
- "موجودة، السعر 50 ألف"
- "نفذت حاليا"
- "شنو بالضبط تدور؟"
- "هذني الأنواع الموجودة..."
- "الحمد لله عندنا، بكام تخذها؟"`;

// Enhanced OpenAI call with optimized tokens and temperature for consistency
async function callOpenAIModel(
  apiKey: string,
  model: string,
  customerText: string,
  catalog: string,
  systemPrompt?: string,
): Promise<string | null> {
  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model,
      max_tokens: 512, // Reduced from 1024 for faster/cheaper inference
      temperature: 0.3, // Lower for more consistent product info
      messages: [
        {
          role: "system",
          content: systemPrompt || IRAQI_SYSTEM_PROMPT,
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

// Enhanced reply generation with validation, scoring, fallback, and guardrails
async function generateClaudeReplyEnhanced(
  customerText: string,
  fromNumber?: string,
): Promise<{
  text: string;
  model: string;
  confidence: ConfidenceScore;
  fallbackUsed: boolean;
  metadata: ParsingMetadata;
} | null> {
  // Step 1: Check for spam and repeated messages
  const spamAnalysis = detectSpam(customerText);
  if (spamAnalysis.isSpam && spamAnalysis.score > 0.7) {
    console.warn("[Spam Detection] Message flagged as spam:", spamAnalysis.reasons);
    return null;
  }

  // Check for repeated messages (within last 3600 seconds)
  if (fromNumber) {
    const isRepeated = await isRepeatedMessage(fromNumber, customerText, 3600);
    if (isRepeated) {
      console.warn("[Repeated Message] Skipping duplicate message from:", fromNumber);
      return null;
    }
  }

  // Step 2: Language detection and normalization
  const arabicAnalysis = detectIraqiDialect(customerText);
  const normalizedText = normalizeArabicText(customerText);
  const languageClarity = scoreLanguageClarity(customerText);

  // Step 3: Try AI parsing
  const apiKey = getOpenAIApiKey();
  if (!apiKey) return null;

  const products = await loadBotProducts();
  const catalog = buildCatalogContext(products, normalizedText);
  const model = getOpenAIModel();

  // Build enhanced system prompt with dialect awareness
  const systemPrompt = buildIraqiReplyPrompt(
    normalizedText,
    catalog,
    {
      language: arabicAnalysis.dialect,
      spamScore: spamAnalysis.score,
      messageTimestamp: new Date(),
    },
  );

  let aiReply = await callOpenAIModel(apiKey, model, normalizedText, catalog, systemPrompt);
  let fallbackUsed = false;

  // Step 4: If AI fails, try fallback extraction
  if (!aiReply) {
    const fallback = await fallbackExtraction(customerText);
    if (fallback.confidence > 0.3 && Object.keys(fallback.extracted).length > 0) {
      fallbackUsed = true;
      aiReply = generateFallbackReply(fallback.extracted);
      console.log("[Fallback] Generated reply from extracted data:", aiReply);
    }
  }

  if (!aiReply) {
    console.warn("[Reply Generation] No reply generated (AI failed, fallback insufficient)");
    return null;
  }

  // Step 5: Calculate confidence score
  const mockProduct: ParsedProduct = {
    title: customerText.substring(0, 100),
    images: [],
    confidence: 0,
    validationErrors: [],
    normalizedKeywords: extractArabicKeywords(normalizedText),
  };

  const confidenceScore = scoreProductParsing(
    { text: customerText, type: "text", fromNumber },
    mockProduct,
    {
      language: arabicAnalysis.dialect,
      spamScore: spamAnalysis.score,
      messageTimestamp: new Date(),
      fallback_used: fallbackUsed,
    },
  );

  // Step 6: Apply guardrails
  const guardrailConfig: GuardrailConfig = {
    prevent_price_hallucination: true,
    prevent_availability_hallucination: true,
    prevent_merchant_hallucination: true,
    uncertain_threshold: 0.5,
  };

  const guardrailed = applyGuardrails(aiReply, confidenceScore, guardrailConfig);
  const sanitized = sanitizeReplyForWhatsApp(guardrailed.reply);

  // Step 7: Build metadata
  const metadata: ParsingMetadata = {
    language: arabicAnalysis.dialect,
    spamScore: spamAnalysis.score,
    messageTimestamp: new Date(),
    ai_provider: "openai",
    ai_model: model,
    parsing_version: "v2",
    confidence_score: confidenceScore.overall,
    confidence_reasons: confidenceScore.reasons,
    fallback_used: fallbackUsed,
    raw_ai_response: aiReply,
  };

  return {
    text: sanitized,
    model,
    confidence: confidenceScore,
    fallbackUsed,
    metadata,
  };
}

// Store parsing metadata for analytics and debugging
async function storeParsingMetadata(
  webhookEventId: string,
  metadata: ParsingMetadata,
  confidenceScore?: ConfidenceScore,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("product_parsing_metadata").insert({
      webhook_event_id: webhookEventId,
      ai_provider: metadata.ai_provider,
      ai_model: metadata.ai_model,
      parsing_version: metadata.parsing_version,
      confidence_score: metadata.confidence_score,
      confidence_reasons: metadata.confidence_reasons,
      fallback_used: metadata.fallback_used,
      raw_ai_response: metadata.raw_ai_response,
      language_detected: metadata.language,
      spam_score: metadata.spamScore,
      created_at: new Date().toISOString(),
    } as never);

    if (error) {
      console.error("[Metadata Storage] Failed to store parsing metadata:", error);
    }
  } catch (err) {
    console.error("[Metadata Storage] Unexpected error:", err);
  }
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
        let enhancedResult: Awaited<ReturnType<typeof generateClaudeReplyEnhanced>> | null = null;
        let sendResult: Awaited<ReturnType<typeof sendWhatsAppText>> | null = null;

        // Generate reply with enhanced validation, scoring, and fallback
        if (incoming.from && incoming.text) {
          enhancedResult = await generateClaudeReplyEnhanced(incoming.text, incoming.from);
          if (enhancedResult) {
            sendResult = await sendWhatsAppText(incoming.from, enhancedResult.text);
            if (!sendResult.ok) {
              console.error("[WhatsApp webhook] Failed to send reply", sendResult);
            }
          }
        }

        // Store enhanced metadata (async, doesn't block response)
        let webhookEventId: string | undefined;

        const payloadForStorage = {
          ...(payload && typeof payload === "object"
            ? (payload as Record<string, unknown>)
            : { raw: payload }),
          botly_ai: {
            provider: "openai",
            model: enhancedResult?.model ?? getOpenAIModel(),
            incoming_type: incoming.type,
            replied: Boolean(enhancedResult),
            sent: Boolean(sendResult?.ok),
            confidence_score: enhancedResult?.confidence.overall,
            fallback_used: enhancedResult?.fallbackUsed,
            language: enhancedResult?.metadata.language,
          },
        };

        const summary = readWebhookSummary(payload);
        const { data: insertedData, error } = await supabaseAdmin
          .from("whatsapp_webhook_events")
          .insert({
            source: summary.source,
            event_type: summary.eventType,
            phone_number_id: summary.phoneNumberId,
            wa_message_id: summary.waMessageId,
            from_number: summary.fromNumber,
            payload: payloadForStorage as Json,
            product_confidence: enhancedResult?.confidence.overall,
            fallback_used: enhancedResult?.fallbackUsed,
            language_detected: enhancedResult?.metadata.language,
            spam_score: enhancedResult?.metadata.spamScore,
          })
          .select("id");

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
        } else if (insertedData && insertedData.length > 0) {
          webhookEventId = insertedData[0].id;

          // Store parsing metadata (async, non-blocking)
          if (enhancedResult?.metadata) {
            storeParsingMetadata(
              webhookEventId,
              enhancedResult.metadata,
              enhancedResult.confidence,
            ).catch((err) => {
              console.error("[WhatsApp webhook] Failed to store parsing metadata:", err);
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
