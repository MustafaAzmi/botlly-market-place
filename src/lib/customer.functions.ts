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
  getString,
  getNumber,
  eventTime,
  phoneKey,
  normalizePhone,
  type EventRow,
} from "@/lib/eventStore.server";
import {
  CAR_COLORS,
  CAR_MAKES,
  CAR_YEARS,
  parseCatalogueConfig,
  toEnabledCatalogue,
  type CarMake,
} from "@/lib/car-data";
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
  const rows = await listEvents(CUSTOMER_PROVIDER);
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
    const row = await appendEvent(CUSTOMER_PROVIDER, {
      customerId: crypto.randomUUID(),
      whatsapp: data.whatsapp,
      name: data.name,
      landmark: data.landmark,
      governorate: data.governorate,
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
    const row = await appendEvent(CUSTOMER_PROVIDER, {
      ...(existing.payload ?? {}),
      customerId: customerIdentity(existing),
      whatsapp: data.whatsapp,
      name: data.name,
      landmark: data.landmark,
      governorate: data.governorate,
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
async function loadHiddenMerchants(): Promise<Set<string>> {
  const hidden = new Set<string>();
  const rows = await listEvents("botly_merchant").catch(() => [] as EventRow[]);
  const seen = new Set<string>();
  for (const row of rows) {
    const p = row.payload ?? {};
    const id = getString(p.merchantId) || row.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (
      p.bannedFromBot === true ||
      p.bannedFromBot === "true" ||
      p.visibilityEnabled === "false" ||
      p.visibilityEnabled === false ||
      p.isActive === "false" ||
      p.isActive === false ||
      (p.suspendedAt && String(p.suspendedAt).trim() !== "") ||
      p.subscriptionStatus === "expired" ||
      (p.packageExpiry &&
        String(p.packageExpiry).trim() !== "" &&
        new Date(String(p.packageExpiry)) < new Date())
    ) {
      hidden.add(id);
    }
  }
  return hidden;
}

export const browseCarProducts = createServerFn({ method: "POST" })
  .inputValidator((d) => browseInput.parse(d))
  .handler(async ({ data }): Promise<CustomerProduct[]> => {
    const [rows, hiddenMerchants] = await Promise.all([
      listEvents("botly_product"),
      loadHiddenMerchants(),
    ]);

    const wantMake = (data.carMake ?? "").trim();
    const wantModel = (data.carModel ?? "").trim();
    const wantYear = (data.carYear ?? "").trim();
    const wantColor = (data.color ?? "").trim();

    const results: CustomerProduct[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const p = row.payload ?? {};
      const productId = getString(p.productId) || row.id;
      if (seen.has(productId)) continue;
      seen.add(productId); // newest event per product wins

      if (getString(p.status) !== "active") continue;
      if (getString(p.availability) === "out_of_stock") continue;
      const quantity = getNumber(p.quantity);
      if (quantity !== undefined && quantity <= 0) continue;
      if (hiddenMerchants.has(getString(p.merchantId))) continue;

      const carMake = getString(p.carMake);
      const carModel = getString(p.carModel);
      const color = getString(p.color);

      // Universal parts ("عام") fit every car, so they pass any make filter.
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

      const primaryImage = getString(p.imageUrl);
      const extraImages = Array.isArray(p.imageUrls)
        ? (p.imageUrls as unknown[]).filter(
            (v): v is string => typeof v === "string" && v.length > 0,
          )
        : [];

      results.push({
        id: productId,
        title: getString(p.title) || getString(p.description) || "منتج",
        description: getString(p.description),
        imageUrls: extraImages.length > 0 ? extraImages : primaryImage ? [primaryImage] : [],
        price: getNumber(p.discountPrice) ?? getNumber(p.currentPrice) ?? 0,
        originalPrice: getNumber(p.currentPrice) || undefined,
        currency: getString(p.currency) || "IQD",
        color: color || undefined,
        size: getString(p.size) || undefined,
        carMake: carMake || undefined,
        carModel: carModel || undefined,
        carYear: getString(p.carYear) || undefined,
        quantity,
      });
    }

    return results;
  });

// ---------------------------------------------------------------------------
// Mediator (الوسيط) contact — admin-managed number in botly_settings
// ---------------------------------------------------------------------------

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

async function readMediatorPhones(): Promise<string[]> {
  const rows = await listEvents("botly_settings").catch(() => [] as EventRow[]);
  for (const row of rows) {
    const storedPhones = Array.isArray(row.payload?.mediatorPhones)
      ? (row.payload?.mediatorPhones as unknown[]).filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const phones = normalizeMediatorPhones([
      ...storedPhones,
      getString(row.payload?.mediatorPhone),
    ]);
    if (phones.length > 0) return phones;
  }
  return [];
}

// WhatsApp Graph API expects the recipient number without a leading "+".
function toWhatsAppRecipient(phone: string): string {
  return normalizePhone(phone).replace(/^\+/, "");
}

export const getMediatorPhone = createServerFn({ method: "POST" }).handler(async () => {
  const phones = await readMediatorPhones();
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
): Promise<{ whatsapp: string; storeName: string; merchantId: string }> {
  let whatsapp = "";
  let merchantId = merchantIdHint;

  const products = await listEvents("botly_product").catch(() => [] as EventRow[]);
  for (const row of products) {
    const p = row.payload ?? {};
    if ((getString(p.productId) || row.id) !== productId) continue;
    whatsapp = getString(p.whatsapp);
    merchantId = merchantId || getString(p.merchantId);
    break; // rows come newest first → first match is the latest version
  }

  let storeName = "";
  if (merchantId) {
    const merchants = await listEvents("botly_merchant").catch(() => [] as EventRow[]);
    for (const row of merchants) {
      const p = row.payload ?? {};
      if ((getString(p.merchantId) || row.id) !== merchantId) continue;
      whatsapp = getString(p.whatsapp) || getString(p.whatsappNormalized) || whatsapp;
      storeName = getString(p.storeName);
      break;
    }
  }

  return { whatsapp, storeName, merchantId };
}

async function resolveOrderProduct(productId: string): Promise<{
  id: string;
  title: string;
  price: number;
  currency: string;
  merchantId: string;
}> {
  const products = await listEvents("botly_product").catch(() => [] as EventRow[]);
  const row = products.find((event) => (getString(event.payload?.productId) || event.id) === productId);
  if (!row) throw new Error("المنتج غير موجود حالياً.");

  const p = row.payload ?? {};
  if (getString(p.status) !== "active" || getString(p.availability) === "out_of_stock") {
    throw new Error("هذا المنتج غير متوفر حالياً.");
  }
  const quantity = getNumber(p.quantity);
  if (quantity !== undefined && quantity <= 0) {
    throw new Error("هذا المنتج نفدت كميته حالياً.");
  }

  const price = getNumber(p.discountPrice) ?? getNumber(p.currentPrice);
  if (price === undefined) throw new Error("سعر المنتج غير واضح حالياً.");

  return {
    id: getString(p.productId) || row.id,
    title: getString(p.title) || getString(p.description) || "منتج",
    price,
    currency: getString(p.currency) || "IQD",
    merchantId: getString(p.merchantId),
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
    const [mediatorPhones, merchant] = await Promise.all([
      readMediatorPhones(),
      resolveMerchantContact(product.id, product.merchantId),
    ]);

    if (mediatorPhones.length === 0) {
      throw new Error("أرقام الوسطاء غير مسجلة حالياً. حاول لاحقاً.");
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
      `المحافظة: ${data.customerGovernorate}`,
      `أقرب نقطة دالة: ${data.customerLandmark}`,
    );
    const message = lines.join("\n");

    // Store the order in the event store for history/admin view (optional).
    await appendEvent("botly_order", {
      productId: product.id,
      productTitle: product.title,
      price: product.price,
      currency: product.currency,
      merchantId: merchant.merchantId,
      merchantStoreName: merchant.storeName,
      merchantWhatsapp: merchant.whatsapp,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerGovernorate: data.customerGovernorate,
      customerLandmark: data.customerLandmark,
      mediatorPhone: mediatorPhones[0],
      mediatorPhones,
      message,
      createdAt: new Date().toISOString(),
    });

    const sendResults = [];
    for (const mediatorPhone of mediatorPhones) {
      const recipient = toWhatsAppRecipient(mediatorPhone);
      try {
        const result = await sendWhatsAppText(recipient, message);
        sendResults.push({ phone: recipient, ...result });
      } catch (error) {
        sendResults.push({
          phone: recipient,
          ok: false,
          status: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const sentCount = sendResults.filter((result) => result.ok).length;
    if (sentCount === 0) {
      console.error("[submitProductOrder] Failed to send order to all mediators", sendResults);
      throw new Error(
        "تم حفظ الطلب، لكن تعذر إرسال ملخص الطلب للوسيط عبر واتساب. راجع إعدادات رقم الواتساب.",
      );
    }

    return {
      success: true,
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
