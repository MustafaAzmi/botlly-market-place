// Customer-facing server functions.
//
// Customers are WhatsApp-first: they register ONCE with their WhatsApp number,
// name, landmark and governorate. The profile lives permanently in the event
// store (botly_customer) — logging in again only needs the number.
//
// Privacy model: customers browsing the catalogue NEVER see merchant contact
// info (no phone, no address, no store name) and merchants never see the
// customer's phone. All human contact goes through the mediator (الوسيط),
// whose number the admin manages in settings.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendEvent,
  listEvents,
  listEventsByPayloadField,
  listProjectedEventsPage,
  latestEventWhere,
  getString,
  getNumber,
  normalizePageRequest,
  eventTime,
  phoneKey,
  normalizePhone,
  type EventRow,
  type PageResult,
} from "@/lib/eventStore.server";
import { diagnoseServerResult } from "@/lib/egress-diagnostics.server";
import {
  CAR_COLORS,
  CAR_MAKES,
  CAR_YEARS,
  parseCatalogueConfig,
  toEnabledCatalogue,
  type CarMake,
} from "@/lib/car-data";
import { normalizeGovernorate } from "@/lib/governorates";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";

const CUSTOMER_PROVIDER = "botly_customer" as const;

export type CustomerProfile = {
  id: string;
  whatsapp: string;
  name: string;
  landmark: string; // أقرب نقطة دالة
  governorate: string; // المحافظة / المدينة
  createdAt: string;
  updatedAt: string;
};

// Customer-facing product view: specs + prices + merchant contact (for mediator eyes only).
export type CustomerProduct = {
  id: string;
  title: string;
  description: string;
  imageUrls: string[];
  // The final price — the only price customers see.
  price: number;
  // Original price (for mediator reference in order messages).
  originalPrice?: number;
  currency: string;
  color?: string;
  size?: string;
  carMake?: string;
  carModel?: string;
  carYear?: string;
  merchantGovernorate?: string;
  deliveryEstimate?: string;
  quantity?: number;
};

const phoneInput = z.object({
  whatsapp: z.string().trim().min(6).max(40),
});

const profileInput = phoneInput.extend({
  name: z.string().trim().min(2).max(100),
  landmark: z.string().trim().min(2).max(200),
  governorate: z.string().trim().min(2).max(100),
});

function customerIdentity(row: EventRow): string {
  return getString(row.payload?.customerId) || row.id;
}

function toCustomer(row: EventRow): CustomerProfile {
  const p = row.payload ?? {};
  return {
    id: customerIdentity(row),
    whatsapp: getString(p.whatsapp),
    name: getString(p.name),
    landmark: getString(p.landmark),
    governorate: getString(p.governorate),
    createdAt: getString(p.createdAt) || eventTime(row),
    updatedAt: getString(p.updatedAt) || eventTime(row),
  };
}

// Latest profile event per customer (append-only store, newest wins). Phone
// matching is format-independent: 07X..., +9647X... and 9647X... all match.
async function findCustomerByPhone(whatsapp: string): Promise<EventRow | null> {
  const key = phoneKey(whatsapp);
  if (!key) return null;
  const variants = [...new Set([whatsapp, normalizePhone(whatsapp)])].filter(Boolean);
  const rows = (
    await Promise.all(
      variants.map((variant) =>
        listEventsByPayloadField(CUSTOMER_PROVIDER, "whatsapp", variant, 1),
      ),
    )
  ).flat();
  return rows.find((row) => phoneKey(getString(row.payload?.whatsapp)) === key) ?? null;
}

// ---------------------------------------------------------------------------
// Auth: register once, stay remembered forever
// ---------------------------------------------------------------------------

export const loginCustomer = createServerFn({ method: "POST" })
  .inputValidator((d) => phoneInput.parse(d))
  .handler(async ({ data }) => {
    const row = await findCustomerByPhone(data.whatsapp);
    if (!row) {
      throw new Error("الرقم غير مسجل. أنشئ حساب أولاً — مرة وحدة فقط وراح نتذكرك دائماً.");
    }
    return { customer: toCustomer(row), token: crypto.randomUUID() };
  });

export const signupCustomer = createServerFn({ method: "POST" })
  .inputValidator((d) => profileInput.parse(d))
  .handler(async ({ data }) => {
    const existing = await findCustomerByPhone(data.whatsapp);
    if (existing) {
      // Already registered: just log them in with their saved profile.
      return { customer: toCustomer(existing), token: crypto.randomUUID(), existed: true };
    }

    const now = new Date().toISOString();
    const governorate = normalizeGovernorate(data.governorate);
    const row = await appendEvent(CUSTOMER_PROVIDER, {
      customerId: crypto.randomUUID(),
      whatsapp: data.whatsapp,
      name: data.name,
      landmark: data.landmark,
      governorate,
      createdAt: now,
      updatedAt: now,
    });
    return { customer: toCustomer(row), token: crypto.randomUUID(), existed: false };
  });

export const updateCustomerProfile = createServerFn({ method: "POST" })
  .inputValidator((d) => profileInput.parse(d))
  .handler(async ({ data }) => {
    const existing = await findCustomerByPhone(data.whatsapp);
    if (!existing) throw new Error("الحساب غير موجود.");

    const now = new Date().toISOString();
    const governorate = normalizeGovernorate(data.governorate);
    const row = await appendEvent(CUSTOMER_PROVIDER, {
      ...(existing.payload ?? {}),
      customerId: customerIdentity(existing),
      whatsapp: data.whatsapp,
      name: data.name,
      landmark: data.landmark,
      governorate,
      updatedAt: now,
    });
    return { customer: toCustomer(row) };
  });

// ---------------------------------------------------------------------------
// Catalogue browsing (car filters, merchant identity hidden)
// ---------------------------------------------------------------------------

const browseInput = z.object({
  carMake: z.string().trim().max(60).optional().or(z.literal("")),
  carModel: z.string().trim().max(60).optional().or(z.literal("")),
  carYear: z.string().trim().max(10).optional().or(z.literal("")),
  color: z.string().trim().max(60).optional().or(z.literal("")),
  governorate: z.string().trim().max(100).optional().or(z.literal("")),
  searchScope: z.enum(["governorate", "all"]).optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().max(100).optional().or(z.literal("")),
});

// Does this product fit the requested manufacture year?
// - carYear field set → must match exactly.
// - No carYear but the title/description mention a year (older products like
//   "لايت كورولا موديل 2016") → that year must match.
// - No year info at all → universal part, fits every year.
function matchesYear(payload: Record<string, unknown>, wantYear: string): boolean {
  if (!wantYear) return true;
  const carYear = getString(payload.carYear);
  if (carYear) return carYear === wantYear;
  const text = `${getString(payload.title)} ${getString(payload.description)}`;
  const mentionedYears = text.match(/\b(19|20)\d{2}\b/g);
  if (mentionedYears && mentionedYears.length > 0) return mentionedYears.includes(wantYear);
  return true;
}

function liveCatalogueFallback(): CustomerCarCatalogue {
  return {
    makes: CAR_MAKES,
    colors: CAR_COLORS,
    years: CAR_YEARS,
  };
}

// Merchants hidden from customers (banned / suspended / expired) — same rules
// as the WhatsApp search path.
async function loadSearchMerchantMetadata(): Promise<{
  hidden: Set<string>;
  governorates: Map<string, string>;
}> {
  const hidden = new Set<string>();
  const governorates = new Map<string, string>();
  const page = await listProjectedEventsPage(
    "botly_merchant",
    [
      "merchant_id:payload->>merchantId",
      "city:payload->>city",
      "governorate:payload->>governorate",
      "banned:payload->>bannedFromBot",
      "visibility:payload->>visibilityEnabled",
      "active:payload->>isActive",
      "suspended_at:payload->>suspendedAt",
      "subscription_status:payload->>subscriptionStatus",
      "package_expiry:payload->>packageExpiry",
    ].join(","),
    { limit: 100 },
  ).catch(() => ({ items: [] }));
  const seen = new Set<string>();
  for (const row of page.items) {
    const id = getString(row.merchant_id) || row.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    governorates.set(id, getString(row.city) || getString(row.governorate));
    if (
      getString(row.banned) === "true" ||
      getString(row.visibility) === "false" ||
      getString(row.active) === "false" ||
      Boolean(getString(row.suspended_at).trim()) ||
      getString(row.subscription_status) === "expired" ||
      (getString(row.package_expiry).trim() &&
        new Date(getString(row.package_expiry)) < new Date())
    ) {
      hidden.add(id);
    }
  }
  return { hidden, governorates };
}

function estimateDelivery(fromGovernorate: string, toGovernorate: string) {
  if (!fromGovernorate || !toGovernorate) return "حسب ترتيب الوسيط";
  return fromGovernorate === toGovernorate ? "تقريباً خلال 24-48 ساعة" : "تقريباً خلال 2-4 أيام";
}

export const browseCarProducts = createServerFn({ method: "POST" })
  .inputValidator((d) => browseInput.parse(d))
  .handler(async ({ data }): Promise<PageResult<CustomerProduct>> => {
    const pagination = normalizePageRequest(data);
    const finish = (result: PageResult<CustomerProduct>) =>
      diagnoseServerResult("api:browseCarProducts", result, {
        params: pagination,
      });
    const [productPage, merchantMetadata] = await Promise.all([
      listProjectedEventsPage("botly_product", [
        "product_id:payload->>productId",
        "title:payload->>title",
        "description:payload->>description",
        "discount_price:payload->>discountPrice",
        "current_price:payload->>currentPrice",
        "currency:payload->>currency",
        "merchant_id:payload->>merchantId",
        "status:payload->>status",
        "availability:payload->>availability",
        "quantity:payload->>quantity",
        "car_make:payload->>carMake",
        "car_model:payload->>carModel",
        "car_year:payload->>carYear",
        "color:payload->>color",
        "size:payload->>size",
        "merchant_city:payload->>merchantCity",
      ].join(","), {
        page: pagination.page,
        cursor: pagination.cursor,
        limit: 100,
      }),
      loadSearchMerchantMetadata(),
    ]);
    const hiddenMerchants = merchantMetadata.hidden;
    const merchantGovernorates = merchantMetadata.governorates;
    const rows = productPage.items;

    const wantMake = (data.carMake ?? "").trim();
    const wantModel = (data.carModel ?? "").trim();
    const wantYear = (data.carYear ?? "").trim();
    const wantColor = (data.color ?? "").trim();
    const wantGovernorate = normalizeGovernorate(data.governorate ?? "");
    const searchScope = data.searchScope ?? "governorate";

    if (!wantMake || (searchScope === "governorate" && !wantGovernorate)) {
      return finish({
        items: [],
        page: pagination.page,
        limit: pagination.limit,
        nextCursor: null,
        hasMore: false,
      });
    }

    const results: CustomerProduct[] = [];
    const seen = new Set<string>();
    let resultCursor: string | null = null;

    for (const row of rows) {
      const p: Record<string, unknown> = {
        title: row.title,
        description: row.description,
        carYear: row.car_year,
      };
      const productId = getString(row.product_id) || row.id;
      if (seen.has(productId)) continue;
      seen.add(productId); // newest event per product wins

      if (getString(row.status) !== "active") continue;
      if (getString(row.availability) === "out_of_stock") continue;
      const parsedQuantity = Number(getString(row.quantity));
      const quantity = Number.isFinite(parsedQuantity) ? parsedQuantity : undefined;
      if (quantity !== undefined && quantity <= 0) continue;
      if (hiddenMerchants.has(getString(row.merchant_id))) continue;

      const carMake = getString(row.car_make);
      const carModel = getString(row.car_model);
      const color = getString(row.color);
      const merchantId = getString(row.merchant_id);
      const merchantGovernorate = getString(row.merchant_city) || merchantGovernorates.get(merchantId) || "";

      // Universal parts ("عام") fit every car, so they pass any make filter.
      if (searchScope === "governorate" && wantGovernorate && normalizeGovernorate(merchantGovernorate) !== wantGovernorate) continue;
      if (wantMake && carMake !== wantMake && carMake !== "عام") continue;
      if (
        wantModel &&
        wantModel !== "كل الموديلات" &&
        carModel !== wantModel &&
        carModel !== "كل الموديلات"
      )
        continue;
      if (wantColor && wantColor !== "أخرى" && !color.includes(wantColor)) continue;
      if (!matchesYear(p, wantYear)) continue;

      const imageUrls = [`/api/product-image/${encodeURIComponent(productId)}?index=0`];
      const discountPrice = Number(getString(row.discount_price));
      const currentPrice = Number(getString(row.current_price));

      if (results.length < pagination.limit) results.push({
        id: productId,
        title: getString(p.title) || getString(p.description) || "منتج",
        description: getString(row.description),
        imageUrls,
        price: Number.isFinite(discountPrice)
          ? discountPrice
          : Number.isFinite(currentPrice) ? currentPrice : 0,
        originalPrice: Number.isFinite(currentPrice) ? currentPrice : undefined,
        currency: getString(row.currency) || "IQD",
        color: color || undefined,
        size: getString(row.size) || undefined,
        carMake: carMake || undefined,
        carModel: carModel || undefined,
        carYear: getString(row.car_year) || undefined,
        merchantGovernorate: merchantGovernorate || undefined,
        deliveryEstimate: estimateDelivery(merchantGovernorate, wantGovernorate),
        quantity,
      });
      if (results.length === pagination.limit) {
        resultCursor = eventTime(row as EventRow);
        break;
      }
    }

    return finish({
      items: results,
      page: pagination.page,
      limit: pagination.limit,
      nextCursor: resultCursor ?? productPage.nextCursor,
      hasMore: Boolean(resultCursor) || productPage.hasMore,
    });
  });

// ---------------------------------------------------------------------------
// Mediator (الوسيط) contact — admin-managed number in botly_settings
// ---------------------------------------------------------------------------

type MediatorContact = {
  phone: string;
  city: string;
};

const ALL_GOVERNORATES_MEDIATOR = "كل المحافظات";

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

async function readMediatorContacts(): Promise<MediatorContact[]> {
  const rows = await listEvents("botly_settings").catch(() => [] as EventRow[]);
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

function filterMediatorContactsByGovernorate(
  contacts: MediatorContact[],
  governorate: string,
): MediatorContact[] {
  const wanted = normalizeGovernorate(governorate);
  if (!wanted) return [];
  const seen = new Set<string>();
  return contacts.filter((contact) => {
    const city = normalizeGovernorate(contact.city);
    const isMatch = city === wanted || contact.city.trim() === ALL_GOVERNORATES_MEDIATOR;
    const key = phoneKey(contact.phone);
    if (!isMatch || !key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// WhatsApp Graph API expects the recipient number without a leading "+".
function toWhatsAppRecipient(phone: string): string {
  return normalizePhone(phone).replace(/^\+/, "");
}

async function sendOrderToMediator(phone: string, message: string) {
  const primaryRecipient = toWhatsAppRecipient(phone);
  const legacyRecipient = normalizePhone(phone);

  const primary = await sendWhatsAppText(primaryRecipient, message);
  if (primary.ok) return { phone: primaryRecipient, ...primary };
  if (primary.status === 0) return { phone: primaryRecipient, ...primary };

  // Before the mediator split, this order path sent the normalized number with
  // "+". Keep that as a compatibility fallback for accounts that were already
  // working with the older format.
  if (legacyRecipient && legacyRecipient !== primaryRecipient) {
    const legacy = await sendWhatsAppText(legacyRecipient, message);
    if (legacy.ok) return { phone: legacyRecipient, ...legacy };
    return {
      phone: primaryRecipient,
      ok: false,
      status: legacy.status || primary.status,
      error: `primary=${primary.error ?? primary.status}; legacy=${legacy.error ?? legacy.status}`,
    };
  }

  return { phone: primaryRecipient, ...primary };
}

export const getMediatorPhone = createServerFn({ method: "POST" }).handler(async () => {
  const contacts = await readMediatorContacts();
  const phones = contacts.map((contact) => contact.phone);
  return { phone: phones[0] ?? "", phones };
});

// Customer-facing car catalogue: only enabled items show in dropdowns.
export type CustomerCarCatalogue = {
  makes: CarMake[];
  colors: string[];
  years: string[];
};

// Resolve the merchant's WhatsApp + store name server-side at order time.
// The number NEVER touches the customer's browser: the client only sends the
// productId, and we look the merchant up here before messaging the mediator.
// Lookup order:
//   1. product event (new products carry the merchant's number directly)
//   2. merchant profile (source of truth — covers legacy products saved
//      before the number was copied into product events)
async function resolveMerchantContact(
  productId: string,
  merchantIdHint: string,
): Promise<{ whatsapp: string; storeName: string; merchantId: string; city: string }> {
  let whatsapp = "";
  let merchantId = merchantIdHint;
  let city = "";

  const product = await latestEventWhere("botly_product", "productId", productId);
  for (const row of product ? [product] : []) {
    const p = row.payload ?? {};
    whatsapp = getString(p.whatsapp);
    merchantId = merchantId || getString(p.merchantId);
    city = getString(p.merchantCity);
    break; // rows come newest first → first match is the latest version
  }

  let storeName = "";
  if (merchantId) {
    const merchants = await listEventsByPayloadField(
      "botly_merchant",
      "merchantId",
      merchantId,
      1,
    );
    for (const row of merchants) {
      const p = row.payload ?? {};
      if ((getString(p.merchantId) || row.id) !== merchantId) continue;
      whatsapp = getString(p.whatsapp) || getString(p.whatsappNormalized) || whatsapp;
      storeName = getString(p.storeName);
      city = city || getString(p.city);
      break;
    }
  }

  return { whatsapp, storeName, merchantId, city };
}

async function resolveOrderProduct(productId: string): Promise<{
  id: string;
  title: string;
  price: number;
  currentPrice: number;
  currency: string;
  carMake: string;
  carModel: string;
  merchantId: string;
  merchantGovernorate: string;
}> {
  const row = await latestEventWhere("botly_product", "productId", productId);
  if (!row) throw new Error("المنتج غير موجود حالياً.");

  const p = row.payload ?? {};
  if (getString(p.status) !== "active" || getString(p.availability) === "out_of_stock") {
    throw new Error("هذا المنتج غير متوفر حالياً.");
  }
  const quantity = getNumber(p.quantity);
  if (quantity !== undefined && quantity <= 0) {
    throw new Error("هذا المنتج نفدت كميته حالياً.");
  }

  const currentPrice = getNumber(p.currentPrice);
  const price = getNumber(p.discountPrice) ?? currentPrice;
  if (price === undefined) throw new Error("سعر المنتج غير واضح حالياً.");

  return {
    id: getString(p.productId) || row.id,
    title: getString(p.title) || getString(p.description) || "منتج",
    price,
    currentPrice: currentPrice ?? price,
    currency: getString(p.currency) || "IQD",
    carMake: getString(p.carMake),
    carModel: getString(p.carModel),
    merchantId: getString(p.merchantId),
    merchantGovernorate: getString(p.merchantCity),
  };
}

// Product order: customer requests, mediator receives (server-side, no UI opening).
export const submitProductOrder = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        productId: z.string().trim().min(1),
        customerName: z.string().trim().min(2),
        customerPhone: z.string().trim().min(6),
        customerGovernorate: z.string().trim().min(1),
        customerLandmark: z.string().trim().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const product = await resolveOrderProduct(data.productId);
    const [allMediatorContacts, merchant] = await Promise.all([
      readMediatorContacts(),
      resolveMerchantContact(product.id, product.merchantId),
    ]);
    const orderGovernorate = normalizeGovernorate(product.merchantGovernorate || merchant.city);
    const customerGovernorate = normalizeGovernorate(data.customerGovernorate);
    const mediatorContacts = filterMediatorContactsByGovernorate(
      allMediatorContacts,
      orderGovernorate,
    );
    const mediatorPhones = mediatorContacts.map((contact) => contact.phone);

    if (allMediatorContacts.length === 0) {
      throw new Error("أرقام الوسطاء غير مسجلة حالياً. حاول لاحقاً.");
    }

    if (mediatorPhones.length === 0) {
      throw new Error(`لا يوجد وسيط مسجل لمحافظة ${orderGovernorate || "هذا المنتج"}.`);
    }

    // The order must never fail just because the merchant's number is missing
    // from old data — the mediator can still identify the merchant by store
    // name / id from the admin dashboard.
    const merchantLine = merchant.whatsapp
      ? `📞 واتس اب التاجر: ${merchant.whatsapp}`
      : `📞 واتس اب التاجر: غير متوفر (راجع لوحة الادمن)`;

    // Build the message for the mediator.
    const lines = [
      "📋 طلب منتج جديد:",
      `📦 المنتج: ${product.title}`,
      `💰 السعر: ${product.price.toLocaleString()} ${product.currency}`,
    ];
    if (merchant.storeName) lines.push(`🏪 المتجر: ${merchant.storeName}`);
    lines.push(
      merchantLine,
      "",
      "👤 بيانات الزبون:",
      `الاسم: ${data.customerName}`,
      `الهاتف: ${data.customerPhone}`,
      `المحافظة: ${customerGovernorate}`,
      `أقرب نقطة دالة: ${data.customerLandmark}`,
    );
    const message = lines.join("\n");

    const orderId = crypto.randomUUID();
    const merchantAvailabilityResult = {
      ok: false,
      status: 0,
      skipped: true,
      reason: "web_notifications_only",
    };

    // Store the order in the event store for history/admin view (optional).
    await appendEvent("botly_order", {
      orderId,
      sourceContext: "customer_site",
      requesterType: "customer",
      requesterPhone: data.customerPhone,
      productId: product.id,
      productTitle: product.title,
      price: product.price,
      currentPrice: product.currentPrice,
      currency: product.currency,
      carMake: product.carMake,
      carModel: product.carModel,
      merchantId: merchant.merchantId,
      merchantStoreName: merchant.storeName,
      merchantWhatsapp: merchant.whatsapp,
      merchantGovernorate: orderGovernorate,
      merchantAvailabilityAsked: merchantAvailabilityResult.ok,
      merchantAvailabilityResult,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerNumber: data.customerPhone,
      customerGovernorate,
      customerLandmark: data.customerLandmark,
      mediatorPhone: mediatorPhones[0],
      mediatorPhones,
      mediatorContacts,
      message,
      createdAt: new Date().toISOString(),
    });

    const sendResults = await Promise.all(
      mediatorPhones.map(async (mediatorPhone) => {
      try {
        const result = await sendOrderToMediator(mediatorPhone, message);
        return result;
      } catch (error) {
        return {
          phone: mediatorPhone,
          ok: false,
          status: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      }),
    );

    const sentCount = sendResults.filter((result) => result.ok).length;
    await appendEvent("botly_order", {
      orderId,
      sourceContext: "customer_site",
      requesterType: "customer",
      requesterPhone: data.customerPhone,
      productId: product.id,
      productTitle: product.title,
      price: product.price,
      currentPrice: product.currentPrice,
      currency: product.currency,
      carMake: product.carMake,
      carModel: product.carModel,
      merchantId: merchant.merchantId,
      merchantStoreName: merchant.storeName,
      merchantWhatsapp: merchant.whatsapp,
      merchantGovernorate: orderGovernorate,
      merchantAvailabilityAsked: merchantAvailabilityResult.ok,
      merchantAvailabilityResult,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerNumber: data.customerPhone,
      customerGovernorate,
      customerLandmark: data.customerLandmark,
      mediatorPhone: mediatorPhones[0],
      mediatorPhones,
      mediatorContacts,
      message,
      whatsappSent: sentCount > 0,
      whatsappSentCount: sentCount,
      whatsappSendResults: sendResults,
      createdAt: new Date().toISOString(),
    });

    if (sentCount === 0) {
      console.error("[submitProductOrder] Failed to send order to all mediators", sendResults);
      return {
        success: true,
        orderId,
        whatsappSent: false,
        whatsappSentCount: sentCount,
        warning:
          "The order was saved, but WhatsApp delivery to the mediator failed. Admin can review the order from the dashboard.",
      };
    }

    return {
      success: true,
      orderId,
      whatsappSent: true,
      whatsappSentCount: sentCount,
      message: "تم إرسال طلبك للوسيط. سيتم الاهتمام بك والتواصل معك خلال دقائق قريباً إن شاء الله.",
    };
  });

export const getEnabledCarCatalogue = createServerFn({ method: "POST" }).handler(
  async (): Promise<CustomerCarCatalogue> => {
    // Newest parseable catalogue event wins. If the admin has not saved a
    // catalogue yet, keep the marketplace usable with the built-in car list.
    const rows = await listEvents("botly_catalogue_config").catch(() => [] as EventRow[]);
    for (const row of rows) {
      const config = parseCatalogueConfig(row.payload);
      if (config) {
        const enabled = toEnabledCatalogue(config);
        if (enabled.makes.length || enabled.colors.length || enabled.years.length) return enabled;
      }
    }
    return liveCatalogueFallback();
  },
);
