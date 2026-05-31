import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
  whatsapp: string;
  email?: string;
  bio?: string;
  deliveryPhone?: string;
  logoUrl?: string;
  coverUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type MerchantProduct = {
  id: string;
  description: string;
  imageUrl: string;
  currentPrice: number;
  discountPrice?: number;
  currency: string;
  size?: string;
  color?: string;
  quantity?: number;
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
  deliveryPhone: z.string().trim().max(40).optional().or(z.literal("")),
  logoUrl: z.string().max(2_500_000).optional().or(z.literal("")),
  coverUrl: z.string().max(2_500_000).optional().or(z.literal("")),
});

const productInput = tokenInput.extend({
  description: z.string().trim().min(1).max(280),
  imageUrl: z.string().min(20).max(2_500_000),
  currentPrice: z.number().min(0).max(999_999_999),
  discountPrice: z.number().min(0).max(999_999_999).optional(),
  currency: z.string().trim().min(1).max(8),
  size: z.string().trim().max(80).optional().or(z.literal("")),
  color: z.string().trim().max(80).optional().or(z.literal("")),
  quantity: z.number().int().min(0).max(999_999).optional(),
});

let resolvedEventStore: EventStore | null = null;

function normalizePhone(phone: string) {
  return phone
    .replace(/[^\d+]/g, "")
    .replace(/^00/, "+")
    .trim();
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

function eventTime(row: EventRow) {
  return row.created_at ?? row.received_at ?? new Date().toISOString();
}

function merchantIdentity(row: EventRow) {
  return getString(row.payload?.merchantId) || row.id;
}

function toProfile(row: EventRow): MerchantProfile {
  const payload = row.payload ?? {};
  return {
    id: merchantIdentity(row),
    storeName: getString(payload.storeName),
    whatsapp: getString(payload.whatsapp),
    email: getString(payload.email) || undefined,
    bio: getString(payload.bio) || undefined,
    deliveryPhone: getString(payload.deliveryPhone) || undefined,
    logoUrl: getString(payload.logoUrl) || undefined,
    coverUrl: getString(payload.coverUrl) || undefined,
    createdAt: getString(payload.createdAt) || eventTime(row),
    updatedAt: getString(payload.updatedAt) || eventTime(row),
  };
}

function toProduct(row: EventRow): MerchantProduct {
  const payload = row.payload ?? {};
  return {
    id: getString(payload.productId) || row.id,
    description: getString(payload.description),
    imageUrl: getString(payload.imageUrl),
    currentPrice: getNumber(payload.currentPrice) ?? 0,
    discountPrice: getNumber(payload.discountPrice),
    currency: getString(payload.currency) || "IQD",
    size: getString(payload.size) || undefined,
    color: getString(payload.color) || undefined,
    quantity: getNumber(payload.quantity),
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
    if (list.error) throw new Error("تعذر قراءة بيانات المتجر من قاعدة البيانات.");
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
  if (fallback.error) throw new Error("تعذر قراءة بيانات المتجر من قاعدة البيانات.");
  return (fallback.data ?? []) as EventRow[];
}

async function findMerchantByPhone(whatsapp: string) {
  const normalized = normalizePhone(whatsapp);
  const rows = await listEvents(MERCHANT_PROVIDER);
  return rows.find((row) => getString(row.payload?.whatsappNormalized) === normalized) ?? null;
}

async function findMerchantById(id: string) {
  const store = await getEventStore();

  if (store === "broadcasts") {
    const rows = await listEvents(MERCHANT_PROVIDER);
    return rows.find((row) => merchantIdentity(row) === id || row.id === id) ?? null;
  }

  const primary = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id,payload,created_at")
    .eq("source", "botly")
    .eq("event_type", MERCHANT_PROVIDER)
    .eq("id", id)
    .maybeSingle();

  if (!primary.error) return (primary.data as EventRow | null) ?? null;

  const fallback = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id,payload,received_at")
    .eq("provider", MERCHANT_PROVIDER)
    .eq("id", id)
    .maybeSingle();

  if (isMissingTableError(fallback.error)) {
    resolvedEventStore = "broadcasts";
    return findMerchantById(id);
  }
  if (fallback.error) throw new Error("تعذر قراءة بيانات المتجر من قاعدة البيانات.");
  return (fallback.data as EventRow | null) ?? null;
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

    if (created.error) throw new Error("تعذر حفظ بيانات المتجر.");
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
  if (fallback.error) throw new Error("تعذر حفظ بيانات المتجر.");
  return fallback.data as EventRow;
}

async function createSession(merchantId: string) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await insertEvent(SESSION_PROVIDER, {
    merchantId,
    tokenHash,
    expiresAt,
    createdAt: new Date().toISOString(),
  });
  return token;
}

async function getAuthorizedMerchant(token: string) {
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
  const merchant = await findMerchantById(merchantId);
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

    const row = await insertEvent(MERCHANT_PROVIDER, {
      merchantId,
      storeName: data.storeName,
      whatsapp: data.whatsapp,
      whatsappNormalized,
      email: data.email || "",
      passwordSalt: salt,
      passwordHash,
      bio: "",
      deliveryPhone: "",
      logoUrl: "",
      coverUrl: "",
      createdAt: now,
      updatedAt: now,
    });

    const profile = toProfile(row);
    const token = await createSession(profile.id);
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
    const token = await createSession(profile.id);
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

    const row = await insertEvent(PRODUCT_PROVIDER, {
      productId: crypto.randomUUID(),
      merchantId: merchantIdentity(merchant),
      description: data.description,
      imageUrl: data.imageUrl,
      currentPrice: data.currentPrice,
      discountPrice: data.discountPrice,
      currency: data.currency,
      size: data.size || "",
      color: data.color || "",
      quantity: data.quantity,
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
    return rows.filter((row) => getString(row.payload?.merchantId) === merchantId).map(toProduct);
  });

export const getMerchantDashboard = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    const merchant = await getAuthorizedMerchant(data.token);
    const profile = toProfile(merchant);
    const rows = await listEvents(PRODUCT_PROVIDER);
    const products = rows
      .filter((row) => getString(row.payload?.merchantId) === profile.id)
      .map(toProduct);

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
