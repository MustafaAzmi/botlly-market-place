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
  getString,
  getNumber,
  eventTime,
  phoneKey,
  type EventRow,
} from "@/lib/eventStore.server";
import { sendWhatsAppButtons, sendWhatsAppText } from "@/lib/whatsapp/send.server";

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

// Customer-facing product view: specs + price ONLY (no merchant identity).
export type CustomerProduct = {
  id: string;
  title: string;
  description: string;
  imageUrls: string[];
  // The final price — the only price customers see.
  price: number;
  currency: string;
  color?: string;
  size?: string;
  carMake?: string;
  carModel?: string;
  quantity?: number;
};

export type CustomerOrder = {
  orderId: string;
  productTitle: string;
  productPrice: number;
  currency: string;
  status: string;
  createdAt: string;
  receivedAt?: string;
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
  color: z.string().trim().max(60).optional().or(z.literal("")),
});

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
    const wantColor = (data.color ?? "").trim();

    const results: CustomerProduct[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const p = row.payload ?? {};
      const productId = getString(p.productId) || row.id;
      if (seen.has(productId)) continue;
      seen.add(productId); // newest event per product wins

      if (getString(p.status) !== "active") continue;
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
        currency: getString(p.currency) || "IQD",
        color: color || undefined,
        size: getString(p.size) || undefined,
        carMake: carMake || undefined,
        carModel: carModel || undefined,
        quantity: getNumber(p.quantity),
      });
    }

    return results;
  });

// ---------------------------------------------------------------------------
// Mediator (الوسيط) contact — admin-managed number in botly_settings
// ---------------------------------------------------------------------------

export const getMediatorPhone = createServerFn({ method: "POST" }).handler(async () => {
  const rows = await listEvents("botly_settings").catch(() => [] as EventRow[]);
  for (const row of rows) {
    const phone = getString(row.payload?.mediatorPhone);
    if (phone) return { phone };
  }
  return { phone: "" };
});

// ---------------------------------------------------------------------------
// Web orders
// ---------------------------------------------------------------------------

const orderInput = phoneInput.extend({
  productId: z.string().trim().min(1).max(100),
});

const orderActionInput = phoneInput.extend({
  orderId: z.string().trim().min(1).max(100),
});

// Place an order from the customer dashboard. The merchant is notified on
// WhatsApp WITHOUT the customer's phone — name/address only; the mediator gets
// the full details (including the phone) and brokers the contact.
export const createWebOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => orderInput.parse(d))
  .handler(async ({ data }) => {
    const customerRow = await findCustomerByPhone(data.whatsapp);
    if (!customerRow) throw new Error("سجل دخول أولاً حتى تكدر تطلب.");
    const customer = toCustomer(customerRow);

    // Latest product event.
    const productRows = await listEvents("botly_product");
    const productRow = productRows.find(
      (row) => (getString(row.payload?.productId) || row.id) === data.productId,
    );
    if (!productRow || getString(productRow.payload?.status) !== "active") {
      throw new Error("المنتج لم يعد متوفراً.");
    }
    const p = productRow.payload ?? {};
    const merchantId = getString(p.merchantId);

    // Merchant contact (for OUR notification only — never returned to client).
    const merchantRows = await listEventsByPayloadField(
      "botly_merchant",
      "merchantId",
      merchantId,
      1,
    );
    const merchant = merchantRows[0]?.payload ?? {};
    const merchantWhatsapp = getString(merchant.whatsapp) || getString(merchant.phone);
    const storeName = getString(merchant.storeName) || "متجر";

    const title = getString(p.title) || "منتج";
    const price = getNumber(p.discountPrice) ?? getNumber(p.currentPrice) ?? 0;
    const currency = getString(p.currency) || "IQD";
    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();

    await appendEvent("botly_order", {
      orderId,
      source: "web",
      merchantId,
      productId: data.productId,
      productTitle: title,
      productPrice: price,
      currency,
      storeName,
      customerId: customer.id,
      customerNumber: customer.whatsapp,
      customerName: customer.name,
      customerLandmark: customer.landmark,
      customerGovernorate: customer.governorate,
      merchantWhatsapp,
      status: "pending_merchant",
      createdAt: now,
    });

    // Notify the merchant — order details + delivery address, NO phone number.
    if (merchantWhatsapp) {
      await sendWhatsAppButtons(
        merchantWhatsapp,
        [
          "🎉 طلب جديد من المنصة!",
          `المنتج: ${title}`,
          `السعر: ${price} ${currency}`,
          `الزبون: ${customer.name}`,
          `العنوان: ${customer.governorate} — ${customer.landmark}`,
          "",
          "التواصل يتم عن طريق الوسيط.",
          "حالة الطلب:",
        ].join("\n"),
        [
          { id: "merchant_confirm_order", title: "✅ تم تأكيد الطلب" },
          { id: "merchant_product_out_of_stock", title: "❌ المنتج منتهي" },
        ],
      ).catch((error) => console.error("[WebOrder] Failed to notify merchant", error));
    }

    // Notify the mediator with the FULL details (they broker the contact).
    const settings = await listEvents("botly_settings").catch(() => [] as EventRow[]);
    const mediatorPhone = settings
      .map((row) => getString(row.payload?.mediatorPhone))
      .find(Boolean);
    if (mediatorPhone) {
      await sendWhatsAppText(
        mediatorPhone,
        [
          "Botly: طلب جديد من الموقع 🛒",
          `المنتج: ${title}`,
          `السعر: ${price} ${currency}`,
          `المتجر: ${storeName}`,
          `الزبون: ${customer.name}`,
          `رقم الزبون: ${customer.whatsapp}`,
          `العنوان: ${customer.governorate} — ${customer.landmark}`,
        ].join("\n"),
      ).catch((error) => console.error("[WebOrder] Failed to notify mediator", error));
    }

    return { orderId, ok: true };
  });

// Latest event per orderId for this customer's phone (format-independent).
async function latestOrdersForPhone(whatsapp: string): Promise<Map<string, EventRow>> {
  const key = phoneKey(whatsapp);
  const rows = await listEvents("botly_order");
  const latest = new Map<string, EventRow>();
  for (const row of rows) {
    const p = row.payload ?? {};
    if (phoneKey(getString(p.customerNumber)) !== key) continue;
    const orderId = getString(p.orderId) || row.id;
    if (!latest.has(orderId)) latest.set(orderId, row); // newest-first
  }
  return latest;
}

export const listCustomerOrders = createServerFn({ method: "POST" })
  .inputValidator((d) => phoneInput.parse(d))
  .handler(async ({ data }): Promise<CustomerOrder[]> => {
    const latest = await latestOrdersForPhone(data.whatsapp);
    return [...latest.values()].map((row) => {
      const p = row.payload ?? {};
      return {
        orderId: getString(p.orderId) || row.id,
        productTitle: getString(p.productTitle) || "منتج",
        productPrice: getNumber(p.productPrice) ?? 0,
        currency: getString(p.currency) || "IQD",
        status: getString(p.status) || "pending_merchant",
        createdAt: getString(p.createdAt) || eventTime(row),
        receivedAt: getString(p.receivedAt) || undefined,
      };
    });
  });

// The customer presses "تم الاستلام": records delivery so the admin report
// shows which merchant sold what and that the customer actually received it.
export const markOrderReceived = createServerFn({ method: "POST" })
  .inputValidator((d) => orderActionInput.parse(d))
  .handler(async ({ data }) => {
    const latest = await latestOrdersForPhone(data.whatsapp);
    const row = latest.get(data.orderId);
    if (!row) throw new Error("الطلب غير موجود.");

    const p = row.payload ?? {};
    if (getString(p.status) === "received_by_customer") return { ok: true };

    await appendEvent("botly_order", {
      ...p,
      orderId: data.orderId,
      status: "received_by_customer",
      receivedAt: new Date().toISOString(),
    });
    return { ok: true };
  });
