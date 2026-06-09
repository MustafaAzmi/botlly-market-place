import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

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
import {
  sendWhatsAppButtons,
  sendWhatsAppLocationRequest,
  sendWhatsAppText,
} from "@/lib/whatsapp/send.server";
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
            interactive?: { button_reply?: { id?: string; title?: string } };
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
    actionId: message?.interactive?.button_reply?.id ?? null,
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

function formatPrice(match: ProductMatch) {
  return match.price ? `${match.price} ${match.currency}` : "بدون سعر معلن";
}

type OrderDetails = {
  name?: string;
  landmark?: string;
  governorate?: string;
};

type CustomerSession = {
  customerNumber: string;
  phase?: WorkflowPhase;
  matches: ProductMatch[];
  selectedMatch?: ProductMatch | null;
  pendingIntent?: SearchIntent | null;
  customerLocation?: CustomerLocation | null;
  lastQuery?: string;
  displayedCount?: number;
  lastPromptType?: string;
  lastPromptAt?: string;
  orderDetails?: OrderDetails | null;
  createdAt: string;
  expiresAt: string;
};

type WorkflowPhase =
  | "start"
  | "awaiting_location"
  | "awaiting_product_button"
  | "awaiting_product_query"
  | "awaiting_selection"
  | "awaiting_after_selection"
  // Legacy free-text order phase (kept so in-flight sessions don't break).
  | "awaiting_customer_details"
  // Three-step order form: the bot asks one field at a time. The customer's
  // WhatsApp number is already known, so the phone is never asked.
  | "awaiting_customer_name"
  | "awaiting_customer_landmark"
  | "awaiting_customer_governorate";

type WorkflowResponse =
  | { kind: "none" }
  | { kind: "text"; body: string; guardReason?: string; duplicateWindowMinutes?: number }
  | {
      kind: "buttons";
      body: string;
      buttons: Array<{ id: string; title: string }>;
      guardReason?: string;
      duplicateWindowMinutes?: number;
    }
  | {
      kind: "location_request";
      body: string;
      fallbackButtons?: Array<{ id: string; title: string }>;
      guardReason?: string;
      duplicateWindowMinutes?: number;
    };

const ACTION_FIND_PRODUCT = "find_product";
const ACTION_ENTER_PRODUCT = "enter_product";
const ACTION_MORE_RESULTS = "more_results";
const ACTION_COMPLETE_PURCHASE = "complete_purchase";
const ACTION_MESSAGE_MERCHANT = "message_merchant";
const ACTION_NEW_SEARCH = "new_search";
const ACTION_SEARCH_ALTERNATIVE = "search_alternative";

function buttonResponse(
  body: string,
  buttons: Array<{ id: string; title: string }>,
  guardReason = "workflow_buttons",
  duplicateWindowMinutes = 10,
): WorkflowResponse {
  return { kind: "buttons", body, buttons, guardReason, duplicateWindowMinutes };
}

function textResponse(body: string, guardReason = "workflow_text"): WorkflowResponse {
  return { kind: "text", body, guardReason, duplicateWindowMinutes: 10 };
}

function startWorkflowResponse(duplicateWindowMinutes = 10): WorkflowResponse {
  return buttonResponse(
    "هلا بيك في Botly. شنو تحب تسوي؟",
    [{ id: ACTION_FIND_PRODUCT, title: "أريد منتج معين" }],
    "workflow_buttons",
    duplicateWindowMinutes,
  );
}

function notFoundResponse(): WorkflowResponse {
  return {
    kind: "buttons",
    body: "ما لكيت نفس الطلب، تحب أبحثلك عن بديل لو تبحث عن شي ثاني؟",
    buttons: [
      { id: ACTION_SEARCH_ALTERNATIVE, title: "بحث عن بديل" },
      { id: ACTION_NEW_SEARCH, title: "بحث جديد" },
    ],
    guardReason: "not_found",
    duplicateWindowMinutes: 0,
  };
}

function askForProductResponse(): WorkflowResponse {
  return textResponse("شنو المنتج الي تدور عليه؟ اكتب الاسم أو اللون أو السعر التقريبي.");
}

function locationWorkflowResponse(): WorkflowResponse {
  return {
    kind: "location_request",
    body: "حتى أطلعلك أقرب المتاجر والمنتجات، أرسل موقعك الحالي.",
    fallbackButtons: [{ id: ACTION_FIND_PRODUCT, title: "أرسل موقعك" }],
    guardReason: "request_location",
    duplicateWindowMinutes: 60,
  };
}

function enterProductButtonResponse(): WorkflowResponse {
  return buttonResponse("تمام، وصلتني موقعك. اضغط الزر واكتب اسم المنتج المطلوب.", [
    { id: ACTION_ENTER_PRODUCT, title: "اكتب اسم المنتج" },
  ]);
}

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
    phase: (getString(payload.phase) as WorkflowPhase) || "start",
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
    lastQuery: getString(payload.lastQuery) || undefined,
    displayedCount: getNumber(payload.displayedCount) ?? 3,
    lastPromptType: getString(payload.lastPromptType) || undefined,
    lastPromptAt: getString(payload.lastPromptAt) || undefined,
    orderDetails:
      payload.orderDetails && typeof payload.orderDetails === "object"
        ? (payload.orderDetails as OrderDetails)
        : null,
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
  phase: WorkflowPhase = "start",
  lastQuery?: string,
  orderDetails?: OrderDetails | null,
) {
  const now = Date.now();
  await appendEvent("botly_customer_session", {
    customerNumber,
    phase,
    matches: matches.slice(0, 10),
    selectedMatch: selectedMatch ?? null,
    pendingIntent: pendingIntent ?? null,
    customerLocation: customerLocation ?? null,
    lastQuery: lastQuery ?? null,
    displayedCount,
    lastPromptType: prompt?.type ?? null,
    lastPromptAt: prompt?.at ?? null,
    orderDetails: orderDetails ?? null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
  }).catch((error) => console.error("[Session] Failed to store customer session", error));
}

async function findLastKnownLocation(customerNumber: string): Promise<CustomerLocation | null> {
  const rows = await listEvents("botly_customer_session", 200);
  for (const row of rows) {
    const payload = row.payload ?? {};
    if (getString(payload.customerNumber) !== customerNumber) continue;
    const loc = payload.customerLocation;
    if (loc && typeof loc === "object") {
      const candidate = loc as Partial<CustomerLocation>;
      if (typeof candidate.latitude === "number" && typeof candidate.longitude === "number") {
        return { latitude: candidate.latitude, longitude: candidate.longitude };
      }
    }
  }
  return null;
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

function formatWorkflowSearchResults(matches: ProductMatch[], hasMore = false, startIndex = 0) {
  if (matches.length === 0) return "ما لكيت منتج مطابق قريب منك حالياً.";

  const lines = matches.slice(0, 3).map((match, index) => {
    const color = match.color ? `، ${match.color}` : "";
    const distance =
      typeof match.distanceKm === "number" ? `، يبعد ${match.distanceKm.toFixed(1)} كم` : "";
    const source = match.source === "manual" ? "المتجر" : "منشور سوشيال";
    return `${startIndex + index + 1}. ${match.title}${color}\n${formatPrice(match)} - ${match.storeName}${distance} - ${source}`;
  });

  const more = hasMore ? "\nإذا تريد نتائج أكثر اضغط المزيد." : "";
  return `${lines.join("\n\n")}${more}\n\nاختار رقم المنتج حتى أكمله.`;
}

function selectionButtons(matches: ProductMatch[], startIndex = 0, hasMore = false) {
  const buttons = matches.slice(0, 3).map((_, index) => ({
    id: `select_${startIndex + index}`,
    title: `اختيار ${startIndex + index + 1}`,
  }));
  if (hasMore && buttons.length < 3) buttons.push({ id: ACTION_MORE_RESULTS, title: "المزيد" });
  return buttons;
}

function parseSelection(text: string, matches: ProductMatch[]) {
  const normalized = normalizeArabicText(text).toLowerCase();
  const digitMatch = normalized.match(/\b([1-9]|10)\b/);
  if (digitMatch) {
    const index = Number(digitMatch[1]) - 1;
    return matches[index] ?? null;
  }
  return null;
}

function selectionFromAction(actionId: string | null, matches: ProductMatch[]) {
  const match = actionId?.match(/^select_(\d+)$/);
  if (!match) return null;
  return matches[Number(match[1])] ?? null;
}

function afterSelectionResponse(match: ProductMatch): WorkflowResponse {
  return buttonResponse(
    `اختيرت: ${match.title}\nالسعر: ${formatPrice(match)}\nالمتجر: ${match.storeName}\nشنو تحب تسوي؟`,
    [
      { id: ACTION_COMPLETE_PURCHASE, title: "اكمال الشراء" },
      { id: ACTION_MESSAGE_MERCHANT, title: "رسالة للتاجر" },
    ],
    "after_selection",
  );
}

async function sendPurchaseDetails(customerNumber: string, match: ProductMatch, details: string) {
  const body = [
    "Botly: طلب شراء جديد",
    `المنتج: ${match.title}`,
    `السعر: ${formatPrice(match)}`,
    `المتجر: ${match.storeName}`,
    `رقم الزبون: ${customerNumber}`,
    `معلومات الزبون: ${details}`,
  ].join("\n");

  const recipient = match.deliveryPhone || match.merchantWhatsapp;
  if (!recipient) return { ok: false, status: 0, error: "Missing recipient" };
  const result = await sendWhatsAppText(recipient, body);

  await appendEvent("botly_order", {
    orderId: crypto.randomUUID(),
    merchantId: match.merchantId,
    productId: match.id,
    customerNumber,
    deliveryPhone: match.deliveryPhone,
    merchantWhatsapp: match.merchantWhatsapp,
    status: result.ok
      ? match.deliveryPhone
        ? "sent_to_delivery"
        : "sent_to_merchant"
      : "notification_failed",
    customerDetails: details,
    createdAt: new Date().toISOString(),
  }).catch((error) => console.error("[Order] Failed to record order", error));

  return result;
}

async function handleButtonWorkflow(
  customerNumber: string,
  customerText: string,
  customerLocation: CustomerLocation | null,
  actionId: string | null,
): Promise<WorkflowResponse> {
  const existingSession = await readCustomerSession(customerNumber);
  const phase = existingSession?.phase ?? "start";
  const knownLocation =
    customerLocation ??
    existingSession?.customerLocation ??
    (await findLastKnownLocation(customerNumber));

  if (!existingSession || actionId === ACTION_NEW_SEARCH) {
    if (knownLocation) {
      await writeCustomerSession(
        customerNumber,
        [],
        null,
        null,
        knownLocation,
        3,
        null,
        "awaiting_product_query",
      );
      return askForProductResponse();
    }
    await writeCustomerSession(customerNumber, [], null, null, null, 3, null, "start");
    return startWorkflowResponse();
  }

  if (actionId === ACTION_SEARCH_ALTERNATIVE) {
    await writeCustomerSession(
      customerNumber,
      [],
      null,
      existingSession.pendingIntent ?? null,
      knownLocation,
      3,
      null,
      "awaiting_product_query",
      existingSession.lastQuery,
    );
    return textResponse("تمام، اكتب اسم المنتج البديل الي تدور عليه.");
  }

  if (actionId === ACTION_FIND_PRODUCT || phase === "start") {
    if (knownLocation) {
      await writeCustomerSession(
        customerNumber,
        [],
        null,
        null,
        knownLocation,
        3,
        null,
        "awaiting_product_query",
      );
      return askForProductResponse();
    }
    await writeCustomerSession(
      customerNumber,
      [],
      null,
      null,
      null,
      3,
      {
        type: "share_location",
        at: new Date().toISOString(),
      },
      "awaiting_location",
    );
    return locationWorkflowResponse();
  }

  if (phase === "awaiting_location") {
    if (!knownLocation) return locationWorkflowResponse();
    await writeCustomerSession(
      customerNumber,
      [],
      null,
      null,
      knownLocation,
      3,
      null,
      "awaiting_product_button",
    );
    return enterProductButtonResponse();
  }

  if (customerLocation) {
    await writeCustomerSession(
      customerNumber,
      existingSession.matches,
      existingSession.selectedMatch ?? null,
      existingSession.pendingIntent ?? null,
      customerLocation,
      existingSession.displayedCount ?? 3,
      null,
      "awaiting_product_button",
      existingSession.lastQuery,
    );
    return enterProductButtonResponse();
  }

  if (phase === "awaiting_product_button") {
    if (actionId === ACTION_ENTER_PRODUCT) {
      await writeCustomerSession(
        customerNumber,
        existingSession.matches,
        null,
        existingSession.pendingIntent ?? null,
        existingSession.customerLocation ?? null,
        3,
        null,
        "awaiting_product_query",
      );
      return textResponse(
        "اكتب اسم المنتج أو وصفه، مثل: تيشيرت أبيض سادة، قاعدة موبايل ايفون، لصقة شاشة هواوي.",
      );
    }
    if (!customerText) return enterProductButtonResponse();
  }

  if (phase === "awaiting_product_query" || (phase === "awaiting_product_button" && customerText)) {
    const query = customerText.trim();
    if (query.length < 2) return textResponse("اكتب اسم المنتج بشكل أوضح حتى أقدر أبحث عنه.");

    const intent = await extractSearchIntent(query);
    const matches = await searchProducts(intent, 10, {
      customerLocation: existingSession.customerLocation,
      radiusKm: 15,
      limit: 10,
    });
    const visible = matches.slice(0, 3);
    await writeCustomerSession(
      customerNumber,
      matches,
      null,
      intent,
      existingSession.customerLocation ?? null,
      visible.length,
      null,
      "awaiting_selection",
      query,
    );
    if (visible.length === 0) {
      return notFoundResponse();
    }
    return buttonResponse(
      formatWorkflowSearchResults(visible, matches.length > visible.length),
      selectionButtons(visible, 0, matches.length > visible.length),
      "search_results",
    );
  }

  if (phase === "awaiting_selection") {
    if (actionId === ACTION_MORE_RESULTS) {
      const start = existingSession.displayedCount ?? 3;
      const next = Math.min(start + 3, existingSession.matches.length);
      const extraMatches = existingSession.matches.slice(start, next);
      if (extraMatches.length === 0) {
        return notFoundResponse();
      }
      await writeCustomerSession(
        customerNumber,
        existingSession.matches,
        null,
        existingSession.pendingIntent ?? null,
        existingSession.customerLocation ?? null,
        next,
        null,
        "awaiting_selection",
        existingSession.lastQuery,
      );
      return buttonResponse(
        formatWorkflowSearchResults(extraMatches, existingSession.matches.length > next, start),
        selectionButtons(extraMatches, start, existingSession.matches.length > next),
        "search_results_more",
      );
    }

    const selected =
      selectionFromAction(actionId, existingSession.matches) ??
      parseSelection(customerText, existingSession.matches);
    if (!selected) {
      return buttonResponse(
        "اختار منتج من النتائج حتى أكمله.",
        selectionButtons(
          existingSession.matches.slice(0, Math.min(existingSession.displayedCount ?? 3, 3)),
          0,
          existingSession.matches.length > (existingSession.displayedCount ?? 3),
        ),
      );
    }

    await writeCustomerSession(
      customerNumber,
      existingSession.matches,
      selected,
      existingSession.pendingIntent ?? null,
      existingSession.customerLocation ?? null,
      existingSession.displayedCount ?? 3,
      null,
      "awaiting_after_selection",
      existingSession.lastQuery,
    );
    return afterSelectionResponse(selected);
  }

  if (phase === "awaiting_after_selection") {
    const selected = existingSession.selectedMatch ?? null;
    if (!selected) return startWorkflowResponse();
    if (actionId === ACTION_MESSAGE_MERCHANT) {
      await notifyMerchantOfSelection(customerNumber, selected);
      await writeCustomerSession(
        customerNumber,
        [],
        null,
        null,
        existingSession.customerLocation ?? null,
        3,
        null,
        "start",
      );
      return buttonResponse("تم، رسالت معلومات اهتمامك للتاجر. تحب تبحث عن منتج ثاني؟", [
        { id: ACTION_NEW_SEARCH, title: "بحث جديد" },
      ]);
    }
    if (actionId === ACTION_COMPLETE_PURCHASE) {
      await writeCustomerSession(
        customerNumber,
        existingSession.matches,
        selected,
        existingSession.pendingIntent ?? null,
        existingSession.customerLocation ?? null,
        existingSession.displayedCount ?? 3,
        null,
        "awaiting_customer_name",
        existingSession.lastQuery,
        {},
      );
      // Three-step order form starts here. The customer's WhatsApp number is
      // forwarded with the order automatically, so we never ask for a phone.
      return textResponse("تمام! حتى نكمل الطلب،\n1️⃣ شنو اسمك الكامل؟");
    }
    return afterSelectionResponse(selected);
  }

  // Legacy phase from older sessions: restart it as the new step-by-step form.
  if (phase === "awaiting_customer_details") {
    const selected = existingSession.selectedMatch ?? null;
    if (!selected) return startWorkflowResponse();
    await writeCustomerSession(
      customerNumber,
      existingSession.matches,
      selected,
      existingSession.pendingIntent ?? null,
      existingSession.customerLocation ?? null,
      existingSession.displayedCount ?? 3,
      null,
      "awaiting_customer_name",
      existingSession.lastQuery,
      {},
    );
    return textResponse("تمام! حتى نكمل الطلب،\n1️⃣ شنو اسمك الكامل؟");
  }

  if (phase === "awaiting_customer_name") {
    const selected = existingSession.selectedMatch ?? null;
    if (!selected) return startWorkflowResponse();
    const name = customerText.trim();
    if (name.length < 2) {
      return textResponse("اكتب اسمك الكامل من فضلك.");
    }
    await writeCustomerSession(
      customerNumber,
      existingSession.matches,
      selected,
      existingSession.pendingIntent ?? null,
      existingSession.customerLocation ?? null,
      existingSession.displayedCount ?? 3,
      null,
      "awaiting_customer_landmark",
      existingSession.lastQuery,
      { ...existingSession.orderDetails, name },
    );
    return textResponse(`شكراً ${name} 🌟\n2️⃣ شنو أقرب نقطة دالة على موقعك؟ (مثلاً: جامع، مدرسة، شارع معروف)`);
  }

  if (phase === "awaiting_customer_landmark") {
    const selected = existingSession.selectedMatch ?? null;
    if (!selected) return startWorkflowResponse();
    const landmark = customerText.trim();
    if (landmark.length < 2) {
      return textResponse("اكتب أقرب نقطة دالة من فضلك (مثلاً: جامع، مدرسة، شارع معروف).");
    }
    await writeCustomerSession(
      customerNumber,
      existingSession.matches,
      selected,
      existingSession.pendingIntent ?? null,
      existingSession.customerLocation ?? null,
      existingSession.displayedCount ?? 3,
      null,
      "awaiting_customer_governorate",
      existingSession.lastQuery,
      { ...existingSession.orderDetails, landmark },
    );
    return textResponse("ممتاز 👍\n3️⃣ شنو المحافظة؟");
  }

  if (phase === "awaiting_customer_governorate") {
    const selected = existingSession.selectedMatch ?? null;
    if (!selected) return startWorkflowResponse();
    const governorate = customerText.trim();
    if (governorate.length < 2) {
      return textResponse("اكتب اسم المحافظة من فضلك.");
    }
    const details = [
      `الاسم: ${existingSession.orderDetails?.name ?? "غير مذكور"}`,
      `أقرب نقطة دالة: ${existingSession.orderDetails?.landmark ?? "غير مذكورة"}`,
      `المحافظة: ${governorate}`,
    ].join(" | ");
    const result = await sendPurchaseDetails(customerNumber, selected, details);
    await writeCustomerSession(
      customerNumber,
      [],
      null,
      null,
      existingSession.customerLocation ?? null,
      3,
      null,
      "start",
    );
    return buttonResponse(
      result.ok
        ? "تم استلام طلبك وإرساله للجهة المناسبة ✅\nرقم الواتساب مالتك راح يوصل للتاجر مع الطلب.\nتحب تبحث عن منتج ثاني؟"
        : "سجلت طلبك، بس صار خلل بإرسال الإشعار. جرب تراسل التاجر أو ابحث من جديد.",
      [{ id: ACTION_NEW_SEARCH, title: "بحث جديد" }],
    );
  }

  return startWorkflowResponse();
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

          let sendResult: Awaited<ReturnType<typeof sendWhatsAppText>> | null = null;
          let workflowResponse: WorkflowResponse = { kind: "none" };

          const isCustomerMessage =
            Boolean(incoming.from) && summary.eventType.startsWith("message.");

          if (isCustomerMessage && incoming.from) {
            try {
              workflowResponse = await handleButtonWorkflow(
                incoming.from,
                incoming.text,
                incoming.location,
                incoming.actionId,
              );
              console.log("[Webhook] Workflow response:", workflowResponse.kind);
            } catch (err) {
              console.error("[Webhook] handleButtonWorkflow threw:", err);
              await writeCustomerSession(
                incoming.from,
                [],
                null,
                null,
                null,
                3,
                null,
                "start",
              ).catch(() => {});
              workflowResponse = startWorkflowResponse(0);
            }

            if (workflowResponse.kind === "none") {
              workflowResponse = startWorkflowResponse(0);
            }

            {
              const replyText = workflowResponse.body;
              try {
                const duplicateWindowMinutes = workflowResponse.duplicateWindowMinutes ?? 10;
                if (await wasOutboundReplySentRecently(incoming.from, replyText, duplicateWindowMinutes)) {
                  console.log("[Webhook] Duplicate outbound reply suppressed for:", incoming.from);
                } else {
                  await recordOutboundReply(
                    incoming.from,
                    replyText,
                    workflowResponse.guardReason ?? `workflow_${workflowResponse.kind}`,
                  );
                  if (workflowResponse.kind === "buttons") {
                    sendResult = await sendWhatsAppButtons(
                      incoming.from,
                      replyText,
                      workflowResponse.buttons,
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
                  } else if (workflowResponse.kind === "location_request") {
                    sendResult = await sendWhatsAppLocationRequest(
                      incoming.from,
                      replyText,
                      summary.phoneNumberId,
                    );
                    if (!sendResult.ok) {
                      console.warn("[Webhook] Location request failed, falling back:", sendResult);
                      if (workflowResponse.fallbackButtons?.length) {
                        sendResult = await sendWhatsAppButtons(
                          incoming.from,
                          `${replyText}\nإذا ما ظهر زر مشاركة الموقع، أرسل اللوكيشن من زر المرفقات في واتساب.`,
                          workflowResponse.fallbackButtons,
                          summary.phoneNumberId,
                        );
                      } else {
                        sendResult = await sendWhatsAppText(
                          incoming.from,
                          `${replyText}\nإذا ما ظهر زر مشاركة الموقع، أرسل اللوكيشن من زر المرفقات في واتساب.`,
                          summary.phoneNumberId,
                        );
                      }
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
            }
          } else {
            console.log("[Webhook] No customer message — status update, skipping reply");
          }

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: jsonHeaders,
          });
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
