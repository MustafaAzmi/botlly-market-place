import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  diagnoseServerResult,
  diagnosticIdentity,
  diagnosticSession,
} from "@/lib/egress-diagnostics.server";
import {
  appendEvent,
  eventTime,
  getNumber,
  getString,
  latestEventWhere,
  listEvents,
  listEventsByPayloadField,
  normalizePhone,
  phoneKey,
  randomToken,
  sha256,
  type EventRow,
} from "@/lib/eventStore.server";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";
import { normalizeGovernorate } from "@/lib/governorates";

export type FitterProfile = {
  id: string;
  whatsapp: string;
  name: string;
  city: string;
  address: string;
  latitude?: number;
  longitude?: number;
  visaNumber: string;
  commissionPercent: number;
  createdAt: string;
  updatedAt: string;
};

export type FitterSale = {
  id: string;
  fitterId: string;
  productId: string;
  productTitle: string;
  productPrice: number;
  productCurrentPrice: number;
  currency: string;
  commissionPercent: number;
  commissionAmount: number;
  createdAt: string;
};

export type FitterOrderStatus = "requested" | "confirmed" | "cancelled";

export type FitterOrder = {
  id: string;
  fitterId: string;
  productId: string;
  productTitle: string;
  productPrice: number;
  productCurrentPrice: number;
  currency: string;
  merchantId: string;
  merchantStoreName: string;
  merchantWhatsapp: string;
  merchantAddress: string;
  merchantGovernorate: string;
  commissionPercent: number;
  commissionAmount: number;
  status: FitterOrderStatus;
  createdAt: string;
  updatedAt: string;
};

export type FitterSummary = {
  fitter: FitterProfile;
  totalProfit: number;
  currency: string;
  salesCount: number;
  sales: FitterSale[];
  orders: FitterOrder[];
};

const authInput = z.object({
  whatsapp: z.string().trim().min(6).max(40),
  password: z.string().min(4).max(200),
});

const signupInput = authInput.extend({
  name: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  address: z.string().trim().min(2).max(200),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  visaNumber: z.string().trim().max(80).optional().or(z.literal("")),
});

const tokenInput = z.object({ token: z.string().trim().min(20).max(300) });

const visaInput = tokenInput.extend({
  visaNumber: z.string().trim().max(80),
});

const profileInput = tokenInput.extend({
  name: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  address: z.string().trim().min(2).max(200),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  visaNumber: z.string().trim().max(80),
});

const productOrderInput = tokenInput.extend({
  productId: z.string().trim().min(1),
});

const orderActionInput = tokenInput.extend({
  orderId: z.string().trim().min(1),
});

async function hashPassword(password: string, salt: string) {
  return sha256(`${salt}:${password}`);
}

function fitterIdentity(row: EventRow) {
  return getString(row.payload?.fitterId) || row.id;
}

function toFitter(row: EventRow): FitterProfile {
  const p = row.payload ?? {};
  return {
    id: fitterIdentity(row),
    whatsapp: getString(p.whatsapp),
    name: getString(p.name) || "فيتر",
    city: getString(p.city),
    address: getString(p.address),
    latitude: getNumber(p.latitude),
    longitude: getNumber(p.longitude),
    visaNumber: getString(p.visaNumber),
    commissionPercent: getNumber(p.commissionPercent) ?? 0,
    createdAt: getString(p.createdAt) || eventTime(row),
    updatedAt: getString(p.updatedAt) || eventTime(row),
  };
}

async function latestFitters(): Promise<EventRow[]> {
  const rows = await listEvents("botly_fitter");
  const seen = new Map<string, EventRow>();
  for (const row of rows) {
    const id = fitterIdentity(row);
    if (!seen.has(id)) seen.set(id, row);
  }
  return [...seen.values()].filter((row) => !getString(row.payload?.deletedAt));
}

async function findFitterByPhone(whatsapp: string): Promise<EventRow | null> {
  const key = phoneKey(whatsapp);
  if (!key) return null;
  const variants = [...new Set([whatsapp, normalizePhone(whatsapp)])].filter(Boolean);
  const fitters = (
    await Promise.all(
      variants.map((variant) =>
        listEventsByPayloadField("botly_fitter", "whatsapp", variant, 1),
      ),
    )
  ).flat();
  return fitters.find((row) => phoneKey(getString(row.payload?.whatsapp)) === key) ?? null;
}

async function findFitterById(fitterId: string): Promise<EventRow | null> {
  return await latestEventWhere("botly_fitter", "fitterId", fitterId);
}

async function createFitterSession(fitterId: string): Promise<string> {
  const token = randomToken();
  await appendEvent("botly_fitter_session", {
    fitterId,
    tokenHash: await sha256(token),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  });
  return token;
}

async function authorizeFitter(token: string): Promise<EventRow> {
  const tokenHash = await sha256(token);
  const rows = await listEventsByPayloadField(
    "botly_fitter_session",
    "tokenHash",
    tokenHash,
    1,
  );
  const session = rows.find((row) => {
    const p = row.payload ?? {};
    return (
      getString(p.tokenHash) === tokenHash &&
      new Date(getString(p.expiresAt)).getTime() > Date.now()
    );
  });
  if (!session) throw new Error("انتهت جلسة الفيتر. سجل دخول مرة ثانية.");
  const fitter = await findFitterById(getString(session.payload?.fitterId));
  if (!fitter) throw new Error("لم يتم العثور على حساب الفيتر.");
  return fitter;
}

export const signupFitter = createServerFn({ method: "POST" })
  .inputValidator((d) => signupInput.parse(d))
  .handler(async ({ data }) => {
    const existing = await findFitterByPhone(data.whatsapp);
    if (existing) throw new Error("هذا الرقم مسجل كفيتر. سجل دخولك مباشرة.");

    const salt = randomToken();
    const now = new Date().toISOString();
    const city = normalizeGovernorate(data.city);
    const row = await appendEvent("botly_fitter", {
      fitterId: crypto.randomUUID(),
      whatsapp: data.whatsapp,
      name: data.name,
      city,
      address: data.address,
      latitude: data.latitude,
      longitude: data.longitude,
      visaNumber: data.visaNumber ?? "",
      commissionPercent: 0,
      passwordSalt: salt,
      passwordHash: await hashPassword(data.password, salt),
      createdAt: now,
      updatedAt: now,
    });
    const fitter = toFitter(row);
    const token = await createFitterSession(fitter.id);
    return { fitter, token };
  });

export const loginFitter = createServerFn({ method: "POST" })
  .inputValidator((d) => authInput.parse(d))
  .handler(async ({ data }) => {
    const row = await findFitterByPhone(data.whatsapp);
    if (!row) throw new Error("رقم الفيتر غير مسجل.");
    const salt = getString(row.payload?.passwordSalt);
    const expected = getString(row.payload?.passwordHash);
    const actual = await hashPassword(data.password, salt);
    if (!salt || actual !== expected) throw new Error("كلمة المرور غير صحيحة.");
    const fitter = toFitter(row);
    const token = await createFitterSession(fitter.id);
    return { fitter, token };
  });

export const updateFitterVisa = createServerFn({ method: "POST" })
  .inputValidator((d) => visaInput.parse(d))
  .handler(async ({ data }) => {
    const row = await authorizeFitter(data.token);
    await appendEvent("botly_fitter", {
      ...(row.payload ?? {}),
      fitterId: fitterIdentity(row),
      visaNumber: data.visaNumber,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  });

export const updateFitterProfile = createServerFn({ method: "POST" })
  .inputValidator((d) => profileInput.parse(d))
  .handler(async ({ data }) => {
    const row = await authorizeFitter(data.token);
    const city = normalizeGovernorate(data.city);
    const updated = await appendEvent("botly_fitter", {
      ...(row.payload ?? {}),
      fitterId: fitterIdentity(row),
      name: data.name,
      city,
      address: data.address,
      latitude: data.latitude,
      longitude: data.longitude,
      visaNumber: data.visaNumber,
      updatedAt: new Date().toISOString(),
    });
    return { fitter: toFitter(updated) };
  });

async function resolveProduct(productId: string) {
  const row = await latestEventWhere("botly_product", "productId", productId);
  if (!row) throw new Error("المنتج غير متوفر حالياً.");
  const p = row.payload ?? {};
  if (getString(p.status) !== "active" || getString(p.availability) === "out_of_stock") {
    throw new Error("المنتج غير متوفر حالياً.");
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
    merchantId: getString(p.merchantId),
    merchantWhatsapp: getString(p.whatsapp),
    merchantGovernorate: getString(p.merchantCity),
  };
}

async function resolveMerchantContact(merchantId: string, fallbackWhatsapp = "") {
  let whatsapp = fallbackWhatsapp;
  let storeName = "";
  let address = "";
  let city = "";
  if (!merchantId) return { whatsapp, storeName, address, city };
  const row = await latestEventWhere("botly_merchant", "merchantId", merchantId);
  if (row) {
    whatsapp = getString(row.payload?.whatsapp) || getString(row.payload?.whatsappNormalized) || whatsapp;
    storeName = getString(row.payload?.storeName);
    address = getString(row.payload?.address);
    city = getString(row.payload?.city);
  }
  return { whatsapp, storeName, address, city };
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

const ALL_GOVERNORATES_MEDIATOR = "كل المحافظات";

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

function toWhatsAppRecipient(phone: string): string {
  return normalizePhone(phone).replace(/^\+/, "");
}

function fitterLocationLink(fitter: EventRow): string {
  const lat = getNumber(fitter.payload?.latitude);
  const lng = getNumber(fitter.payload?.longitude);
  if (lat === undefined || lng === undefined) return "";
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function buildFitterMediatorMessage(args: {
  fitter: EventRow;
  product: Awaited<ReturnType<typeof resolveProduct>>;
  merchant: { whatsapp: string; storeName: string; address: string };
  commissionPercent: number;
  commissionAmount: number;
}) {
  const p = args.fitter.payload ?? {};
  const mapLink = fitterLocationLink(args.fitter);
  const lines = [
    "طلب فيتر جديد:",
    `اسم الفيتر: ${getString(p.name) || "فيتر"}`,
    `رقم الفيتر: ${getString(p.whatsapp)}`,
    `المدينة: ${getString(p.city) || "-"}`,
    `عنوان الفيتر: ${getString(p.address) || "-"}`,
  ];
  if (mapLink) lines.push(`لوكيشن الفيتر: ${mapLink}`);
  lines.push(
    "",
    `المنتج: ${args.product.title}`,
    `السعر: ${args.product.price.toLocaleString()} ${args.product.currency}`,
    `عمولة الفيتر: ${args.commissionPercent}% = ${args.commissionAmount.toLocaleString()} ${args.product.currency}`,
  );
  if (args.merchant.storeName) lines.push(`المتجر: ${args.merchant.storeName}`);
  if (args.merchant.address) lines.push(`عنوان التاجر: ${args.merchant.address}`);
  lines.push(
    `واتساب التاجر: ${args.merchant.whatsapp || "غير متوفر"}`,
    "",
    "ملاحظة: هذه رسالة فيتر وليست رسالة زبون.",
  );
  return lines.join("\n");
}

function buildFitterCancelMessage(args: {
  order: FitterOrder;
  fitter: EventRow;
}) {
  const p = args.fitter.payload ?? {};
  const mapLink = fitterLocationLink(args.fitter);
  const lines = [
    "إلغاء طلبية فيتر:",
    `الطلبية: ${args.order.productTitle}`,
    `السعر: ${args.order.productPrice.toLocaleString()} ${args.order.currency}`,
    "",
    `اسم الفيتر: ${getString(p.name) || "فيتر"}`,
    `رقم الفيتر: ${getString(p.whatsapp)}`,
    `المدينة: ${getString(p.city) || "-"}`,
    `عنوان الفيتر: ${getString(p.address) || "-"}`,
  ];
  if (mapLink) lines.push(`لوكيشن الفيتر: ${mapLink}`);
  lines.push(
    "",
    `المتجر: ${args.order.merchantStoreName || "-"}`,
    `عنوان التاجر: ${args.order.merchantAddress || "-"}`,
    `واتساب التاجر: ${args.order.merchantWhatsapp || "غير متوفر"}`,
    "",
    "تم إلغاء الطلبية من جهة الفيتر. لا تحتسب عمولة هذا الطلب.",
  );
  return lines.join("\n");
}

async function sendFitterOrderToMediators(message: string, governorate: string) {
  const allMediatorContacts = await readMediatorContacts();
  const mediatorContacts = filterMediatorContactsByGovernorate(allMediatorContacts, governorate);
  const mediatorPhones = mediatorContacts.map((contact) => contact.phone);
  if (allMediatorContacts.length === 0) {
    throw new Error("أرقام الوسطاء غير مسجلة حالياً.");
  }
  if (mediatorPhones.length === 0) {
    throw new Error(`لا يوجد وسيط مسجل لمحافظة ${governorate || "هذا المنتج"}.`);
  }
  const results = await Promise.all(mediatorPhones.map(async (phone) => {
    const recipient = toWhatsAppRecipient(phone);
    try {
      const result = await sendWhatsAppText(recipient, message);
      return { phone: recipient, ...result };
    } catch (error) {
      return {
        phone: recipient,
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }));
  return results;
}

function hasSuccessfulWhatsAppSend(results: Array<{ ok?: unknown }>) {
  return results.some((result) => Boolean(result.ok));
}

function saleIdentity(row: EventRow) {
  return getString(row.payload?.saleId) || row.id;
}

function toSale(row: EventRow): FitterSale {
  const p = row.payload ?? {};
  return {
    id: saleIdentity(row),
    fitterId: getString(p.fitterId),
    productId: getString(p.productId),
    productTitle: getString(p.productTitle),
    productPrice: getNumber(p.productPrice) ?? 0,
    productCurrentPrice: getNumber(p.productCurrentPrice) ?? getNumber(p.productPrice) ?? 0,
    currency: getString(p.currency) || "IQD",
    commissionPercent: getNumber(p.commissionPercent) ?? 0,
    commissionAmount: getNumber(p.commissionAmount) ?? 0,
    createdAt: getString(p.createdAt) || eventTime(row),
  };
}

function orderIdentity(row: EventRow) {
  return getString(row.payload?.orderId) || row.id;
}

function toOrder(row: EventRow): FitterOrder {
  const p = row.payload ?? {};
  const status = getString(p.status);
  return {
    id: orderIdentity(row),
    fitterId: getString(p.fitterId),
    productId: getString(p.productId),
    productTitle: getString(p.productTitle),
    productPrice: getNumber(p.productPrice) ?? 0,
    productCurrentPrice: getNumber(p.productCurrentPrice) ?? getNumber(p.productPrice) ?? 0,
    currency: getString(p.currency) || "IQD",
    merchantId: getString(p.merchantId),
    merchantStoreName: getString(p.merchantStoreName),
    merchantWhatsapp: getString(p.merchantWhatsapp),
    merchantAddress: getString(p.merchantAddress),
    merchantGovernorate: getString(p.merchantGovernorate),
    commissionPercent: getNumber(p.commissionPercent) ?? 0,
    commissionAmount: getNumber(p.commissionAmount) ?? 0,
    status:
      status === "confirmed" || status === "cancelled" || status === "requested"
        ? status
        : "requested",
    createdAt: getString(p.createdAt) || eventTime(row),
    updatedAt: getString(p.updatedAt) || getString(p.createdAt) || eventTime(row),
  };
}

function currentFitterCommissionPercent(fitter: EventRow) {
  return Math.min(100, Math.max(0, getNumber(fitter.payload?.commissionPercent) ?? 0));
}

function calculateCommission(amount: number, percent: number) {
  return Number(((amount * percent) / 100).toFixed(2));
}

async function latestFitterOrders(fitterId: string): Promise<FitterOrder[]> {
  const rows = await listEvents("botly_fitter_order");
  const latest = new Map<string, FitterOrder>();
  for (const row of rows) {
    if (getString(row.payload?.fitterId) !== fitterId) continue;
    const orderId = orderIdentity(row);
    if (!latest.has(orderId)) latest.set(orderId, toOrder(row));
  }
  return [...latest.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function latestFitterOrder(fitterId: string, orderId: string): Promise<FitterOrder | null> {
  const orders = await latestFitterOrders(fitterId);
  return orders.find((order) => order.id === orderId) ?? null;
}

function buildOrderPayload(args: {
  orderId: string;
  fitter: EventRow;
  product: Awaited<ReturnType<typeof resolveProduct>>;
  merchant: Awaited<ReturnType<typeof resolveMerchantContact>>;
  status: FitterOrderStatus;
  commissionPercent: number;
  commissionAmount: number;
  mediatorMessage?: string;
  whatsappSendResults?: unknown[];
}) {
  const now = new Date().toISOString();
  return {
    orderId: args.orderId,
    fitterId: fitterIdentity(args.fitter),
    fitterWhatsapp: getString(args.fitter.payload?.whatsapp),
    fitterName: getString(args.fitter.payload?.name),
    fitterCity: getString(args.fitter.payload?.city),
    fitterAddress: getString(args.fitter.payload?.address),
    fitterLocationLink: fitterLocationLink(args.fitter),
    productId: args.product.id,
    productTitle: args.product.title,
    productPrice: args.product.price,
    productCurrentPrice: args.product.currentPrice ?? args.product.price,
    currency: args.product.currency,
    merchantId: args.product.merchantId,
    merchantStoreName: args.merchant.storeName,
    merchantWhatsapp: args.merchant.whatsapp,
    merchantAddress: args.merchant.address,
    merchantGovernorate: args.product.merchantGovernorate || args.merchant.city,
    commissionPercent: args.commissionPercent,
    commissionAmount: args.commissionAmount,
    status: args.status,
    mediatorMessage: args.mediatorMessage ?? "",
    whatsappSent: (args.whatsappSendResults ?? []).some(
      (result) => Boolean((result as { ok?: unknown }).ok),
    ),
    whatsappSendResults: args.whatsappSendResults ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

async function latestResetTime(fitterId: string): Promise<number> {
  const rows = await listEvents("botly_fitter_reset");
  const latest = rows.find((row) => getString(row.payload?.fitterId) === fitterId);
  if (!latest) return 0;
  return new Date(getString(latest.payload?.createdAt) || eventTime(latest)).getTime();
}

export const requestFitterProduct = createServerFn({ method: "POST" })
  .inputValidator((d) => productOrderInput.parse(d))
  .handler(async ({ data }) => {
    const fitter = await authorizeFitter(data.token);
    const product = await resolveProduct(data.productId);
    const merchant = await resolveMerchantContact(product.merchantId, product.merchantWhatsapp);
    const orderGovernorate = product.merchantGovernorate || merchant.city;
    const commissionPercent = currentFitterCommissionPercent(fitter);
    const commissionAmount = calculateCommission(product.price, commissionPercent);
    const orderId = crypto.randomUUID();
    const mediatorMessage = buildFitterMediatorMessage({
      fitter,
      product,
      merchant,
      commissionPercent,
      commissionAmount,
    });
    const whatsappSendResults = await sendFitterOrderToMediators(mediatorMessage, orderGovernorate);
    if (!hasSuccessfulWhatsAppSend(whatsappSendResults)) {
      throw new Error("تعذر إرسال طلب المنتج إلى الوسيط عبر واتساب.");
    }
    const scopedMediatorContacts = filterMediatorContactsByGovernorate(
      await readMediatorContacts().catch(() => [] as MediatorContact[]),
      orderGovernorate,
    );
    const merchantAvailabilityResult = {
      ok: false,
      status: 0,
      skipped: true,
      reason: "web_notifications_only",
    };
    await appendEvent("botly_order", {
      orderId,
      sourceContext: "fitter_site",
      requesterType: "fitter",
      requesterPhone: getString(fitter.payload?.whatsapp),
      fitterOrderId: orderId,
      fitterId: fitterIdentity(fitter),
      fitterName: getString(fitter.payload?.name),
      fitterWhatsapp: getString(fitter.payload?.whatsapp),
      fitterCity: getString(fitter.payload?.city),
      fitterAddress: getString(fitter.payload?.address),
      fitterLocationLink: fitterLocationLink(fitter),
      productId: product.id,
      productTitle: product.title,
      price: product.price,
      currentPrice: product.currentPrice,
      currency: product.currency,
      merchantId: product.merchantId,
      merchantStoreName: merchant.storeName,
      storeName: merchant.storeName,
      merchantWhatsapp: merchant.whatsapp,
      merchantAddress: merchant.address,
      mediatorPhones: scopedMediatorContacts.map((contact) => contact.phone),
      mediatorContacts: scopedMediatorContacts,
      merchantGovernorate: orderGovernorate,
      merchantAvailabilityAsked: merchantAvailabilityResult.ok,
      merchantAvailabilityResult,
      createdAt: new Date().toISOString(),
    }).catch((error) =>
      console.error("[Fitter] Failed to record merchant availability order", error),
    );
    const row = await appendEvent("botly_fitter_order", buildOrderPayload({
      orderId,
      fitter,
      product,
      merchant,
      status: "requested",
      commissionPercent,
      commissionAmount,
      mediatorMessage,
      whatsappSendResults,
    }));
    return { ok: true, order: toOrder(row) };
  });

export const confirmFitterReceipt = createServerFn({ method: "POST" })
  .inputValidator((d) => orderActionInput.parse(d))
  .handler(async ({ data }) => {
    const fitter = await authorizeFitter(data.token);
    const fitterId = fitterIdentity(fitter);
    const order = await latestFitterOrder(fitterId, data.orderId);
    if (!order) throw new Error("الطلبية غير موجودة.");
    if (order.status === "confirmed") throw new Error("تم تأكيد هذه الطلبية سابقاً.");
    if (order.status === "cancelled") throw new Error("هذه الطلبية ملغية ولا يمكن تأكيدها.");

    const product = {
      id: order.productId,
      title: order.productTitle,
      price: order.productPrice,
      currentPrice: order.productCurrentPrice || order.productPrice,
      currency: order.currency,
      merchantId: order.merchantId,
      merchantWhatsapp: order.merchantWhatsapp,
      merchantGovernorate: order.merchantGovernorate,
    };
    const merchant = {
      whatsapp: order.merchantWhatsapp,
      storeName: order.merchantStoreName,
      address: order.merchantAddress,
      city: order.merchantGovernorate,
    };
    const commissionPercent = currentFitterCommissionPercent(fitter);
    const commissionAmount = calculateCommission(order.productPrice, commissionPercent);
    await appendEvent("botly_fitter_order", buildOrderPayload({
      orderId: order.id,
      fitter,
      product,
      merchant,
      status: "confirmed",
      commissionPercent,
      commissionAmount,
    }));
    await appendEvent("botly_fitter_sale", {
      saleId: crypto.randomUUID(),
      orderId: order.id,
      fitterId,
      fitterWhatsapp: getString(fitter.payload?.whatsapp),
      fitterName: getString(fitter.payload?.name),
      fitterCity: getString(fitter.payload?.city),
      fitterAddress: getString(fitter.payload?.address),
      fitterLocationLink: fitterLocationLink(fitter),
      productId: order.productId,
      productTitle: order.productTitle,
      productPrice: order.productPrice,
      productCurrentPrice: order.productCurrentPrice,
      currency: order.currency,
      merchantId: order.merchantId,
      merchantStoreName: order.merchantStoreName,
      merchantWhatsapp: order.merchantWhatsapp,
      merchantAddress: order.merchantAddress,
      commissionPercent,
      commissionAmount,
      createdAt: new Date().toISOString(),
    });
    return { ok: true, commissionAmount, currency: order.currency };
  });

export const cancelFitterOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => orderActionInput.parse(d))
  .handler(async ({ data }) => {
    const fitter = await authorizeFitter(data.token);
    const fitterId = fitterIdentity(fitter);
    const order = await latestFitterOrder(fitterId, data.orderId);
    if (!order) throw new Error("الطلبية غير موجودة.");
    if (order.status === "cancelled") throw new Error("تم إلغاء هذه الطلبية سابقاً.");

    const message = buildFitterCancelMessage({ order, fitter });
    const whatsappSendResults = await sendFitterOrderToMediators(message, order.merchantGovernorate);
    if (!hasSuccessfulWhatsAppSend(whatsappSendResults)) {
      throw new Error("تعذر إرسال إلغاء الطلبية إلى الوسيط عبر واتساب.");
    }
    const product = {
      id: order.productId,
      title: order.productTitle,
      price: order.productPrice,
      currentPrice: order.productCurrentPrice || order.productPrice,
      currency: order.currency,
      merchantId: order.merchantId,
      merchantWhatsapp: order.merchantWhatsapp,
      merchantGovernorate: order.merchantGovernorate,
    };
    const merchant = {
      whatsapp: order.merchantWhatsapp,
      storeName: order.merchantStoreName,
      address: order.merchantAddress,
      city: order.merchantGovernorate,
    };
    const row = await appendEvent("botly_fitter_order", buildOrderPayload({
      orderId: order.id,
      fitter,
      product,
      merchant,
      status: "cancelled",
      commissionPercent: order.commissionPercent,
      commissionAmount: order.commissionAmount,
      mediatorMessage: message,
      whatsappSendResults,
    }));
    return { ok: true, order: toOrder(row) };
  });

export const getFitterSummary = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }): Promise<FitterSummary> => {
    const fitterRow = await authorizeFitter(data.token);
    const fitter = toFitter(fitterRow);
    const resetAt = await latestResetTime(fitter.id);
    const orders = (await latestFitterOrders(fitter.id)).filter(
      (order) => new Date(order.updatedAt).getTime() > resetAt,
    );
    const confirmedOrders = orders.filter((order) => order.status === "confirmed");
    const legacySales = (await listEvents("botly_fitter_sale"))
      .filter((row) => getString(row.payload?.fitterId) === fitter.id)
      .filter((row) => !getString(row.payload?.orderId))
      .map(toSale)
      .filter((sale) => new Date(sale.createdAt).getTime() > resetAt);
    const orderSales: FitterSale[] = confirmedOrders.map((order) => ({
      id: order.id,
      fitterId: order.fitterId,
      productId: order.productId,
      productTitle: order.productTitle,
      productPrice: order.productPrice,
      productCurrentPrice: order.productCurrentPrice,
      currency: order.currency,
      commissionPercent: order.commissionPercent || fitter.commissionPercent,
      commissionAmount:
        order.commissionAmount || calculateCommission(order.productPrice, order.commissionPercent || fitter.commissionPercent),
      createdAt: order.updatedAt,
    }));
    const sales = [...orderSales, ...legacySales];
    const totalProfit = Number(sales.reduce((sum, sale) => sum + sale.commissionAmount, 0).toFixed(2));
    return diagnoseServerResult("api:getFitterSummary", {
      fitter,
      totalProfit,
      currency: sales[0]?.currency ?? "IQD",
      salesCount: sales.length,
      sales,
      orders,
    }, {
      user: diagnosticIdentity(fitter.id),
      session: diagnosticSession(data.token),
    });
  });
