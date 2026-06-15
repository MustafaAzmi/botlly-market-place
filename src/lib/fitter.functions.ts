import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendEvent,
  eventTime,
  getNumber,
  getString,
  listEvents,
  normalizePhone,
  phoneKey,
  randomToken,
  sha256,
  type EventRow,
} from "@/lib/eventStore.server";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";

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
  currency: string;
  commissionPercent: number;
  commissionAmount: number;
  createdAt: string;
};

export type FitterSummary = {
  fitter: FitterProfile;
  totalProfit: number;
  currency: string;
  salesCount: number;
  sales: FitterSale[];
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

const confirmSaleInput = tokenInput.extend({
  productId: z.string().trim().min(1),
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
  const fitters = await latestFitters();
  return fitters.find((row) => phoneKey(getString(row.payload?.whatsapp)) === key) ?? null;
}

async function findFitterById(fitterId: string): Promise<EventRow | null> {
  const fitters = await latestFitters();
  return fitters.find((row) => fitterIdentity(row) === fitterId) ?? null;
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
  const rows = await listEvents("botly_fitter_session");
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
    const row = await appendEvent("botly_fitter", {
      fitterId: crypto.randomUUID(),
      whatsapp: data.whatsapp,
      name: data.name,
      city: data.city,
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
    const updated = await appendEvent("botly_fitter", {
      ...(row.payload ?? {}),
      fitterId: fitterIdentity(row),
      name: data.name,
      city: data.city,
      address: data.address,
      latitude: data.latitude,
      longitude: data.longitude,
      visaNumber: data.visaNumber,
      updatedAt: new Date().toISOString(),
    });
    return { fitter: toFitter(updated) };
  });

async function resolveProduct(productId: string) {
  const products = await listEvents("botly_product");
  const row = products.find((event) => (getString(event.payload?.productId) || event.id) === productId);
  if (!row) throw new Error("المنتج غير متوفر حالياً.");
  const p = row.payload ?? {};
  if (getString(p.status) !== "active" || getString(p.availability) === "out_of_stock") {
    throw new Error("المنتج غير متوفر حالياً.");
  }
  const price = getNumber(p.discountPrice) ?? getNumber(p.currentPrice);
  if (price === undefined) throw new Error("سعر المنتج غير واضح حالياً.");
  return {
    id: getString(p.productId) || row.id,
    title: getString(p.title) || getString(p.description) || "منتج",
    price,
    currency: getString(p.currency) || "IQD",
    merchantId: getString(p.merchantId),
    merchantWhatsapp: getString(p.whatsapp),
  };
}

async function resolveMerchantContact(merchantId: string, fallbackWhatsapp = "") {
  let whatsapp = fallbackWhatsapp;
  let storeName = "";
  if (!merchantId) return { whatsapp, storeName };
  const merchants = await listEvents("botly_merchant").catch(() => [] as EventRow[]);
  const row = merchants.find((event) => (getString(event.payload?.merchantId) || event.id) === merchantId);
  if (row) {
    whatsapp = getString(row.payload?.whatsapp) || getString(row.payload?.whatsappNormalized) || whatsapp;
    storeName = getString(row.payload?.storeName);
  }
  return { whatsapp, storeName };
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
  merchant: { whatsapp: string; storeName: string };
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
  lines.push(
    `واتساب التاجر: ${args.merchant.whatsapp || "غير متوفر"}`,
    "",
    "ملاحظة: هذه رسالة فيتر وليست رسالة زبون.",
  );
  return lines.join("\n");
}

async function sendFitterOrderToMediators(message: string) {
  const mediatorPhones = await readMediatorPhones();
  const results = [];
  for (const phone of mediatorPhones) {
    const recipient = toWhatsAppRecipient(phone);
    try {
      const result = await sendWhatsAppText(recipient, message);
      results.push({ phone: recipient, ...result });
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
    currency: getString(p.currency) || "IQD",
    commissionPercent: getNumber(p.commissionPercent) ?? 0,
    commissionAmount: getNumber(p.commissionAmount) ?? 0,
    createdAt: getString(p.createdAt) || eventTime(row),
  };
}

async function latestResetTime(fitterId: string): Promise<number> {
  const rows = await listEvents("botly_fitter_reset");
  const latest = rows.find((row) => getString(row.payload?.fitterId) === fitterId);
  if (!latest) return 0;
  return new Date(getString(latest.payload?.createdAt) || eventTime(latest)).getTime();
}

export const confirmFitterReceipt = createServerFn({ method: "POST" })
  .inputValidator((d) => confirmSaleInput.parse(d))
  .handler(async ({ data }) => {
    const fitter = await authorizeFitter(data.token);
    const product = await resolveProduct(data.productId);
    const merchant = await resolveMerchantContact(product.merchantId, product.merchantWhatsapp);
    const commissionPercent = getNumber(fitter.payload?.commissionPercent) ?? 0;
    const commissionAmount = Number(((product.price * commissionPercent) / 100).toFixed(2));
    const mediatorMessage = buildFitterMediatorMessage({
      fitter,
      product,
      merchant,
      commissionPercent,
      commissionAmount,
    });
    const whatsappSendResults = await sendFitterOrderToMediators(mediatorMessage);
    await appendEvent("botly_fitter_sale", {
      saleId: crypto.randomUUID(),
      fitterId: fitterIdentity(fitter),
      fitterWhatsapp: getString(fitter.payload?.whatsapp),
      fitterName: getString(fitter.payload?.name),
      fitterCity: getString(fitter.payload?.city),
      fitterAddress: getString(fitter.payload?.address),
      fitterLocationLink: fitterLocationLink(fitter),
      productId: product.id,
      productTitle: product.title,
      productPrice: product.price,
      currency: product.currency,
      merchantId: product.merchantId,
      merchantStoreName: merchant.storeName,
      merchantWhatsapp: merchant.whatsapp,
      commissionPercent,
      commissionAmount,
      mediatorMessage,
      whatsappSent: whatsappSendResults.some((result) => result.ok),
      whatsappSendResults,
      createdAt: new Date().toISOString(),
    });
    return { ok: true, commissionAmount, currency: product.currency };
  });

export const getFitterSummary = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }): Promise<FitterSummary> => {
    const fitterRow = await authorizeFitter(data.token);
    const fitter = toFitter(fitterRow);
    const resetAt = await latestResetTime(fitter.id);
    const sales = (await listEvents("botly_fitter_sale"))
      .filter((row) => getString(row.payload?.fitterId) === fitter.id)
      .map(toSale)
      .filter((sale) => new Date(sale.createdAt).getTime() > resetAt);
    const totalProfit = Number(sales.reduce((sum, sale) => sum + sale.commissionAmount, 0).toFixed(2));
    return {
      fitter,
      totalProfit,
      currency: sales[0]?.currency ?? "IQD",
      salesCount: sales.length,
      sales,
    };
  });
