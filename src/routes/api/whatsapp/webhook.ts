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
  type ProductMatch,
  type SearchIntent,
} from "@/lib/whatsapp/search";
import {
  downloadWhatsAppImage,
  extractImageSearchIntent,
} from "@/lib/whatsapp/image-search.server";
import {
  sendWhatsAppButtons,
  sendWhatsAppImage,
  sendWhatsAppText,
} from "@/lib/whatsapp/send.server";
import {
  appendEvent,
  getNumber,
  getString,
  listEvents,
  listEventsByPayloadField,
  normalizePhone,
  phoneKey,
  sha256,
} from "@/lib/eventStore.server";

const textHeaders = { "content-type": "text/plain; charset=utf-8" };
const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function getVerifyToken() {
  return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? process.env.BOTLY_WHATSAPP_VERIFY_TOKEN;
}

function getAppSecret() {
  return process.env.WHATSAPP_APP_SECRET;
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
            audio?: { id?: string; voice?: boolean };
            image?: { id?: string; caption?: string };
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
    // Voice notes and audio files both arrive as type "audio" with a media id.
    audioId: message?.type === "audio" ? (message.audio?.id ?? null) : null,
    // Product photos: the media id plus the customer's optional caption
    // ("لايت جارجر 2017") drive the image search flow.
    imageId: message?.type === "image" ? (message.image?.id ?? null) : null,
    imageCaption: message?.type === "image" ? (message.image?.caption ?? "").trim() : "",
    text: text.trim(),
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
  lastQuery?: string;
  displayedCount?: number;
  lastPromptType?: string;
  lastPromptAt?: string;
  orderDetails?: OrderDetails | null;
  createdAt: string;
  expiresAt: string;
};

type WorkflowPhase =
  | "awaiting_product_query"
  | "awaiting_selection"
  | "awaiting_after_selection"
  | "awaiting_address_confirmation"
  // Three-step order form (only when customer chooses "change address")
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
    };

const ACTION_FIND_PRODUCT = "find_product";
const ACTION_MORE_RESULTS = "more_results";
const ACTION_COMPLETE_PURCHASE = "complete_purchase";
const ACTION_MESSAGE_MERCHANT = "message_merchant";
const ACTION_NEW_SEARCH = "new_search";
const ACTION_SEARCH_ALTERNATIVE = "search_alternative";
const ACTION_CONFIRM_ORDER = "merchant_confirm_order";
const ACTION_PRODUCT_OUT_OF_STOCK = "merchant_product_out_of_stock";
const ACTION_MISSING_AVAILABLE = "missing_product_available";
const ACTION_MISSING_MERCHANT_SOLD = "missing_product_sold";
const ACTION_MISSING_MERCHANT_NOT_PURCHASED = "missing_product_not_purchased";
const ACTION_MISSING_REQUESTER_PURCHASED = "missing_requester_purchased";
const ACTION_MISSING_REQUESTER_NOT_PURCHASED = "missing_requester_not_purchased";

function toWhatsAppRecipient(phone: string): string {
  return normalizePhone(phone).replace(/^\+/, "");
}

function normalizeMediatorPhones(values: string[]): string[] {
  const seen = new Set<string>();
  const phones: string[] = [];
  for (const value of values) {
    const phone = value.trim();
    if (!phone) continue;
    const key = phoneKey(phone);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    phones.push(phone);
  }
  return phones;
}

type MediatorContact = {
  phone: string;
  city: string;
};

function normalizeMediatorContacts(values: unknown): MediatorContact[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const contacts: MediatorContact[] = [];
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    const phone = getString(record.phone);
    const city = getString(record.city);
    const key = phoneKey(phone);
    if (!phone || !city || !key || seen.has(key)) continue;
    seen.add(key);
    contacts.push({ phone, city });
  }
  return contacts;
}

async function readMediatorContactsFromSettings(): Promise<MediatorContact[]> {
  const rows = await listEvents("botly_settings").catch(() => []);
  for (const row of rows) {
    const contacts = normalizeMediatorContacts(row.payload?.mediatorContacts);
    if (contacts.length > 0) return contacts;
    const storedPhones = Array.isArray(row.payload?.mediatorPhones)
      ? (row.payload?.mediatorPhones as unknown[]).filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const phones = normalizeMediatorPhones([
      ...storedPhones,
      getString(row.payload?.mediatorPhone),
    ]);
    if (phones.length > 0) return phones.map((phone) => ({ phone, city: "" }));
  }
  return [];
}

async function notifyMediatorsOfMerchantAvailability(args: {
  order: Record<string, unknown>;
  isAvailable: boolean;
}) {
  const storedContacts = normalizeMediatorContacts(args.order.mediatorContacts);
  const storedPhones = Array.isArray(args.order.mediatorPhones)
    ? (args.order.mediatorPhones as unknown[]).filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const orderGovernorate =
    getString(args.order.merchantGovernorate) ||
    getString(args.order.fitterCity) ||
    getString(args.order.customerGovernorate);
  const fallbackContacts = (await readMediatorContactsFromSettings()).filter(
    (contact) => contact.city === orderGovernorate,
  );
  const mediatorPhones = normalizeMediatorPhones(
    storedContacts.length > 0
      ? storedContacts.map((contact) => contact.phone)
      : storedPhones.length > 0
        ? storedPhones
        : fallbackContacts.map((contact) => contact.phone),
  );
  if (mediatorPhones.length === 0) return [];

  const productTitle = getString(args.order.productTitle) || "المنتج";
  const storeName = getString(args.order.merchantStoreName) || getString(args.order.storeName) || "المتجر";
  const merchantWhatsapp = getString(args.order.merchantWhatsapp) || "-";
  const currentPrice = getNumber(args.order.currentPrice) ?? getNumber(args.order.price) ?? 0;
  const currency = getString(args.order.currency) || "IQD";
  const requester =
    getString(args.order.sourceContext) === "fitter_site"
      ? `الفيتر: ${getString(args.order.fitterName) || "-"} / ${getString(args.order.fitterWhatsapp) || "-"}`
      : `الزبون: ${getString(args.order.customerName) || "-"} / ${getString(args.order.customerPhone) || getString(args.order.customerNumber) || "-"}`;

  const message = [
    args.isAvailable ? "رد التاجر: المنتج متوفر" : "رد التاجر: المنتج غير متوفر",
    `المنتج: ${productTitle}`,
    `السعر الحالي: ${currentPrice.toLocaleString()} ${currency}`,
    `المتجر: ${storeName}`,
    `واتساب التاجر: ${merchantWhatsapp}`,
    requester,
  ].join("\n");

  const results = [];
  for (const phone of mediatorPhones) {
    const recipient = toWhatsAppRecipient(phone);
    try {
      results.push({ phone: recipient, ...(await sendWhatsAppText(recipient, message)) });
    } catch (error) {
      results.push({
        phone: recipient,
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

function mediatorPhonesForOrder(order: Record<string, unknown>): string[] {
  const storedContacts = normalizeMediatorContacts(order.mediatorContacts);
  const storedPhones = Array.isArray(order.mediatorPhones)
    ? (order.mediatorPhones as unknown[]).filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  return normalizeMediatorPhones(
    storedContacts.length > 0 ? storedContacts.map((contact) => contact.phone) : storedPhones,
  );
}

async function notifyRequesterOfMerchantAvailability(args: {
  order: Record<string, unknown>;
  isAvailable: boolean;
}) {
  const order = args.order;
  const requesterPhone =
    getString(order.sourceContext) === "fitter_site"
      ? getString(order.fitterWhatsapp)
      : getString(order.customerPhone) || getString(order.customerNumber);
  if (!requesterPhone) return { ok: false, skipped: true, error: "Missing requester phone" };

  const mediatorPhones = mediatorPhonesForOrder(order);
  const mediatorLine =
    mediatorPhones.length > 0
      ? `رقم الوسيط: ${mediatorPhones.join(" / ")}`
      : "رقم الوسيط غير متوفر حالياً، انتظر تواصل الوسيط.";
  const productTitle = getString(order.productTitle) || "المنتج";
  const currentPrice = getNumber(order.currentPrice) ?? getNumber(order.price) ?? 0;
  const currency = getString(order.currency) || "IQD";
  const body = [
    args.isAvailable ? "رد التاجر: المنتج متوفر" : "رد التاجر: المنتج غير متوفر",
    `المنتج: ${productTitle}`,
    currentPrice ? `السعر: ${currentPrice.toLocaleString()} ${currency}` : "",
    mediatorLine,
    args.isAvailable ? "يرجى التواصل مع الوسيط لإكمال الطلب." : "يمكنك البحث عن قطعة بديلة من التطبيق.",
  ]
    .filter(Boolean)
    .join("\n");

  const recipient = toWhatsAppRecipient(requesterPhone);
  try {
    return { phone: recipient, ...(await sendWhatsAppText(recipient, body)) };
  } catch (error) {
    return {
      phone: recipient,
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function missingOrderFinalStatus(order: Record<string, unknown>) {
  const merchantStatus = getString(order.merchantStatus) || "Pending";
  const requesterStatus = getString(order.requesterStatus) || "Pending";
  if (merchantStatus === "Sold" && requesterStatus === "Purchased") return "completed";
  if (merchantStatus === "Cancelled" && requesterStatus === "Cancelled") return "cancelled";
  if (
    (merchantStatus === "Sold" && requesterStatus === "Cancelled") ||
    (merchantStatus === "Cancelled" && requesterStatus === "Purchased")
  ) {
    return "review";
  }
  return "pending_review";
}

async function findLatestMissingOrderByMerchant(phone: string) {
  const key = phoneKey(phone);
  const rows = await listEvents("botly_order", 500).catch(() => []);
  return (
    rows.find((row) => {
      const p = row.payload ?? {};
      return (
        phoneKey(getString(p.merchantWhatsapp)) === key &&
        getString(p.merchantStatus) !== "Cancelled" &&
        getString(p.merchantStatus) !== "Sold"
      );
    }) ?? null
  );
}

async function findLatestMissingOrderByRequester(phone: string) {
  const key = phoneKey(phone);
  const rows = await listEvents("botly_order", 500).catch(() => []);
  return (
    rows.find((row) => {
      const p = row.payload ?? {};
      return (
        (phoneKey(getString(p.requesterPhone)) === key ||
          phoneKey(getString(p.customerPhone)) === key ||
          phoneKey(getString(p.customerNumber)) === key ||
          phoneKey(getString(p.fitterWhatsapp)) === key) &&
        getString(p.merchantStatus) &&
        getString(p.requesterStatus) !== "Purchased" &&
        getString(p.requesterStatus) !== "Cancelled"
      );
    }) ?? null
  );
}

async function notifyMediatorsOfMissingOrderEvent(order: Record<string, unknown>, eventLabel: string) {
  const contacts = await readMediatorContactsFromSettings();
  const scoped = contacts.filter(
    (contact) => !getString(order.requesterGovernorate) || contact.city === getString(order.requesterGovernorate),
  );
  const phones = normalizeMediatorPhones((scoped.length > 0 ? scoped : contacts).map((contact) => contact.phone));
  const status = missingOrderFinalStatus(order);
  const message = [
    `تحديث طلب منتج غير موجود: ${eventLabel}`,
    `اسم المنتج: ${getString(order.productTitle)}`,
    `نوع السيارة: ${getString(order.carMake)}`,
    `موديل السيارة: ${getString(order.carModel)}`,
    `التاجر: ${getString(order.merchantStoreName)} / ${getString(order.merchantWhatsapp)}`,
    `مقدم الطلب: ${getString(order.requesterName) || getString(order.customerName) || getString(order.fitterName)} / ${getString(order.requesterPhone) || getString(order.customerPhone) || getString(order.customerNumber) || getString(order.fitterWhatsapp)}`,
    `حالة التاجر: ${getString(order.merchantStatus) || "Pending"}`,
    `حالة الزبون/الفيتر: ${getString(order.requesterStatus) || "Pending"}`,
    `الحالة النهائية: ${status}`,
  ].join("\n");
  const results = [];
  for (const phone of phones) {
    const recipient = toWhatsAppRecipient(phone);
    try {
      results.push({ phone: recipient, ...(await sendWhatsAppText(recipient, message)) });
    } catch (error) {
      results.push({ phone: recipient, ok: false, status: 0, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

async function handleMissingProductButton(from: string, actionId: string) {
  const now = new Date().toISOString();

  if (actionId === ACTION_MISSING_AVAILABLE) {
    const row = await findLatestMissingOrderByMerchant(from);
    if (!row) return false;
    const order = {
      ...(row.payload ?? {}),
      merchantStatus: "Available",
      requesterStatus: getString(row.payload?.requesterStatus) || "Pending",
      status: "available",
      eventName: "merchant_pressed_available",
      eventAt: now,
      availableAt: now,
    };
    await appendEvent("botly_order", order);
    await sendWhatsAppButtons(
      toWhatsAppRecipient(getString(order.merchantWhatsapp)),
      "بعد إكمال عملية البيع يرجى الضغط على زر (تم بيع المنتج)، أو إذا ألغى الزبون الطلب اضغط (تم إلغاء الطلب).",
      [
        { id: ACTION_MISSING_MERCHANT_SOLD, title: "تم بيع المنتج" },
        { id: ACTION_MISSING_MERCHANT_NOT_PURCHASED, title: "تم إلغاء الطلب" },
      ],
    );
    await sendWhatsAppButtons(
      toWhatsAppRecipient(getString(order.requesterPhone) || getString(order.customerPhone) || getString(order.customerNumber) || getString(order.fitterWhatsapp)),
      "يوجد تاجر يمتلك المنتج المطلوب.\n\nهل تم شراء المنتج المطلوب؟",
      [
        { id: ACTION_MISSING_REQUESTER_PURCHASED, title: "تم الشراء" },
        { id: ACTION_MISSING_REQUESTER_NOT_PURCHASED, title: "تم إلغاء الطلب" },
      ],
    ).catch(() => ({ ok: false, status: 0 }));
    return true;
  }

  if ([ACTION_MISSING_MERCHANT_SOLD, ACTION_MISSING_MERCHANT_NOT_PURCHASED].includes(actionId)) {
    const row = await findLatestMissingOrderByMerchant(from);
    if (!row) return false;
    const merchantStatus = actionId === ACTION_MISSING_MERCHANT_SOLD ? "Sold" : "Cancelled";
    const order = {
      ...(row.payload ?? {}),
      merchantStatus,
      requesterStatus: getString(row.payload?.requesterStatus) || "Pending",
      status: missingOrderFinalStatus({ ...(row.payload ?? {}), merchantStatus }),
      eventName: merchantStatus === "Sold" ? "merchant_pressed_sold" : "merchant_pressed_cancelled",
      eventAt: now,
      merchantRespondedAt: now,
      commissionPercent: 5,
    };
    await appendEvent("botly_order", order);
    await sendWhatsAppButtons(
      toWhatsAppRecipient(getString(order.requesterPhone) || getString(order.customerPhone) || getString(order.customerNumber) || getString(order.fitterWhatsapp)),
      "هل تم شراء المنتج المطلوب؟",
      [
        { id: ACTION_MISSING_REQUESTER_PURCHASED, title: "تم الشراء" },
        { id: ACTION_MISSING_REQUESTER_NOT_PURCHASED, title: "تم إلغاء الطلب" },
      ],
    ).catch(() => ({ ok: false, status: 0 }));
    await notifyMediatorsOfMissingOrderEvent(order, merchantStatus === "Sold" ? "التاجر أكد البيع" : "التاجر ألغى الطلب");
    return true;
  }

  if ([ACTION_MISSING_REQUESTER_PURCHASED, ACTION_MISSING_REQUESTER_NOT_PURCHASED].includes(actionId)) {
    const row = await findLatestMissingOrderByRequester(from);
    if (!row) return false;
    const requesterStatus = actionId === ACTION_MISSING_REQUESTER_PURCHASED ? "Purchased" : "Cancelled";
    const order = {
      ...(row.payload ?? {}),
      requesterStatus,
      merchantStatus: getString(row.payload?.merchantStatus) || "Pending",
      status: missingOrderFinalStatus({ ...(row.payload ?? {}), requesterStatus }),
      eventName: requesterStatus === "Purchased" ? "requester_pressed_purchased" : "requester_pressed_cancelled",
      eventAt: now,
      requesterRespondedAt: now,
      commissionPercent: 5,
    };
    await appendEvent("botly_order", order);
    await notifyMediatorsOfMissingOrderEvent(order, requesterStatus === "Purchased" ? "الزبون/الفيتر أكد الشراء" : "الزبون/الفيتر ألغى الطلب");
    return true;
  }

  return false;
}

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

function startWorkflowResponse(): WorkflowResponse {
  return textResponse(
    "اهلا عيني شلون الصحة 👋\n\nاكتب اسم المنتج الي تدور عليه، أو دز صورته 📷 وأدورلك عليه.\nمثلاً: لايت أمامي مرسيدس، بمبر دوج تشارجر، مراية بي ام دبليو.\nوإذا دزيت صورة تكدر تضيف وياها شرح (مثلاً: لايت جارجر 2017).",
    "workflow_start",
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
  return startWorkflowResponse();
}

function confirmAddressResponse(savedAddress: OrderDetails): WorkflowResponse {
  const addressStr = [
    savedAddress.name ? `الاسم: ${savedAddress.name}` : null,
    savedAddress.landmark ? `النقطة الدالة: ${savedAddress.landmark}` : null,
    savedAddress.governorate ? `المحافظة: ${savedAddress.governorate}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return buttonResponse(
    `عنوانك المحفوظ:\n${addressStr}\n\nنكمل الطلب على نفس هذا العنوان؟`,
    [
      { id: "confirm_address", title: "نعم، نفسه" },
      { id: "change_address", title: "لا، بدل العنوان" },
    ],
    "address_confirmation",
  );
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

async function wasOutboundReplySentRecently(customerNumber: string, body: string, minutes = 60) {
  const recipient = normalizePhone(customerNumber);
  const bodyHash = await sha256(`${recipient}:${body}`);
  // Server-side filter: only this recipient's recent guard rows.
  const rows = await listEventsByPayloadField("botly_outbound_guard", "recipient", recipient, 30);
  return rows.some((row) => {
    const payload = row.payload ?? {};
    return (
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
  // Server-side filter: only this customer's newest rows, not the whole table.
  const rows = await listEventsByPayloadField(
    "botly_customer_session",
    "customerNumber",
    customerNumber,
    5,
  );
  const now = Date.now();
  const row = rows.find(
    (candidate) => new Date(getString(candidate.payload?.expiresAt)).getTime() > now,
  );
  if (!row) return null;

  const payload = row.payload ?? {};
  const matches = Array.isArray(payload.matches) ? (payload.matches as ProductMatch[]) : [];
  const selectedMatch =
    payload.selectedMatch && typeof payload.selectedMatch === "object"
      ? (payload.selectedMatch as ProductMatch)
      : null;

  // Legacy sessions may be parked in removed phases (start, awaiting_location,
  // awaiting_customer_details) — map them to the closest live phase.
  const rawPhase = getString(payload.phase);
  const phase: WorkflowPhase =
    rawPhase === "awaiting_location" || rawPhase === "start" || !rawPhase
      ? "awaiting_product_query"
      : rawPhase === "awaiting_customer_details"
        ? "awaiting_customer_name"
        : (rawPhase as WorkflowPhase);

  return {
    customerNumber,
    phase,
    matches,
    selectedMatch,
    pendingIntent:
      payload.pendingIntent && typeof payload.pendingIntent === "object"
        ? (payload.pendingIntent as SearchIntent)
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
  displayedCount = 3,
  prompt?: { type: string; at?: string } | null,
  phase: WorkflowPhase = "awaiting_product_query",
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
    lastQuery: lastQuery ?? null,
    displayedCount,
    lastPromptType: prompt?.type ?? null,
    lastPromptAt: prompt?.at ?? null,
    orderDetails: orderDetails ?? null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
  }).catch((error) => console.error("[Session] Failed to store customer session", error));
}

async function findLastSavedAddress(customerNumber: string): Promise<OrderDetails | null> {
  const rows = await listEventsByPayloadField(
    "botly_customer_session",
    "customerNumber",
    customerNumber,
    30,
  );
  for (const row of rows) {
    const payload = row.payload ?? {};
    const details = payload.orderDetails;
    if (details && typeof details === "object") {
      const order = details as Partial<OrderDetails>;
      if (order.name && order.landmark && order.governorate) {
        return {
          name: order.name,
          landmark: order.landmark,
          governorate: order.governorate,
        };
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

  // Always tell the merchant a sale happened, even though delivery got the order.
  let merchantNotified = false;
  if (match.merchantWhatsapp) {
    const merchantResult = await sendWhatsAppText(
      match.merchantWhatsapp,
      [
        "🎉 Botly: تم بيع منتج من متجرك!",
        `المنتج: ${match.title}`,
        `السعر: ${formatPrice(match)}`,
        `رقم الزبون: ${customerNumber}`,
        "",
        "✅ تم تحويل الطلب لشركة التوصيل مباشرة.",
      ].join("\n"),
    ).catch((error) => {
      console.error("[Order] Failed to notify merchant", error);
      return { ok: false, status: 0, error: String(error) };
    });
    merchantNotified = merchantResult.ok;
  }

  await appendEvent("botly_order", {
    orderId: crypto.randomUUID(),
    merchantId: match.merchantId,
    productId: match.id,
    productTitle: match.title,
    productPrice: match.price,
    currency: match.currency,
    storeName: match.storeName,
    customerNumber,
    deliveryPhone: match.deliveryPhone,
    merchantWhatsapp: match.merchantWhatsapp,
    merchantNotified,
    status: result.ok ? "sent_to_delivery" : "delivery_notification_failed",
    createdAt: new Date().toISOString(),
  }).catch((error) => console.error("[Order] Failed to record order", error));

  return result;
}

function formatWorkflowSearchResults(matches: ProductMatch[], hasMore = false, startIndex = 0) {
  if (matches.length === 0) return "ما لكيت منتج مطابق حالياً.";

  // NOTE: deliberately no postUrl and no merchant address —
  // contact happens through the bot, not around it.
  const lines = matches.slice(0, 3).map((match, index) => {
    const color = match.color ? `، ${match.color}` : "";
    return `${startIndex + index + 1}. ${match.title}${color}\n${formatPrice(match)} - ${match.storeName}`;
  });

  const more = hasMore ? "\nإذا تريد نتائج أكثر اضغط المزيد." : "";
  return `${lines.join("\n\n")}${more}\n\nاختار رقم المنتج حتى أكمله.\n0️⃣ اضغط 0 لإلغاء البحث والعودة للبداية.`;
}

// WhatsApp can only deliver public https links. Link-based images go out as-is;
// manually uploaded images (stored as data: URLs) are served through the public
// /api/product-image endpoint so customers see them too.
function deliverableImageUrl(match: ProductMatch): string | null {
  if (/^https:\/\//i.test(match.imageUrl)) return match.imageUrl;
  if (match.imageUrl.startsWith("data:") && match.id) {
    const base = (process.env.PUBLIC_SITE_URL ?? "https://www.bot-lly.tech").replace(/\/$/, "");
    return `${base}/api/product-image/${encodeURIComponent(match.id)}`;
  }
  return null;
}

// Send one image per displayed product (best-effort). The caption shows
// number/title/price only; no links or merchant location.
async function sendResultImages(customerNumber: string, matches: ProductMatch[], startIndex = 0) {
  // Fire all image sends in parallel — sequential awaits added ~1.5s of
  // customer-visible latency for 3 images.
  await Promise.allSettled(
    matches.slice(0, 3).map((match, index) => {
      const imageUrl = match.imageUrl ? deliverableImageUrl(match) : null;
      if (!imageUrl) return Promise.resolve();
      const caption = `${startIndex + index + 1}️⃣ ${match.title}\n${formatPrice(match)} - ${match.storeName}`;
      return sendWhatsAppImage(customerNumber, imageUrl, caption).catch((error) =>
        console.error("[Workflow] Failed to send product image", error),
      );
    }),
  );
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
  // Accept Arabic-Indic digits ("١") the same as ASCII ("1").
  const normalized = toAsciiDigits(normalizeArabicText(text).toLowerCase());
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
  const description = match.description?.trim();
  return buttonResponse(
    [
      `اختيرت: ${match.title}`,
      description && description !== match.title ? `الوصف: ${description}` : null,
      `السعر: ${formatPrice(match)}`,
      `المتجر: ${match.storeName}`,
      "شنو تحب تسوي؟",
    ]
      .filter(Boolean)
      .join("\n"),
    [
      { id: ACTION_COMPLETE_PURCHASE, title: "اكمال الشراء" },
      { id: ACTION_MESSAGE_MERCHANT, title: "رسالة للتاجر" },
    ],
    "after_selection",
  );
}

async function sendMerchantOrderButtons(
  merchantPhone: string,
  customerNumber: string,
  productTitle: string,
  price: string,
) {
  const body = [
    `🎉 طلب جديد من زبون!`,
    `المنتج: ${productTitle}`,
    `السعر: ${price}`,
    `رقم الزبون: ${customerNumber}`,
    "",
    "حالة الطلب:",
  ].join("\n");

  return sendWhatsAppButtons(
    merchantPhone,
    body,
    [
      { id: ACTION_CONFIRM_ORDER, title: "✅ تم تأكيد الطلب" },
      { id: ACTION_PRODUCT_OUT_OF_STOCK, title: "❌ المنتج منتهي" },
    ],
    undefined,
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

  // Primary recipient: delivery company if configured, otherwise the merchant.
  const recipient = match.deliveryPhone || match.merchantWhatsapp;
  if (!recipient) return { ok: false, status: 0, error: "Missing recipient" };
  const result = await sendWhatsAppText(recipient, body);

  // The merchant must ALWAYS know the bot sold a product — even while away or
  // asleep, and even when the order went straight to the delivery company.
  // This is the core promise of the product.
  let merchantNotified = !match.deliveryPhone && result.ok;
  let merchantButtonsResult = { ok: false };
  if (match.merchantWhatsapp) {
    // Send order confirmation buttons to merchant
    merchantButtonsResult = await sendMerchantOrderButtons(
      match.merchantWhatsapp,
      customerNumber,
      match.title,
      formatPrice(match),
    ).catch((error) => {
      console.error("[Order] Failed to send merchant buttons", error);
      return { ok: false, status: 0, error: String(error) };
    });

    if (match.deliveryPhone) {
      // Also send text notification if order went to delivery
      const merchantBody = [
        "ℹ️ تم تحويل الطلب لشركة التوصيل مباشرة.",
        `رقم الزبون: ${customerNumber}`,
      ].join("\n");
      await sendWhatsAppText(match.merchantWhatsapp, merchantBody).catch((error) => {
        console.error("[Order] Failed to notify merchant about delivery", error);
      });
    }

    merchantNotified = merchantButtonsResult.ok;
  }

  const orderId = crypto.randomUUID();
  await appendEvent("botly_order", {
    orderId,
    merchantId: match.merchantId,
    productId: match.id,
    productTitle: match.title,
    productPrice: match.price,
    currency: match.currency,
    storeName: match.storeName,
    customerNumber,
    deliveryPhone: match.deliveryPhone,
    merchantWhatsapp: match.merchantWhatsapp,
    merchantNotified,
    merchantButtonsSent: merchantButtonsResult.ok,
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

// Arabic-Indic digits → ASCII so "١" works like "1" everywhere.
function toAsciiDigits(text: string) {
  return text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

// "0" cancels whatever is in progress and returns to the start.
function isCancelInput(text: string) {
  return toAsciiDigits(text.trim()) === "0";
}

async function resetToProductQuery(customerNumber: string) {
  await writeCustomerSession(customerNumber, [], null, null, 3, null, "awaiting_product_query");
}

// Search the catalogue for an already-extracted intent and reply with results
// (shared by the text flow and the image flow).
async function respondWithSearchResults(
  customerNumber: string,
  intent: SearchIntent,
  query: string,
  intro = "",
  guardReason = "search_results",
): Promise<WorkflowResponse> {
  // Open nationwide search — most sales are delivery, so no radius filter.
  const matches = await searchProducts(intent, 10, { limit: 10 });
  const visible = matches.slice(0, 3);
  await writeCustomerSession(
    customerNumber,
    matches,
    null,
    intent,
    visible.length,
    null,
    "awaiting_selection",
    query,
  );
  if (visible.length === 0) {
    return notFoundResponse();
  }
  await sendResultImages(customerNumber, visible, 0);
  return buttonResponse(
    `${intro}${formatWorkflowSearchResults(visible, matches.length > visible.length)}`,
    selectionButtons(visible, 0, matches.length > visible.length),
    guardReason,
  );
}

// Run the search and reply with results (shared by first message and re-search).
async function runProductSearch(
  customerNumber: string,
  query: string,
): Promise<WorkflowResponse> {
  const intent = await extractSearchIntent(query);
  return respondWithSearchResults(customerNumber, intent, query);
}

// Image search: the customer sent a product photo (optionally with a caption
// like "لايت جارجر 2017"). A vision model identifies the part, then the photo
// goes through the exact same catalogue search as a typed query.
async function runImageProductSearch(
  customerNumber: string,
  imageId: string,
  caption: string,
): Promise<WorkflowResponse> {
  // Don't let a stray photo blow away an order form in progress.
  const existingSession = await readCustomerSession(customerNumber);
  const phase = existingSession?.phase ?? "awaiting_product_query";
  if (
    phase === "awaiting_address_confirmation" ||
    phase === "awaiting_customer_name" ||
    phase === "awaiting_customer_landmark" ||
    phase === "awaiting_customer_governorate"
  ) {
    return textResponse(
      "خلينا نكمل معلومات الطلب الحالي أولاً ✍️\n0️⃣ أو اضغط 0 لإلغاء الطلب والبدء ببحث جديد.",
      "image_during_order",
    );
  }

  const image = await downloadWhatsAppImage(imageId);
  if (!image) {
    return textResponse(
      "ما كدرت أحمل الصورة 😕\nجرب تدزها مرة ثانية، أو اكتب اسم القطعة الي تدور عليها.",
      "image_download_failed",
    );
  }

  const intent = await extractImageSearchIntent(image, caption);
  if (!intent) {
    return textResponse(
      "ما كدرت أميز قطعة واضحة بالصورة 😕\nجرب صورة أوضح للقطعة، أو اكتب اسمها مع نوع السيارة (مثلاً: لايت أمامي مرسيدس).",
      "image_not_recognized",
    );
  }

  const query = [intent.searchTerms, caption].filter(Boolean).join(" — ");
  return respondWithSearchResults(
    customerNumber,
    intent,
    query,
    `شفت الصورة 📷 يبين ${intent.searchTerms}.\n\n`,
    "image_search_results",
  );
}

async function handleButtonWorkflow(
  customerNumber: string,
  customerText: string,
  actionId: string | null,
): Promise<WorkflowResponse> {
  const existingSession = await readCustomerSession(customerNumber);
  const phase = existingSession?.phase ?? "awaiting_product_query";

  // Global escape: "0" or the new-search button cancels everything in
  // progress and returns to the greeting.
  if (
    actionId === ACTION_NEW_SEARCH ||
    (isCancelInput(customerText) && phase !== "awaiting_product_query")
  ) {
    await resetToProductQuery(customerNumber);
    return startWorkflowResponse();
  }

  // Brand-new conversation: ANY first message gets the greeting + product
  // prompt. The customer's next message is treated as the search query.
  if (!existingSession) {
    await resetToProductQuery(customerNumber);
    return startWorkflowResponse();
  }

  if (actionId === ACTION_SEARCH_ALTERNATIVE) {
    await writeCustomerSession(
      customerNumber,
      [],
      null,
      existingSession.pendingIntent ?? null,
      3,
      null,
      "awaiting_product_query",
      existingSession.lastQuery,
    );
    return textResponse("تمام، اكتب اسم المنتج البديل الي تدور عليه.");
  }

  if (phase === "awaiting_product_query") {
    const query = customerText.trim();
    if (query.length < 2) {
      return textResponse("اكتب اسم المنتج بشكل أوضح حتى أقدر أبحث عنه.");
    }
    return runProductSearch(customerNumber, query);
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
        next,
        null,
        "awaiting_selection",
        existingSession.lastQuery,
      );
      await sendResultImages(customerNumber, extraMatches, start);
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
        "اختار رقم المنتج من النتائج حتى أكمله.\n0️⃣ أو اضغط 0 لإلغاء البحث والبدء من جديد.",
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
      await resetToProductQuery(customerNumber);
      return buttonResponse("تم، رسالت معلومات اهتمامك للتاجر. تحب تبحث عن منتج ثاني؟", [
        { id: ACTION_NEW_SEARCH, title: "بحث جديد" },
      ]);
    }

    if (actionId === ACTION_COMPLETE_PURCHASE) {
      // Returning customer with a saved address: confirm it instead of
      // re-asking the three questions.
      const savedAddress = await findLastSavedAddress(customerNumber);
      if (savedAddress) {
        await writeCustomerSession(
          customerNumber,
          existingSession.matches,
          selected,
          existingSession.pendingIntent ?? null,
          existingSession.displayedCount ?? 3,
          null,
          "awaiting_address_confirmation",
          existingSession.lastQuery,
          savedAddress,
        );
        return confirmAddressResponse(savedAddress);
      }

      await writeCustomerSession(
        customerNumber,
        existingSession.matches,
        selected,
        existingSession.pendingIntent ?? null,
        existingSession.displayedCount ?? 3,
        null,
        "awaiting_customer_name",
        existingSession.lastQuery,
        {},
      );
      // The customer's WhatsApp number is forwarded with the order
      // automatically, so we never ask for a phone.
      return textResponse("تمام! حتى نكمل الطلب،\n1️⃣ شنو اسمك الكامل؟");
    }

    return afterSelectionResponse(selected);
  }

  if (phase === "awaiting_address_confirmation") {
    const selected = existingSession.selectedMatch ?? null;
    if (!selected) return startWorkflowResponse();

    if (actionId === "confirm_address") {
      const details = [
        `الاسم: ${existingSession.orderDetails?.name ?? "—"}`,
        `أقرب نقطة دالة: ${existingSession.orderDetails?.landmark ?? "—"}`,
        `المحافظة: ${existingSession.orderDetails?.governorate ?? "—"}`,
      ].join(" | ");

      const result = await sendPurchaseDetails(customerNumber, selected, details);
      // Keep orderDetails on the reset session so the address stays saved.
      await writeCustomerSession(
        customerNumber,
        [],
        null,
        null,
        3,
        null,
        "awaiting_product_query",
        undefined,
        existingSession.orderDetails,
      );
      return buttonResponse(
        result.ok
          ? "تم استلام طلبك وإرساله للجهة المناسبة ✅\nرقم الواتساب مالتك راح يوصل للتاجر مع الطلب.\nتحب تبحث عن منتج ثاني؟"
          : "سجلت طلبك، بس صار خلل بإرسال الإشعار. جرب تراسل التاجر أو ابحث من جديد.",
        [{ id: ACTION_NEW_SEARCH, title: "بحث جديد" }],
      );
    }

    if (actionId === "change_address") {
      await writeCustomerSession(
        customerNumber,
        existingSession.matches,
        selected,
        existingSession.pendingIntent ?? null,
        existingSession.displayedCount ?? 3,
        null,
        "awaiting_customer_name",
        existingSession.lastQuery,
        {},
      );
      return textResponse("تمام! حتى نكمل الطلب،\n1️⃣ شنو اسمك الكامل؟");
    }

    return confirmAddressResponse(existingSession.orderDetails ?? {});
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
      existingSession.displayedCount ?? 3,
      null,
      "awaiting_customer_landmark",
      existingSession.lastQuery,
      { ...existingSession.orderDetails, name },
    );
    return textResponse(
      `شكراً ${name} 🌟\n2️⃣ شنو أقرب نقطة دالة على موقعك؟ (مثلاً: جامع، مدرسة، شارع معروف)`,
    );
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
    const fullAddress = { ...existingSession.orderDetails, governorate };
    const details = [
      `الاسم: ${fullAddress.name ?? "غير مذكور"}`,
      `أقرب نقطة دالة: ${fullAddress.landmark ?? "غير مذكورة"}`,
      `المحافظة: ${governorate}`,
    ].join(" | ");
    const result = await sendPurchaseDetails(customerNumber, selected, details);
    // Persist the full address on the reset session — next order skips the
    // three questions and just asks for confirmation.
    await writeCustomerSession(
      customerNumber,
      [],
      null,
      null,
      3,
      null,
      "awaiting_product_query",
      undefined,
      fullAddress,
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

          const isCustomerMessage =
            Boolean(incoming.from) && summary.eventType.startsWith("message.");

          if (
            isCustomerMessage &&
            incoming.from &&
            incoming.actionId &&
            [
              ACTION_MISSING_AVAILABLE,
              ACTION_MISSING_MERCHANT_SOLD,
              ACTION_MISSING_MERCHANT_NOT_PURCHASED,
              ACTION_MISSING_REQUESTER_PURCHASED,
              ACTION_MISSING_REQUESTER_NOT_PURCHASED,
            ].includes(incoming.actionId)
          ) {
            const handled = await handleMissingProductButton(incoming.from, incoming.actionId);
            if (handled) {
              return new Response(JSON.stringify({ ok: true, handled: "missing_product" }), {
                status: 200,
                headers: jsonHeaders,
              });
            }
          }

          // Merchant pressed an order-status button (sent by sendPurchaseDetails).
          if (
            isCustomerMessage &&
            incoming.from &&
            (incoming.actionId === ACTION_CONFIRM_ORDER ||
              incoming.actionId === ACTION_PRODUCT_OUT_OF_STOCK)
          ) {
            // The webhook `from` is a wa_id (9647...), while merchantWhatsapp
            // is stored as the merchant typed it (07... / +9647...), so match
            // by format-independent phone key over the recent orders.
            const fromKey = phoneKey(incoming.from);
            const rows = await listEvents("botly_order", 200).catch(() => []);
            const respondedOrderIds = new Set<string>();
            let orderRow: (typeof rows)[number] | null = null;
            for (const row of rows) {
              const p = row.payload ?? {};
              const orderId = getString(p.orderId) || row.id;
              // Newest-first: a response event marks its order as handled.
              if (getString(p.merchantResponseStatus)) {
                respondedOrderIds.add(orderId);
                continue;
              }
              if (respondedOrderIds.has(orderId)) continue;
              if (fromKey && phoneKey(getString(p.merchantWhatsapp)) === fromKey) {
                orderRow = row;
                break;
              }
            }

            if (orderRow) {
              const order = orderRow.payload ?? {};
              const productTitle = getString(order.productTitle) || "المنتج";
              const isConfirmed = incoming.actionId === ACTION_CONFIRM_ORDER;
              const mediatorResults = await notifyMediatorsOfMerchantAvailability({
                order,
                isAvailable: isConfirmed,
              }).catch((error) => {
                console.error("[Merchant] Failed to notify mediators:", error);
                return [];
              });
              const requesterResult = await notifyRequesterOfMerchantAvailability({
                order,
                isAvailable: isConfirmed,
              }).catch((error) => ({
                ok: false,
                status: 0,
                error: error instanceof Error ? error.message : String(error),
              }));

              await appendEvent("botly_order", {
                ...order,
                orderId: getString(order.orderId) || orderRow.id,
                merchantResponse: incoming.actionId,
                merchantResponseStatus: isConfirmed ? "confirmed" : "out_of_stock",
                merchantStatus: isConfirmed ? "Available" : "Cancelled",
                requesterStatus: getString(order.requesterStatus) || "Pending",
                status: isConfirmed ? "available" : "out_of_stock",
                eventName: isConfirmed ? "merchant_pressed_available" : "merchant_pressed_cancelled",
                eventAt: new Date().toISOString(),
                commissionPercent: 5,
                customerNotifiedOfStatus: Boolean((requesterResult as { ok?: unknown }).ok),
                requesterNotificationResult: requesterResult,
                mediatorNotifiedOfStatus: mediatorResults.some((result) => result.ok),
                mediatorNotificationResults: mediatorResults,
                respondedAt: new Date().toISOString(),
              }).catch((error) =>
                console.error("[Merchant] Failed to record merchant response:", error),
              );
              if (isConfirmed) {
                await sendWhatsAppButtons(
                  toWhatsAppRecipient(getString(order.merchantWhatsapp)),
                  "بعد إكمال عملية البيع يرجى الضغط على زر (تم بيع المنتج)، أو إذا ألغى الزبون الطلب اضغط (تم إلغاء الطلب).",
                  [
                    { id: ACTION_MISSING_MERCHANT_SOLD, title: "تم بيع المنتج" },
                    { id: ACTION_MISSING_MERCHANT_NOT_PURCHASED, title: "تم إلغاء الطلب" },
                  ],
                ).catch((error) => {
                  console.error("[Merchant] Failed to send sale confirmation buttons:", error);
                  return { ok: false, status: 0 };
                });
                const requesterPhone =
                  getString(order.requesterPhone) ||
                  getString(order.customerPhone) ||
                  getString(order.customerNumber) ||
                  getString(order.fitterWhatsapp);
                if (requesterPhone) {
                  await sendWhatsAppButtons(
                    toWhatsAppRecipient(requesterPhone),
                    "هل تم شراء المنتج المطلوب؟",
                    [
                      { id: ACTION_MISSING_REQUESTER_PURCHASED, title: "تم الشراء" },
                      { id: ACTION_MISSING_REQUESTER_NOT_PURCHASED, title: "تم إلغاء الطلب" },
                    ],
                  ).catch((error) => {
                    console.error("[Merchant] Failed to send requester confirmation buttons:", error);
                    return { ok: false, status: 0 };
                  });
                }
              }
              console.log("[Merchant] Availability response recorded:", productTitle);
            } else {
              console.warn("[Merchant] No pending order found for:", incoming.from);
            }
          } else if (isCustomerMessage && incoming.from) {
            console.log("[Webhook] WhatsApp bot workflow disabled; inbound message ignored:", incoming.from);
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
