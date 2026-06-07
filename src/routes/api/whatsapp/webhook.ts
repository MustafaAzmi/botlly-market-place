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
import {
  extractSearchIntent,
  searchProducts,
  type CustomerLocation,
  type ProductMatch,
  type SearchIntent,
} from "@/lib/whatsapp/search";
import { sendWhatsAppButtons, sendWhatsAppText } from "@/lib/whatsapp/send.server";
import {
  appendEvent,
  getNumber,
  getString,
  listEvents,
  normalizePhone,
  sha256,
} from "@/lib/eventStore.server";

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
          metadata?: { display_phone_number?: string; phone_number_id?: string };
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
    displayPhoneNumber: value?.metadata?.display_phone_number ?? null,
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
            location?: { latitude?: number; longitude?: number };
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
    location:
      typeof message?.location?.latitude === "number" &&
      typeof message.location.longitude === "number"
        ? {
            latitude: message.location.latitude,
            longitude: message.location.longitude,
          }
        : null,
  };
}

function isCustomerStartedMessage(type: string | null) {
  return type === "text" || type === "button" || type === "interactive" || type === "location";
}

function buildLocalClarificationReply(customerText: string) {
  const text = normalizeArabicText(customerText);
  if (/^(hi|hello|hey|مرحبا|هلا|السلام|سلام|الو|alo)$/i.test(text)) {
    return "هلا بيك، اكتبلي شنو المنتج الي تريده وأدورلك عليه.";
  }
  return "ممكن توضح المنتج المطلوب؟ اكتب الاسم أو اللون أو السعر التقريبي.";
}

function formatPrice(match: ProductMatch) {
  return match.price ? `${match.price} ${match.currency}` : "بدون سعر معلن";
}

function formatSearchResults(matches: ProductMatch[], hasMore = false, startIndex = 0) {
  if (matches.length === 0) return "حالياً ما لكيت منتج مطابق. جرّب تكتب النوع أو اللون أو السعر.";

  const lines = matches.slice(0, 3).map((match, index) => {
    const color = match.color ? `، ${match.color}` : "";
    const distance =
      typeof match.distanceKm === "number" ? `، ${match.distanceKm.toFixed(1)} كم` : "";
    const sponsored = match.sponsored ? "، مميز" : "";
    return `${startIndex + index + 1}. ${match.title}${color} - ${formatPrice(match)} - ${match.storeName}${distance}${sponsored}`;
  });

  const more = hasMore ? "\nاكتب المزيد حتى أعرض نتائج أكثر." : "";
  return `${lines.join("\n")}${more}\nاكتب رقم الاختيار حتى أرتبه ويا التاجر.`;
}

function parseSelection(text: string, matches: ProductMatch[]) {
  const normalized = normalizeArabicText(text).toLowerCase();
  const digitMatch = normalized.match(/\b([1-9]|10)\b/);
  if (digitMatch) {
    const index = Number(digitMatch[1]) - 1;
    return matches[index] ?? null;
  }

  const words: Array<[RegExp, number]> = [
    [/(ال)?اول|الأول|اولا|واحد/, 0],
    [/(ال)?ثاني|اثنين|٢|2/, 1],
    [/(ال)?ثالث|ثلاثة|٣|3/, 2],
    [/(ال)?رابع|اربعة|٤|4/, 3],
    [/(ال)?خامس|خمسة|٥|5/, 4],
  ];

  for (const [pattern, index] of words) {
    if (pattern.test(normalized)) return matches[index] ?? null;
  }

  return null;
}

function wantsMerchantAddress(text: string) {
  const normalized = normalizeArabicText(text);
  return /عنوان|وين|مكان|موقع|لوكيشن|location|address/i.test(normalized);
}

function wantsToBuy(text: string) {
  const normalized = normalizeArabicText(text);
  return /اشتري|اشترى|اخذ|اريدها|اريده|احجز|اطلب|كمل|اكمل|شراء|طلب|ارسل/i.test(normalized);
}

function wantsMerchantContact(text: string) {
  const normalized = normalizeArabicText(text);
  return /رقم|تواصل|واتساب|كلم|احجي|اتصل|phone|contact/i.test(normalized);
}

function wantsMoreResults(text: string) {
  const normalized = normalizeArabicText(text);
  return /المزيد|زيادة|اكثر|أكثر|next|more/i.test(normalized);
}

function wantsWithoutLocation(text: string) {
  const normalized = normalizeArabicText(text);
  return /بدون موقع|بلا موقع|ما اريد اشارك|مااريد اشارك|no location/i.test(normalized);
}

type CustomerSession = {
  customerNumber: string;
  matches: ProductMatch[];
  selectedMatch?: ProductMatch | null;
  pendingIntent?: SearchIntent | null;
  customerLocation?: CustomerLocation | null;
  displayedCount?: number;
  lastPromptType?: string;
  lastPromptAt?: string;
  createdAt: string;
  expiresAt: string;
};

async function wasWebhookMessageProcessed(waMessageId: string | null) {
  if (!waMessageId) return false;

  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_webhook_events")
      .select("id")
      .eq("wa_message_id", waMessageId)
      .limit(1);

    if (error) {
      console.warn("[Webhook] Duplicate check failed:", error.message);
      return false;
    }
    return Boolean(data?.length);
  } catch (error) {
    console.warn("[Webhook] Duplicate check threw:", error);
    return false;
  }
}

function isRecentIso(value: string, minutes: number) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp < minutes * 60 * 1000;
}

async function wasPromptSentRecently(
  customerNumber: string,
  session: CustomerSession | null,
  promptType: string,
  minutes = 360,
) {
  if (
    session?.lastPromptType === promptType &&
    session.lastPromptAt &&
    isRecentIso(session.lastPromptAt, minutes)
  ) {
    return true;
  }

  const rows = await listEvents("botly_customer_session", 200);
  return rows.some((row) => {
    const payload = row.payload ?? {};
    return (
      getString(payload.customerNumber) === customerNumber &&
      getString(payload.lastPromptType) === promptType &&
      isRecentIso(getString(payload.lastPromptAt), minutes)
    );
  });
}

async function wasOutboundReplySentRecently(customerNumber: string, body: string, minutes = 60) {
  const recipient = normalizePhone(customerNumber);
  const bodyHash = await sha256(`${recipient}:${body}`);
  const rows = await listEvents("botly_outbound_guard", 1000);
  return rows.some((row) => {
    const payload = row.payload ?? {};
    return (
      getString(payload.recipient) === recipient &&
      getString(payload.bodyHash) === bodyHash &&
      isRecentIso(getString(payload.createdAt), minutes)
    );
  });
}

async function recordOutboundReply(customerNumber: string, body: string, reason: string) {
  const recipient = normalizePhone(customerNumber);
  await appendEvent("botly_outbound_guard", {
    recipient,
    bodyHash: await sha256(`${recipient}:${body}`),
    reason,
    preview: body.slice(0, 160),
    createdAt: new Date().toISOString(),
  }).catch((error) => console.error("[Outbound Guard] Failed to record send", error));
}

async function readCustomerSession(customerNumber: string): Promise<CustomerSession | null> {
  const rows = await listEvents("botly_customer_session");
  const now = Date.now();
  const row = rows.find((candidate) => {
    const payload = candidate.payload ?? {};
    return (
      getString(payload.customerNumber) === customerNumber &&
      new Date(getString(payload.expiresAt)).getTime() > now
    );
  });
  if (!row) return null;

  const payload = row.payload ?? {};
  const matches = Array.isArray(payload.matches) ? (payload.matches as ProductMatch[]) : [];
  const selectedMatch =
    payload.selectedMatch && typeof payload.selectedMatch === "object"
      ? (payload.selectedMatch as ProductMatch)
      : null;

  return {
    customerNumber,
    matches,
    selectedMatch,
    pendingIntent:
      payload.pendingIntent && typeof payload.pendingIntent === "object"
        ? (payload.pendingIntent as SearchIntent)
        : null,
    customerLocation:
      payload.customerLocation && typeof payload.customerLocation === "object"
        ? (payload.customerLocation as CustomerLocation)
        : null,
    displayedCount: getNumber(payload.displayedCount) ?? 3,
    lastPromptType: getString(payload.lastPromptType) || undefined,
    lastPromptAt: getString(payload.lastPromptAt) || undefined,
    createdAt: getString(payload.createdAt),
    expiresAt: getString(payload.expiresAt),
  };
}

async function writeCustomerSession(
  customerNumber: string,
  matches: ProductMatch[],
  selectedMatch?: ProductMatch | null,
  pendingIntent?: SearchIntent | null,
  customerLocation?: CustomerLocation | null,
  displayedCount = 3,
  prompt?: { type: string; at?: string } | null,
) {
  const now = Date.now();
  await appendEvent("botly_customer_session", {
    customerNumber,
    matches: matches.slice(0, 10),
    selectedMatch: selectedMatch ?? null,
    pendingIntent: pendingIntent ?? null,
    customerLocation: customerLocation ?? null,
    displayedCount,
    lastPromptType: prompt?.type ?? null,
    lastPromptAt: prompt?.at ?? null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
  }).catch((error) => console.error("[Session] Failed to store customer session", error));
}

async function notifyMerchantOfSelection(customerNumber: string, match: ProductMatch) {
  if (!match.merchantWhatsapp) return { ok: false, status: 0, error: "Missing merchant WhatsApp" };

  const body = [
    "Botly: زبون مهتم بمنتج عندك",
    `المنتج: ${match.title}`,
    `السعر: ${formatPrice(match)}`,
    `رقم الزبون: ${customerNumber}`,
    "بوتلي راح يبقى وسيط بالمحادثة لحد ما يكمل الطلب.",
  ].join("\n");

  const result = await sendWhatsAppText(match.merchantWhatsapp, body);
  await appendEvent("botly_lead", {
    leadId: crypto.randomUUID(),
    merchantId: match.merchantId,
    productId: match.id,
    customerNumber,
    customerQuery: "",
    matchedTitle: match.title,
    notified: result.ok,
    createdAt: new Date().toISOString(),
  }).catch((error) => console.error("[Lead] Failed to record lead", error));

  return result;
}

async function notifyDeliveryOfOrder(customerNumber: string, match: ProductMatch) {
  if (!match.deliveryPhone) return { ok: false, status: 0, error: "Missing delivery WhatsApp" };

  const body = [
    "Botly: طلب توصيل جديد",
    `المتجر: ${match.storeName}`,
    `المنتج: ${match.title}`,
    `السعر: ${formatPrice(match)}`,
    `رقم الزبون: ${customerNumber}`,
    match.merchantWhatsapp ? `رقم التاجر: ${match.merchantWhatsapp}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await sendWhatsAppText(match.deliveryPhone, body);
  await appendEvent("botly_order", {
    orderId: crypto.randomUUID(),
    merchantId: match.merchantId,
    productId: match.id,
    customerNumber,
    deliveryPhone: match.deliveryPhone,
    status: result.ok ? "sent_to_delivery" : "delivery_notification_failed",
    createdAt: new Date().toISOString(),
  }).catch((error) => console.error("[Order] Failed to record order", error));

  return result;
}

async function handleMarketplaceFlow(
  customerNumber: string,
  customerText: string,
  customerLocation: CustomerLocation | null,
): Promise<string | null> {
  const existingSession = await readCustomerSession(customerNumber);

  if (customerLocation && existingSession?.pendingIntent) {
    const matches = await searchProducts(existingSession.pendingIntent, 10, {
      customerLocation,
      radiusKm: 15,
      limit: 10,
    });
    await writeCustomerSession(
      customerNumber,
      matches,
      null,
      existingSession.pendingIntent,
      customerLocation,
    );
    return formatSearchResults(matches, matches.length > 3);
  }

  if (customerLocation) {
    await writeCustomerSession(
      customerNumber,
      existingSession?.matches ?? [],
      existingSession?.selectedMatch ?? null,
      existingSession?.pendingIntent ?? null,
      customerLocation,
    );
    return "وصلني موقعك. اكتب شنو المنتج الي تريده حتى أدورلك ضمن 15 كم.";
  }

  if (existingSession && wantsMoreResults(customerText)) {
    const start = existingSession.displayedCount ?? 3;
    const next = Math.min(start + 3, existingSession.matches.length);
    const extraMatches = existingSession.matches.slice(start, next);
    if (extraMatches.length === 0) return "ماكو نتائج إضافية حالياً.";
    await writeCustomerSession(
      customerNumber,
      existingSession.matches,
      existingSession.selectedMatch ?? null,
      existingSession.pendingIntent ?? null,
      existingSession.customerLocation ?? null,
      next,
    );
    return formatSearchResults(extraMatches, existingSession.matches.length > next, start);
  }

  if (existingSession?.pendingIntent && wantsWithoutLocation(customerText)) {
    const matches = await searchProducts(existingSession.pendingIntent, 10, { limit: 10 });
    await writeCustomerSession(customerNumber, matches, null, existingSession.pendingIntent, null);
    return formatSearchResults(matches, matches.length > 3);
  }

  const selectedFromSession = existingSession
    ? parseSelection(customerText, existingSession.matches) ?? existingSession.selectedMatch ?? null
    : null;

  if (selectedFromSession && wantsMerchantAddress(customerText)) {
    return selectedFromSession.merchantAddress
      ? `عنوان ${selectedFromSession.storeName}: ${selectedFromSession.merchantAddress}`
      : "ما مسجل عنوان واضح لهذا التاجر حالياً. أكدر أخلي التاجر يتواصل وياك.";
  }

  if (selectedFromSession && wantsMerchantContact(customerText)) {
    await notifyMerchantOfSelection(customerNumber, selectedFromSession);
    await writeCustomerSession(
      customerNumber,
      existingSession?.matches ?? [],
      selectedFromSession,
      existingSession?.pendingIntent ?? null,
      existingSession?.customerLocation ?? null,
    );
    return "تمام، بلغت التاجر بالطلب ورقمك. إذا تريد تكمل شراء اكتب: أكمل الطلب.";
  }

  if (selectedFromSession && wantsToBuy(customerText)) {
    await notifyMerchantOfSelection(customerNumber, selectedFromSession);
    if (selectedFromSession.deliveryPhone) {
      await notifyDeliveryOfOrder(customerNumber, selectedFromSession);
      return "تم، ثبتت اهتمامك بالمنتج وبلغت التاجر وشركة التوصيل. راح يتابعون وياك.";
    }
    return "تم، ثبتت اهتمامك بالمنتج وبلغت التاجر. راح يتواصل وياك على واتساب.";
  }

  if (selectedFromSession) {
    await writeCustomerSession(
      customerNumber,
      existingSession?.matches ?? [],
      selectedFromSession,
      existingSession?.pendingIntent ?? null,
      existingSession?.customerLocation ?? null,
    );
    return `اختيارك: ${selectedFromSession.title} - ${formatPrice(selectedFromSession)} من ${selectedFromSession.storeName}\nتحب أبلغ التاجر أو أكمل الطلب؟`;
  }

  const intent = await extractSearchIntent(customerText);
  if (!existingSession?.customerLocation) {
    if (await wasPromptSentRecently(customerNumber, existingSession, "share_location", 360)) {
      console.log("[Webhook] Suppressing repeated location prompt for:", customerNumber);
      return null;
    }
    await writeCustomerSession(customerNumber, [], null, intent, null, 3, {
      type: "share_location",
      at: new Date().toISOString(),
    });
    return "حتى أطلعلك أقرب النتائج، شارك موقعك وأدورلك ضمن 15 كم. إذا ما تريد تشارك الموقع اكتب: بدون موقع.";
  }

  const matches = await searchProducts(intent, 10, {
    customerLocation: existingSession.customerLocation,
    radiusKm: 15,
    limit: 10,
  });
  await writeCustomerSession(customerNumber, matches, null, intent, existingSession.customerLocation);
  return formatSearchResults(matches, matches.length > 3);
}

function latestEventRowsByMerchant(rows: Awaited<ReturnType<typeof listEvents>>) {
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const merchantId = getString(row.payload?.merchantId) || row.id;
    if (!latest.has(merchantId)) latest.set(merchantId, row);
  }
  return [...latest.values()];
}

function phoneVariants(phone: string | null) {
  const normalized = normalizePhone(phone ?? "").replace(/^\+/, "");
  const variants = new Set<string>();
  if (!normalized) return variants;
  variants.add(normalized);
  if (normalized.startsWith("0") && normalized.length >= 10) {
    variants.add(`964${normalized.slice(1)}`);
  }
  return variants;
}

function merchantMatchesWhatsAppNumber(
  payload: Record<string, unknown>,
  phoneNumberId: string | null,
  displayPhoneNumber: string | null,
) {
  if (phoneNumberId) {
    const storedPhoneNumberIds = [
      getString(payload.whatsappPhoneNumberId),
      getString(payload.phoneNumberId),
      getString(payload.metaPhoneNumberId),
      getString(payload.whatsappBusinessPhoneNumberId),
    ].filter(Boolean);
    if (storedPhoneNumberIds.includes(phoneNumberId)) return true;
  }

  if (displayPhoneNumber) {
    const displayVariants = phoneVariants(displayPhoneNumber);
    const merchantVariants = phoneVariants(
      getString(payload.whatsappNormalized) || getString(payload.whatsapp),
    );
    for (const display of displayVariants) {
      if (merchantVariants.has(display)) return true;
    }
  }

  return false;
}

async function resolveMerchantForWebhook(
  phoneNumberId: string | null,
  displayPhoneNumber: string | null,
) {
  const merchants = latestEventRowsByMerchant(await listEvents("botly_merchant"));
  const matched = merchants.find((row) =>
    merchantMatchesWhatsAppNumber(row.payload ?? {}, phoneNumberId, displayPhoneNumber),
  );
  if (!matched) return null;

  const payload = matched.payload ?? {};
  if (payload.bannedFromBot === true || payload.visibilityEnabled === false || payload.isActive === false) {
    return null;
  }

  return getString(payload.merchantId) || matched.id;
}

const IRAQI_SYSTEM_PROMPT = `أنت مساعد بيع عراقي. كلامك عراقي طبيعي بغدادي فقط.
لازم:
- تكون مختصر جداً (سطر واحد أو اثنين فقط)
- ما تستخدم إيموجي أبداً
- ما تذكر اسم لنفسك ولا تعرّف عن نفسك
- ما تستخدم كلام رسمي أو تسويقي
- ترد على الزبون بطريقة طبيعية زي الشات العراقي
- تعتمد على الكتالوج الحقيقي فقط

إذا ما حصلت البضاعة، قول: "نعتذر منك طلبك مو متوفر حاليا" 
إذا ما فهمت شنو يدور، قول: "ممكن توضح المنتج المطلوب؟ اكتب الاسم أو اللون أو السعر التقريبي."

أمثلة ردود صحيحة:
- "موجودة، السعر 50 ألف"
- "نفذت حاليا"
- "تحب أي لون أو سعر تقريبي؟"
- "هذني الأنواع الموجودة..."
`;

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
  merchantId: string,
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
  const matches = await searchProducts(intent, 8, merchantId);
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

          const summary = readWebhookSummary(payload);
          const incoming = readIncomingMessage(payload);
          console.log(
            "[Webhook] from:",
            incoming.from,
            "phone_number_id:",
            summary.phoneNumberId,
            "display_phone_number:",
            summary.displayPhoneNumber,
            "text:",
            incoming.text?.slice(0, 60),
          );

          if (
            summary.eventType.startsWith("message.") &&
            (await wasWebhookMessageProcessed(summary.waMessageId))
          ) {
            console.log("[Webhook] Duplicate message ignored:", summary.waMessageId);
            return new Response(JSON.stringify({ ok: true, duplicate: true }), {
              status: 200,
              headers: jsonHeaders,
            });
          }

          let enhancedResult: Awaited<ReturnType<typeof generateClaudeReplyEnhanced>> | null = null;
          let sendResult: Awaited<ReturnType<typeof sendWhatsAppText>> | null = null;
          let marketplaceReply: string | null = null;

          if (
            incoming.from &&
            (incoming.text || incoming.location) &&
            isCustomerStartedMessage(incoming.type)
          ) {
            try {
              marketplaceReply = await handleMarketplaceFlow(
                incoming.from,
                incoming.text,
                incoming.location,
              );
              console.log("[Webhook] Marketplace reply:", marketplaceReply?.slice(0, 120) ?? "null");
            } catch (err) {
              console.error("[Webhook] handleMarketplaceFlow threw:", err);
            }

            if (marketplaceReply) {
              const replyText = marketplaceReply;
              try {
                const duplicateWindowMinutes = marketplaceReply.includes("ضمن 15 كم") ? 360 : 60;
                if (await wasOutboundReplySentRecently(incoming.from, replyText, duplicateWindowMinutes)) {
                  console.log("[Webhook] Duplicate outbound reply suppressed for:", incoming.from);
                } else {
                  await recordOutboundReply(
                    incoming.from,
                    replyText,
                    marketplaceReply.includes("ضمن 15 كم")
                      ? "share_location_prompt"
                      : "marketplace_reply",
                  );
                  if (marketplaceReply.includes("اكتب المزيد")) {
                    sendResult = await sendWhatsAppButtons(
                      incoming.from,
                      replyText,
                      [{ id: "more_results", title: "المزيد" }],
                      summary.phoneNumberId,
                    );
                    if (!sendResult.ok) {
                      console.warn("[Webhook] Button send failed, falling back to text:", sendResult);
                      sendResult = await sendWhatsAppText(
                        incoming.from,
                        replyText,
                        summary.phoneNumberId,
                      );
                    }
                  } else {
                    sendResult = await sendWhatsAppText(
                      incoming.from,
                      replyText,
                      summary.phoneNumberId,
                    );
                  }
                }
                console.log("[Webhook] sendResult:", JSON.stringify(sendResult).slice(0, 200));
              } catch (err) {
                console.error("[Webhook] sendWhatsAppText threw:", err);
              }
            } else {
              console.log("[Webhook] Marketplace flow returned no reply; skipping outbound send");
            }
          } else {
            console.log(
              "[Webhook] No customer-started message — status update or unsupported message, skipping reply",
            );
          }

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
