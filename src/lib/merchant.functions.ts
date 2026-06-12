import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseCatalogueConfig, toEnabledCatalogue, type CarMake } from "@/lib/car-data";

const MERCHANT_PROVIDER = "botly_merchant";
const PRODUCT_PROVIDER = "botly_product";
const SESSION_PROVIDER = "botly_session";
const SESSION_TTL_DAYS = 30;

type EventStore = "whatsapp_webhook_events" | "broadcasts";

type EventRow = {
  id: string;
  payload: Record<string, unknown>;
  created_at?: string;
  received_at?: string;
};

export type MerchantProfile = {
  id: string;
  storeName: string;
  // URL-safe unique store identifier. Derived from the store name when it's
  // English; a unique number when the name is Arabic (Arabic text breaks URLs).
  storeSlug?: string;
  whatsapp: string;
  email?: string;
  bio?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  deliveryPhone?: string;
  logoUrl?: string;
  coverUrl?: string;
  bannedFromBot: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MerchantProduct = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  // All product photos (first one == imageUrl). Older products have only one.
  imageUrls: string[];
  currentPrice: number;
  // "السعر النهائي" — the only price customers ever see.
  discountPrice?: number;
  currency: string;
  size?: string;
  color?: string;
  quantity?: number;
  // Which car this part/accessory fits (from the fixed car catalogue).
  carMake?: string;
  carModel?: string;
  // Manufacture year the part fits (e.g. "2016"). Empty = fits all years.
  carYear?: string;
  createdAt: string;
};

export type MerchantDashboard = {
  profile: MerchantProfile;
  products: MerchantProduct[];
  stats: {
    products: number;
    searches: number;
    orders: number;
    completion: number;
  };
};

const authInput = z.object({
  whatsapp: z.string().trim().min(3).max(40),
  password: z.string().min(6).max(200),
});

const signupInput = authInput.extend({
  storeName: z.string().trim().min(1).max(140),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
});

const tokenInput = z.object({
  token: z.string().trim().min(20).max(300),
});

const profileInput = tokenInput.extend({
  storeName: z.string().trim().min(1).max(140),
  whatsapp: z.string().trim().min(3).max(40),
  bio: z.string().trim().max(500).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  deliveryPhone: z.string().trim().max(40).optional().or(z.literal("")),
  logoUrl: z.string().max(2_500_000).optional().or(z.literal("")),
  coverUrl: z.string().max(2_500_000).optional().or(z.literal("")),
});

// Either a normal http(s) link, or an inline base64 image (data:image/...)
// produced by the dashboard's file-upload path (client-side compressed).
const imageUrlSchema = z
  .string()
  .min(1, "رابط الصورة مطلوب")
  .max(3_000_000)
  .refine((value) => {
    if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value)) return true;
    if (value.length > 2_000) return false;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "رابط الصورة غير صحيح");

const productInput = tokenInput.extend({
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1).max(280),
  imageUrl: imageUrlSchema,
  // Additional photos beyond the primary one (up to 6 total).
  imageUrls: z.array(imageUrlSchema).max(6).optional(),
  currentPrice: z.number().min(0).max(999_999_999),
  discountPrice: z.number().min(0).max(999_999_999).optional(),
  currency: z.string().trim().min(1).max(8),
  size: z.string().trim().max(80).optional().or(z.literal("")),
  color: z.string().trim().max(80).optional().or(z.literal("")),
  quantity: z.number().int().min(0).max(999_999).optional(),
  carMake: z.string().trim().max(60).optional().or(z.literal("")),
  carModel: z.string().trim().max(60).optional().or(z.literal("")),
  carYear: z.string().trim().max(10).optional().or(z.literal("")),
});

let resolvedEventStore: EventStore | null = null;

function normalizePhone(phone: string) {
  return phone
    .replace(/[^\d+]/g, "")
    .replace(/^00/, "+")
    .trim();
}

// Format-independent phone identity: "07801234567", "+9647801234567" and
// "9647801234567" are all the same subscriber. Comparing the last 10 digits
// makes login work no matter which format the merchant typed at signup.
function phoneKey(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("42p01") || text.includes("does not exist") || text.includes("relation");
}

function explainDbError(prefix: string, error: { message?: string; code?: string } | null) {
  if (!error) return prefix;
  const code = error.code ? ` (${error.code})` : "";
  const message = error.message ? `: ${error.message}` : "";
  return `${prefix}${code}${message}`;
}

function eventTime(row: EventRow) {
  return row.created_at ?? row.received_at ?? new Date().toISOString();
}

function merchantIdentity(row: EventRow) {
  return getString(row.payload?.merchantId) || row.id;
}

// Slugify an English store name for use in URLs. Returns "" when the name has
// no usable latin characters (e.g. an Arabic name) — caller falls back to a
// numeric identifier instead.
function slugifyStoreName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// Unique URL identifier for a store. English name → readable slug ("yosif");
// Arabic name → unique number so the URL never contains Arabic text.
async function generateStoreSlug(storeName: string): Promise<string> {
  const rows = await listEvents(MERCHANT_PROVIDER);
  const taken = new Set(
    rows.map((row) => getString(row.payload?.storeSlug)).filter(Boolean),
  );

  const base = slugifyStoreName(storeName);
  if (base.length >= 2) {
    if (!taken.has(base)) return base;
    for (let i = 2; i < 1000; i += 1) {
      const candidate = `${base}-${i}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  // Arabic (or unusable) name: issue a unique store number.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = String(100000 + Math.floor(Math.random() * 900000));
    if (!taken.has(candidate)) return candidate;
  }
  return String(Date.now());
}

function toProfile(row: EventRow): MerchantProfile {
  const payload = row.payload ?? {};
  return {
    id: merchantIdentity(row),
    storeName: getString(payload.storeName),
    storeSlug: getString(payload.storeSlug) || undefined,
    whatsapp: getString(payload.whatsapp),
    email: getString(payload.email) || undefined,
    bio: getString(payload.bio) || undefined,
    address: getString(payload.address) || undefined,
    latitude: getNumber(payload.latitude),
    longitude: getNumber(payload.longitude),
    deliveryPhone: getString(payload.deliveryPhone) || undefined,
    logoUrl: getString(payload.logoUrl) || undefined,
    coverUrl: getString(payload.coverUrl) || undefined,
    bannedFromBot: payload.bannedFromBot === true,
    createdAt: getString(payload.createdAt) || eventTime(row),
    updatedAt: getString(payload.updatedAt) || eventTime(row),
  };
}

function toProduct(row: EventRow): MerchantProduct {
  const payload = row.payload ?? {};
  const primaryImage = getString(payload.imageUrl);
  const extraImages = Array.isArray(payload.imageUrls)
    ? (payload.imageUrls as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0)
    : [];
  const imageUrls = extraImages.length > 0 ? extraImages : primaryImage ? [primaryImage] : [];
  return {
    id: getString(payload.productId) || row.id,
    title: getString(payload.title) || getString(payload.description) || "منتج",
    description: getString(payload.description),
    imageUrl: primaryImage || imageUrls[0] || "",
    imageUrls,
    currentPrice: getNumber(payload.currentPrice) ?? 0,
    discountPrice: getNumber(payload.discountPrice),
    currency: getString(payload.currency) || "IQD",
    size: getString(payload.size) || undefined,
    color: getString(payload.color) || undefined,
    quantity: getNumber(payload.quantity),
    carMake: getString(payload.carMake) || undefined,
    carModel: getString(payload.carModel) || undefined,
    carYear: getString(payload.carYear) || undefined,
    createdAt: getString(payload.createdAt) || eventTime(row),
  };
}

function fromBroadcastRow(row: Record<string, unknown>): EventRow {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(String(row.body ?? "{}")) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return {
    id: String(row.id ?? ""),
    payload,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function hashPassword(password: string, salt: string) {
  return sha256(`${salt}:${password}`);
}

async function getEventStore(): Promise<EventStore> {
  if (resolvedEventStore) return resolvedEventStore;
  const probe = await supabaseAdmin.from("whatsapp_webhook_events").select("id").limit(1);
  resolvedEventStore = isMissingTableError(probe.error) ? "broadcasts" : "whatsapp_webhook_events";
  return resolvedEventStore;
}

async function listEvents(provider: string) {
  const store = await getEventStore();

  if (store === "broadcasts") {
    const list = await supabaseAdmin
      .from("broadcasts")
      .select("id,body,created_at")
      .eq("audience", `botly:${provider}`)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (list.error) throw new Error(explainDbError("تعذر قراءة بيانات المتجر من قاعدة البيانات", list.error));
    return (list.data ?? []).map((row) => fromBroadcastRow(row as Record<string, unknown>));
  }

  const primary = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id,payload,created_at")
    .eq("source", "botly")
    .eq("event_type", provider)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (!primary.error) return (primary.data ?? []) as EventRow[];

  const fallback = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id,payload,received_at")
    .eq("provider", provider)
    .order("received_at", { ascending: false })
    .limit(5000);

  if (isMissingTableError(fallback.error)) {
    resolvedEventStore = "broadcasts";
    return listEvents(provider);
  }
  if (fallback.error)
    throw new Error(explainDbError("تعذر قراءة بيانات المتجر من قاعدة البيانات", fallback.error));
  return (fallback.data ?? []) as EventRow[];
}

async function findMerchantByPhone(whatsapp: string) {
  const key = phoneKey(whatsapp);
  if (!key) return null;
  const rows = await listEvents(MERCHANT_PROVIDER);
  return (
    rows.find((row) => {
      const payload = row.payload ?? {};
      return (
        phoneKey(getString(payload.whatsappNormalized)) === key ||
        phoneKey(getString(payload.whatsapp)) === key
      );
    }) ?? null
  );
}

async function findMerchantById(id: string) {
  if (!id || !id.trim()) return null;
  const store = await getEventStore();

  // Avoid direct DB filtering by `id` because some projects use bigint ids.
  // We filter in-memory by business identity, which is always string-safe.
  if (store === "broadcasts") {
    const rows = await listEvents(MERCHANT_PROVIDER);
    return rows.find((row) => merchantIdentity(row) === id || row.id === id) ?? null;
  }

  const rows = await listEvents(MERCHANT_PROVIDER);
  return rows.find((row) => merchantIdentity(row) === id || row.id === id) ?? null;
}

async function insertEvent(provider: string, payload: Record<string, unknown>) {
  const store = await getEventStore();

  if (store === "broadcasts") {
    const created = await supabaseAdmin
      .from("broadcasts")
      .insert({
        title: provider,
        body: JSON.stringify(payload),
        status: "botly_event",
        audience: `botly:${provider}`,
        audience_label: "botly",
        recipients: 0,
      })
      .select("id,body,created_at")
      .single();

    if (created.error) throw new Error(explainDbError("تعذر حفظ بيانات المتجر", created.error));
    return fromBroadcastRow(created.data as Record<string, unknown>);
  }

  const primary = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .insert({
      source: "botly",
      event_type: provider,
      payload,
    })
    .select("id,payload,created_at")
    .single();

  if (!primary.error) return primary.data as EventRow;

  const fallback = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .insert({
      provider,
      payload,
    } as never)
    .select("id,payload,received_at")
    .single();

  if (isMissingTableError(fallback.error)) {
    resolvedEventStore = "broadcasts";
    return insertEvent(provider, payload);
  }
  if (fallback.error) throw new Error(explainDbError("تعذر حفظ بيانات المتجر", fallback.error));
  return fallback.data as EventRow;
}

async function createSession(merchant: EventRow) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const payload = merchant.payload ?? {};
  const merchantId = merchantIdentity(merchant);

  await insertEvent(SESSION_PROVIDER, {
    merchantId,
    merchantRowId: merchant.id,
    merchantPhone: getString(payload.whatsappNormalized) || normalizePhone(getString(payload.whatsapp)),
    tokenHash,
    expiresAt,
    createdAt: new Date().toISOString(),
  });
  return token;
}

export async function getAuthorizedMerchant(token: string) {
  const tokenHash = await sha256(token);
  const sessions = await listEvents(SESSION_PROVIDER);
  const session = sessions.find((row) => {
    const payload = row.payload ?? {};
    return (
      getString(payload.tokenHash) === tokenHash &&
      new Date(getString(payload.expiresAt)).getTime() > Date.now()
    );
  });

  if (!session) throw new Error("انتهت الجلسة. سجل دخول مرة ثانية.");

  const merchantId = getString(session.payload?.merchantId);
  const merchantRowId = getString(session.payload?.merchantRowId);
  const merchantPhone = getString(session.payload?.merchantPhone);

  let merchant = merchantId ? await findMerchantById(merchantId) : null;
  if (!merchant && merchantRowId) merchant = await findMerchantById(merchantRowId);
  if (!merchant && merchantPhone) merchant = await findMerchantByPhone(merchantPhone);
  if (!merchant) throw new Error("لم يتم العثور على المتجر.");
  return merchant;
}

function completionScore(profile: MerchantProfile, productCount: number) {
  let score = 35;
  if (profile.logoUrl) score += 15;
  if (profile.coverUrl) score += 15;
  if (profile.bio) score += 10;
  if (profile.deliveryPhone) score += 10;
  if (productCount > 0) score += 15;
  return Math.min(score, 100);
}

function buildManualProductKeywords(data: {
  title: string;
  description: string;
  size?: string;
  color?: string;
}) {
  return [data.title, data.description, data.size, data.color]
    .flatMap((value) => getString(value).split(/\s+/))
    .map((value) => value.trim())
    .filter((value, index, values) => value.length >= 2 && values.indexOf(value) === index)
    .slice(0, 16);
}

export const signupMerchant = createServerFn({ method: "POST" })
  .inputValidator((d) => signupInput.parse(d))
  .handler(async ({ data }) => {
    const existing = await findMerchantByPhone(data.whatsapp);
    if (existing) throw new Error("هذا الرقم مسجل مسبقاً. سجل دخول بدل إنشاء حساب جديد.");

    const salt = randomToken();
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(data.password, salt);
    const whatsappNormalized = normalizePhone(data.whatsapp);
    const merchantId = crypto.randomUUID();

    const storeSlug = await generateStoreSlug(data.storeName);

    const row = await insertEvent(MERCHANT_PROVIDER, {
      merchantId,
      storeName: data.storeName,
      storeSlug,
      whatsapp: data.whatsapp,
      whatsappNormalized,
      email: data.email || "",
      passwordSalt: salt,
      passwordHash,
      bio: "",
      address: "",
      latitude: undefined,
      longitude: undefined,
      deliveryPhone: "",
      logoUrl: "",
      coverUrl: "",
      bannedFromBot: false,
      createdAt: now,
      updatedAt: now,
    });

    const profile = toProfile(row);
    const token = await createSession(row);
    return { token, profile };
  });

export const loginMerchant = createServerFn({ method: "POST" })
  .inputValidator((d) => authInput.parse(d))
  .handler(async ({ data }) => {
    const row = await findMerchantByPhone(data.whatsapp);
    if (!row) throw new Error("رقم الواتساب غير مسجل.");

    const salt = getString(row.payload?.passwordSalt);
    const expectedHash = getString(row.payload?.passwordHash);
    const actualHash = await hashPassword(data.password, salt);
    if (!salt || actualHash !== expectedHash) throw new Error("كلمة المرور غير صحيحة.");

    const profile = toProfile(row);

    // Backfill: merchants registered before store slugs existed get one on
    // their next login so their dashboard URL is uniquely identified too.
    if (!profile.storeSlug) {
      const storeSlug = await generateStoreSlug(profile.storeName || profile.id);
      await insertEvent(MERCHANT_PROVIDER, {
        ...row.payload,
        storeSlug,
        updatedAt: new Date().toISOString(),
      });
      profile.storeSlug = storeSlug;
    }

    const token = await createSession(row);
    return { token, profile };
  });

export const getCurrentMerchant = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    const row = await getAuthorizedMerchant(data.token);
    return toProfile(row);
  });

export const updateMerchantProfile = createServerFn({ method: "POST" })
  .inputValidator((d) => profileInput.parse(d))
  .handler(async ({ data }) => {
    const row = await getAuthorizedMerchant(data.token);
    const currentPayload = row.payload ?? {};
    const nextPhone = normalizePhone(data.whatsapp);
    const currentPhone = getString(currentPayload.whatsappNormalized);

    if (nextPhone !== currentPhone) {
      const existing = await findMerchantByPhone(data.whatsapp);
      if (existing && merchantIdentity(existing) !== merchantIdentity(row)) {
        throw new Error("رقم الواتساب مستخدم بمتجر آخر.");
      }
    }

    const payload = {
      ...currentPayload,
      merchantId: merchantIdentity(row),
      storeName: data.storeName,
      whatsapp: data.whatsapp,
      whatsappNormalized: nextPhone,
      bio: data.bio || "",
      address: data.address || "",
      latitude: data.latitude,
      longitude: data.longitude,
      deliveryPhone: data.deliveryPhone || "",
      logoUrl: data.logoUrl || getString(currentPayload.logoUrl),
      coverUrl: data.coverUrl || getString(currentPayload.coverUrl),
      createdAt: getString(currentPayload.createdAt) || eventTime(row),
      updatedAt: new Date().toISOString(),
    };

    const updated = await insertEvent(MERCHANT_PROVIDER, payload);
    return toProfile(updated);
  });

export const createMerchantProduct = createServerFn({ method: "POST" })
  .inputValidator((d) => productInput.parse(d))
  .handler(async ({ data }) => {
    const merchant = await getAuthorizedMerchant(data.token);
    const now = new Date().toISOString();
    const keywords = buildManualProductKeywords(data);
    // Car make/model are part of the searchable text so WhatsApp queries like
    // "لايت مرسيدس" match parts tagged through the dashboard dropdowns.
    const searchText = [
      data.title,
      data.description,
      data.color,
      data.size,
      data.carMake,
      data.carModel,
      data.carYear,
      ...keywords,
    ]
      .filter(Boolean)
      .join(" ");

    const imageUrls = data.imageUrls?.length ? data.imageUrls : [data.imageUrl];

    const row = await insertEvent(PRODUCT_PROVIDER, {
      productId: crypto.randomUUID(),
      merchantId: merchantIdentity(merchant),
      source: "manual",
      platform: "manual",
      title: data.title,
      description: data.description,
      imageUrl: imageUrls[0],
      imageUrls,
      currentPrice: data.currentPrice,
      discountPrice: data.discountPrice,
      currency: data.currency,
      size: data.size || "",
      color: data.color || "",
      quantity: data.quantity,
      carMake: data.carMake || "",
      carModel: data.carModel || "",
      carYear: data.carYear || "",
      keywords,
      searchText,
      status: "active",
      availability: data.quantity === 0 ? "out_of_stock" : "in_stock",
      requiresReview: false,
      confidenceScore: 1,
      confidenceReason: "manual_merchant_entry",
      createdAt: now,
      updatedAt: now,
    });

    return toProduct(row);
  });

export const listMerchantProducts = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    const merchant = await getAuthorizedMerchant(data.token);
    const merchantId = merchantIdentity(merchant);
    const rows = await listEvents(PRODUCT_PROVIDER);
    // Append-only store: edits add rows with the same productId, so keep
    // only the newest event per product (rows come newest first).
    const seen = new Set<string>();
    const products: MerchantProduct[] = [];
    for (const row of rows) {
      if (getString(row.payload?.merchantId) !== merchantId) continue;
      const product = toProduct(row);
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      products.push(product);
    }
    return products;
  });

export const getMerchantProduct = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.extend({ productId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const merchant = await getAuthorizedMerchant(data.token);
    const merchantId = merchantIdentity(merchant);
    const rows = await listEvents(PRODUCT_PROVIDER);
    const row = rows.find(
      (row) =>
        getString(row.payload?.merchantId) === merchantId &&
        (getString(row.payload?.productId) === data.productId || row.id === data.productId),
    );
    if (!row) throw new Error("لم يتم العثور على المنتج.");
    return toProduct(row);
  });

const updateProductInput = tokenInput.extend({
  productId: z.string().min(1),
  title: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().min(1).max(280).optional(),
  imageUrl: imageUrlSchema.optional(),
  imageUrls: z.array(imageUrlSchema).max(6).optional(),
  currentPrice: z.number().min(0).max(999_999_999).optional(),
  discountPrice: z.number().min(0).max(999_999_999).optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  size: z.string().trim().max(80).optional().or(z.literal("")),
  color: z.string().trim().max(80).optional().or(z.literal("")),
  quantity: z.number().int().min(0).max(999_999).optional(),
  carMake: z.string().trim().max(60).optional().or(z.literal("")),
  carModel: z.string().trim().max(60).optional().or(z.literal("")),
  carYear: z.string().trim().max(10).optional().or(z.literal("")),
});

export const updateMerchantProduct = createServerFn({ method: "POST" })
  .inputValidator((d) => updateProductInput.parse(d))
  .handler(async ({ data }) => {
    const merchant = await getAuthorizedMerchant(data.token);
    const merchantId = merchantIdentity(merchant);
    const rows = await listEvents(PRODUCT_PROVIDER);
    const row = rows.find(
      (row) =>
        getString(row.payload?.merchantId) === merchantId &&
        (getString(row.payload?.productId) === data.productId || row.id === data.productId),
    );
    if (!row) throw new Error("لم يتم العثور على المنتج.");

    const currentPayload = row.payload ?? {};
    const keywords = buildManualProductKeywords({
      title: data.title || getString(currentPayload.title),
      description: data.description || getString(currentPayload.description),
      size: data.size || getString(currentPayload.size),
      color: data.color || getString(currentPayload.color),
    });

    const carMake = data.carMake !== undefined ? data.carMake : getString(currentPayload.carMake);
    const carModel = data.carModel !== undefined ? data.carModel : getString(currentPayload.carModel);
    const carYear = data.carYear !== undefined ? data.carYear : getString(currentPayload.carYear);

    const searchText = [
      data.title || getString(currentPayload.title),
      data.description || getString(currentPayload.description),
      data.color || getString(currentPayload.color),
      data.size || getString(currentPayload.size),
      carMake,
      carModel,
      carYear,
      ...keywords,
    ]
      .filter(Boolean)
      .join(" ");

    const quantity = data.quantity !== undefined ? data.quantity : getNumber(currentPayload.quantity);
    const existingImages = Array.isArray(currentPayload.imageUrls)
      ? (currentPayload.imageUrls as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    const imageUrls = data.imageUrls?.length
      ? data.imageUrls
      : existingImages.length > 0
        ? existingImages
        : [data.imageUrl || getString(currentPayload.imageUrl)].filter(Boolean);

    const productId = getString(currentPayload.productId) || data.productId;

    const payload = {
      ...currentPayload,
      productId,
      merchantId,
      title: data.title || getString(currentPayload.title),
      description: data.description || getString(currentPayload.description),
      imageUrl: imageUrls[0] || data.imageUrl || getString(currentPayload.imageUrl),
      imageUrls,
      currentPrice: data.currentPrice ?? getNumber(currentPayload.currentPrice),
      discountPrice: data.discountPrice ?? getNumber(currentPayload.discountPrice),
      currency: data.currency || getString(currentPayload.currency),
      size: data.size !== undefined ? data.size : getString(currentPayload.size),
      color: data.color !== undefined ? data.color : getString(currentPayload.color),
      quantity,
      carMake,
      carModel,
      carYear,
      keywords,
      searchText,
      availability: quantity === 0 ? "out_of_stock" : "in_stock",
      createdAt: getString(currentPayload.createdAt) || eventTime(row),
      updatedAt: new Date().toISOString(),
    };

    // Delete all old events for this product before inserting the new one,
    // otherwise the edited product shows up duplicated in listings. Matching
    // by productId AND by row id covers legacy rows without a productId.
    const oldRowIds = rows
      .filter(
        (r) =>
          getString(r.payload?.merchantId) === merchantId &&
          (getString(r.payload?.productId) === productId ||
            r.id === productId ||
            r.id === data.productId),
      )
      .map((r) => r.id);
    const store = await getEventStore();
    if (store === "broadcasts") {
      await supabaseAdmin.from("broadcasts").delete().in("id", oldRowIds);
    } else {
      await supabaseAdmin
        .from("whatsapp_webhook_events")
        .delete()
        .eq("source", "botly")
        .eq("event_type", PRODUCT_PROVIDER)
        .eq("payload->>productId" as never, productId);
      await supabaseAdmin
        .from("whatsapp_webhook_events")
        .delete()
        .eq("source", "botly")
        .eq("event_type", PRODUCT_PROVIDER)
        .in("id", oldRowIds);
    }

    const updated = await insertEvent(PRODUCT_PROVIDER, payload);
    return toProduct(updated);
  });

const deleteProductInput = tokenInput.extend({
  productId: z.string().min(1),
});

// Hard delete a product from the database (merchant-initiated).
export const deleteMerchantProduct = createServerFn({ method: "POST" })
  .inputValidator((d) => deleteProductInput.parse(d))
  .handler(async ({ data }) => {
    const merchant = await getAuthorizedMerchant(data.token);
    const merchantId = merchantIdentity(merchant);
    const rows = await listEvents(PRODUCT_PROVIDER);
    const row = rows.find(
      (row) =>
        getString(row.payload?.merchantId) === merchantId &&
        (getString(row.payload?.productId) === data.productId || row.id === data.productId),
    );
    if (!row) throw new Error("لم يتم العثور على المنتج.");

    // Products are append-only (edits add rows with the same productId):
    // delete EVERY event row of this product — by productId AND by row id —
    // otherwise an older version resurrects as "latest" right after delete.
    const pid = getString(row.payload?.productId);
    const targetRowIds = rows
      .filter(
        (r) =>
          getString(r.payload?.merchantId) === merchantId &&
          (r.id === row.id ||
            r.id === data.productId ||
            (pid !== "" &&
              (getString(r.payload?.productId) === pid || r.id === pid))),
      )
      .map((r) => r.id);

    const store = await getEventStore();
    if (store === "broadcasts") {
      const result = await supabaseAdmin.from("broadcasts").delete().in("id", targetRowIds);
      if (result.error) throw new Error("تعذر حذف المنتج من قاعدة البيانات");
    } else {
      if (pid) {
        const byProductId = await supabaseAdmin
          .from("whatsapp_webhook_events")
          .delete()
          .eq("source", "botly")
          .eq("event_type", PRODUCT_PROVIDER)
          .eq("payload->>productId" as never, pid);
        if (byProductId.error) throw new Error("تعذر حذف المنتج من قاعدة البيانات");
      }
      // Also delete by collected row ids (covers legacy rows without a
      // productId in the payload).
      const byRowIds = await supabaseAdmin
        .from("whatsapp_webhook_events")
        .delete()
        .eq("source", "botly")
        .eq("event_type", PRODUCT_PROVIDER)
        .in("id", targetRowIds);
      if (byRowIds.error) throw new Error("تعذر حذف المنتج من قاعدة البيانات");
    }

    return { ok: true };
  });

export const getMerchantDashboard = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    const merchant = await getAuthorizedMerchant(data.token);
    const profile = toProfile(merchant);
    const rows = await listEvents(PRODUCT_PROVIDER);
    // Newest event per product wins (append-only store, rows newest first).
    const seen = new Set<string>();
    const products: MerchantProduct[] = [];
    for (const row of rows) {
      if (getString(row.payload?.merchantId) !== profile.id) continue;
      const product = toProduct(row);
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      products.push(product);
    }

    return {
      profile,
      products,
      stats: {
        products: products.length,
        searches: 0,
        orders: 0,
        completion: completionScore(profile, products.length),
      },
    } satisfies MerchantDashboard;
  });

export type MerchantOrder = {
  id: string;
  productTitle: string;
  productPrice: number;
  currency: string;
  customerNumber: string;
  customerDetails: string;
  status: string;
  sentToDelivery: boolean;
  merchantNotified: boolean;
  createdAt: string;
};

// Orders created by the WhatsApp bot for this merchant — shown on
// /dashboard/orders so the merchant always sees what the bot sold, even when
// the order was forwarded straight to the delivery company.
export const listMerchantOrders = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    const merchant = await getAuthorizedMerchant(data.token);
    const merchantId = merchantIdentity(merchant);
    const rows = await listEvents("botly_order");

    // The bot appends a second event with the same orderId when the merchant
    // answers the confirmation buttons — keep only the newest event per order
    // so status updates show up without duplicating the order in the list.
    const seen = new Set<string>();
    const latestPerOrder = rows.filter((row) => {
      const orderId = getString(row.payload?.orderId) || row.id;
      if (seen.has(orderId)) return false;
      seen.add(orderId);
      return true;
    });

    return latestPerOrder
      .filter((row) => getString(row.payload?.merchantId) === merchantId)
      .map((row) => {
        const p = row.payload ?? {};
        return {
          id: getString(p.orderId) || row.id,
          productTitle: getString(p.productTitle) || "منتج",
          productPrice: getNumber(p.productPrice) ?? 0,
          currency: getString(p.currency) || "IQD",
          customerNumber: getString(p.customerNumber),
          customerDetails: getString(p.customerDetails),
          status: getString(p.status) || "unknown",
          sentToDelivery: Boolean(getString(p.deliveryPhone)),
          merchantNotified: p.merchantNotified === true,
          createdAt: getString(p.createdAt) || getString(row.created_at) || "",
        } satisfies MerchantOrder;
      });
  });

// Merchant-facing car catalogue: only enabled items show in product forms.
export type MerchantCarCatalogue = {
  makes: CarMake[];
  colors: string[];
  years: string[];
};

export const getEnabledCarCatalogueForMerchant = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }): Promise<MerchantCarCatalogue> => {
    await getAuthorizedMerchant(data.token);
    // Same single source as the customer side: newest parseable catalogue
    // event from the admin panel.
    const rows = await listEvents("botly_catalogue_config");
    for (const row of rows) {
      const config = parseCatalogueConfig(row.payload);
      if (config) return toEnabledCatalogue(config);
    }
    return { makes: [], colors: [], years: [] };
  });
