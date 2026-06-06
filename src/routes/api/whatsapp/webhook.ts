import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

import OpenAI from "openai";

import {
  detectIraqiDialect,
  normalizeArabicText,
  extractArabicKeywords,
} from "@/lib/whatsapp/iraqi-arabic";
import { detectSpam, isRepeatedMessage } from "@/lib/whatsapp/spam-detector";
import { scoreProductParsing } from "@/lib/whatsapp/confidence-scoring";
import { fallbackExtraction } from "@/lib/whatsapp/fallback-extraction";
import {
  buildIraqiReplyPrompt,
  applyGuardrails,
  sanitizeReplyForWhatsApp,
  generateFallbackReply,
  type GuardrailConfig,
} from "@/lib/whatsapp/reply-generator";
import type { ConfidenceScore, ParsingMetadata, ParsedProduct } from "@/lib/whatsapp/types";
import { extractSearchIntent, searchProducts, type ProductMatch } from "@/lib/whatsapp/search";
import { notifyMerchantsOfLead } from "@/lib/whatsapp/notifications";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";

const textHeaders = { "content-type": "text/plain; charset=utf-8" };
const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function getVerifyToken() {
  return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? process.env.BOTLY_WHATSAPP_VERIFY_TOKEN;
}

function getAppSecret() {
  return process.env.WHATSAPP_APP_SECRET ?? process.env.META_OAUTH_APP_SECRET;
}

function getOpenAIApiKey() {
  return process.env.OPENAI_API_KEY;
}

function getOpenAIModel() {
  return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
}

function getAnthropicApiKey() {
  return process.env.ANTHROPIC_API_KEY;
}

function getAnthropicModel() {
  return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
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
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyMetaSignature(request: Request, rawBody: string) {
  const appSecret = getAppSecret();
  if (!appSecret) {
    console.log("[Webhook] No app secret — skipping signature check");
    return true;
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature?.startsWith("sha256=")) {
    console.warn("[Webhook] Missing x-hub-signature-256 header");
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
  const expected = `sha256=${bytesToHex(digest)}`;
  const valid = timingSafeEqual(signature, expected);
  if (!valid) {
    console.error("[Webhook] Signature mismatch — check WHATSAPP_APP_SECRET env var");
  }
  return valid;
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

const IRAQI_SYSTEM_PROMPT = `أنت مساعد بيع عراقي. كلامك عراقي طبيعي بغدادي فقط.
لازم:
- تكون مختصر جداً (سطر واحد أو اثنين فقط)
- ما تستخدم إيموجي أبداً
- ما تذكر اسم لنفسك ولا تعرّف عن نفسك
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

async function callAnthropicModel(
  apiKey: string,
  model: string,
  customerText: string,
  catalog: string,
  systemPrompt?: string,
): Promise<string | null> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        temperature: 0.3,
        system: systemPrompt || IRAQI_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `رسالة الزبون: ${customerText}\n\nكتالوج المنتجات الحقيقي:\n${catalog}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[Anthropic] Reply generation failed:", response.status, await response.text());
      return null;
    }

    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };

    return data.content?.find((part) => part.type === "text")?.text?.trim() || null;
  } catch (error) {
    console.error("[Anthropic] Reply generation failed:", error);
    return null;
  }
}

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
      max_tokens: 512,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt || IRAQI_SYSTEM_PROMPT },
        {
          role: "user",
          content: `رسالة الزبون: ${customerText}\n\nكتالوج المنتجات الحقيقي:\n${catalog}`,
        },
      ],
    });
    const text = response.choices[0]?.message?.content?.trim();
    return text || null;
  } catch (error) {
    console.error("[OpenAI] Reply generation failed:", error);
    return null;
  }
}

function buildCatalogFromMatches(matches: ProductMatch[]): string {
  if (matches.length === 0) return "لا توجد منتجات مطابقة في قاعدة البيانات.";
  return matches
    .map((m, i) => {
      const options = m.color ? `، لون ${m.color}` : "";
      const price = m.price ? `، السعر ${m.price} ${m.currency}` : "";
      return `${i + 1}. ${m.title}${price}${options}`;
    })
    .join("\n");
}

async function generateClaudeReplyEnhanced(
  customerText: string,
  fromNumber?: string,
): Promise<{
  text: string;
  model: string;
  confidence: ConfidenceScore;
  fallbackUsed: boolean;
  metadata: ParsingMetadata;
  matches: ProductMatch[];
} | null> {
  const spamAnalysis = detectSpam(customerText);
  if (spamAnalysis.isSpam && spamAnalysis.score > 0.7) {
    console.warn("[Reply] Spam detected, score:", spamAnalysis.score);
    return null;
  }

  if (fromNumber) {
    try {
      const isRepeated = await isRepeatedMessage(fromNumber, customerText, 3600);
      if (isRepeated) {
        console.warn("[Reply] Repeated message from:", fromNumber);
        return null;
      }
    } catch (err) {
      console.warn("[Reply] isRepeatedMessage check failed (non-fatal):", err);
    }
  }

  const arabicAnalysis = detectIraqiDialect(customerText);
  const normalizedText = normalizeArabicText(customerText);

  const anthropicKey = getAnthropicApiKey();
  const openAIKey = getOpenAIApiKey();

  if (!anthropicKey && !openAIKey) {
    console.error("[Reply] No ANTHROPIC_API_KEY or OPENAI_API_KEY set");
    return null;
  }

  const intent = await extractSearchIntent(customerText);
  const matches = await searchProducts(intent, 8);
  const catalog = buildCatalogFromMatches(matches);
  console.log("[Reply] Matches found:", matches.length);

  const provider = anthropicKey ? "anthropic" : "openai";
  const model = anthropicKey ? getAnthropicModel() : getOpenAIModel();
  const systemPrompt = buildIraqiReplyPrompt(normalizedText, catalog, {
    language: arabicAnalysis.dialect,
    spamScore: spamAnalysis.score,
    messageTimestamp: new Date(),
  });

  let aiReply = anthropicKey
    ? await callAnthropicModel(anthropicKey, model, normalizedText, catalog, systemPrompt)
    : await callOpenAIModel(openAIKey!, model, normalizedText, catalog, systemPrompt);

  let fallbackUsed = false;

  if (!aiReply) {
    console.warn("[Reply] AI returned null — trying fallback");
    try {
      const fallback = await fallbackExtraction(customerText);
      if (fallback.confidence > 0.3 && Object.keys(fallback.extracted).length > 0) {
        fallbackUsed = true;
        aiReply = generateFallbackReply(fallback.extracted);
        console.log("[Reply] Fallback reply:", aiReply);
      }
    } catch (err) {
      console.error("[Reply] Fallback extraction failed:", err);
    }
  }

  if (!aiReply) {
    console.warn("[Reply] No reply generated");
    return null;
  }

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

  const guardrailConfig: GuardrailConfig = {
    prevent_price_hallucination: true,
    prevent_availability_hallucination: true,
    prevent_merchant_hallucination: true,
    uncertain_threshold: 0.5,
  };

  const guardrailed = applyGuardrails(aiReply, confidenceScore, guardrailConfig);
  const sanitized = sanitizeReplyForWhatsApp(guardrailed.reply);

  const metadata: ParsingMetadata = {
    language: arabicAnalysis.dialect,
    spamScore: spamAnalysis.score,
    messageTimestamp: new Date(),
    ai_provider: provider,
    ai_model: model,
    parsing_version: "v2",
    confidence_score: confidenceScore.overall,
    confidence_reasons: confidenceScore.reasons,
    fallback_used: fallbackUsed,
    raw_ai_response: aiReply,
  };

  return { text: sanitized, model, confidence: confidenceScore, fallbackUsed, metadata, matches };
}

async function storeParsingMetadata(
  webhookEventId: string,
  metadata: ParsingMetadata,
  confidenceScore?: ConfidenceScore,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("product_parsing_metadata" as never).insert({
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
    if (error) console.error("[Storage] Parsing metadata failed:", error.message);
  } catch (err) {
    console.error("[Storage] Unexpected error storing metadata:", err);
  }
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
          console.log("[Webhook] POST received, bodyLen:", rawBody.length);

          const valid = await verifyMetaSignature(request, rawBody);
          console.log("[Webhook] Signature valid:", valid);
          if (!valid) {
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
          console.log("[Webhook] from:", incoming.from, "text:", incoming.text?.slice(0, 60));

          let enhancedResult: Awaited<ReturnType<typeof generateClaudeReplyEnhanced>> | null = null;
          let sendResult: Awaited<ReturnType<typeof sendWhatsAppText>> | null = null;

          if (incoming.from && incoming.text) {
            try {
              enhancedResult = await generateClaudeReplyEnhanced(incoming.text, incoming.from);
              console.log("[Webhook] Reply:", enhancedResult?.text?.slice(0, 80) ?? "null");
            } catch (err) {
              console.error("[Webhook] generateClaudeReplyEnhanced threw:", err);
            }

            const replyText = enhancedResult?.text ?? "أهلاً، شنو تدور؟";
            try {
              sendResult = await sendWhatsAppText(incoming.from, replyText);
              console.log("[Webhook] sendResult:", JSON.stringify(sendResult).slice(0, 200));
            } catch (err) {
              console.error("[Webhook] sendWhatsAppText threw:", err);
            }

            if (enhancedResult?.matches.length) {
              notifyMerchantsOfLead(
                incoming.from,
                incoming.text,
                enhancedResult.matches,
                sendWhatsAppText,
              ).catch((err) => console.error("[Webhook] Lead notification failed:", err));
            }
          } else {
            console.log("[Webhook] No from/text — status update or empty message, skipping reply");
          }

          const summary = readWebhookSummary(payload);
          const payloadForStorage = {
            ...(payload && typeof payload === "object"
              ? (payload as Record<string, unknown>)
              : { raw: payload }),
            botly_ai: {
              provider: enhancedResult?.metadata.ai_provider ?? "fallback",
              model:
                enhancedResult?.model ??
                (getAnthropicApiKey() ? getAnthropicModel() : getOpenAIModel()),
              incoming_type: incoming.type,
              replied: Boolean(enhancedResult) || Boolean(sendResult?.ok),
              sent: Boolean(sendResult?.ok),
              confidence_score: enhancedResult?.confidence.overall,
              fallback_used: enhancedResult?.fallbackUsed ?? !enhancedResult,
              language: enhancedResult?.metadata.language,
            },
          };

          supabaseAdmin
            .from("whatsapp_webhook_events")
            .insert({
              source: summary.source,
              event_type: summary.eventType,
              phone_number_id: summary.phoneNumberId,
              wa_message_id: summary.waMessageId,
              from_number: summary.fromNumber,
              payload: payloadForStorage as Json,
              product_confidence: enhancedResult?.confidence.overall,
              fallback_used: enhancedResult?.fallbackUsed ?? !enhancedResult,
              language_detected: enhancedResult?.metadata.language,
              spam_score: enhancedResult?.metadata.spamScore,
            } as never)
            .select("id")
            .then(({ data, error }) => {
              if (error) {
                console.error("[Storage] Event insert failed:", error.message);
                return;
              }
              const webhookEventId = data?.[0]?.id;
              if (webhookEventId && enhancedResult?.metadata) {
                storeParsingMetadata(
                  webhookEventId,
                  enhancedResult.metadata,
                  enhancedResult.confidence,
                ).catch((err) => console.error("[Storage] Metadata insert failed:", err));
              }
            })
            .catch((err) => console.error("[Storage] Event insert threw:", err));

          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
        } catch (err) {
          console.error("[Webhook] Unhandled error in POST handler:", err);
          return new Response(JSON.stringify({ ok: false, error: "Internal error" }), {
            status: 500,
            headers: jsonHeaders,
          });
        }
      },
    },
  },
});
