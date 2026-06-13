import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendEvent,
  listEvents,
  getString,
  getNumber,
  eventTime,
  sha256,
  randomToken,
  normalizePhone,
  phoneKey,
  type EventRow,
} from "@/lib/eventStore.server";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  defaultCatalogueConfig,
  parseCatalogueConfig,
  type CatalogueConfig,
} from "@/lib/car-data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminAccount {
  id: string;
  whatsapp: string;
}

export interface MerchantAdminView {
  merchantId: string;
  storeName: string;
  whatsapp: string;
  email?: string;
  subscriptionStatus: string; // active | expired | trial | none
  packageExpiry: string | null;
  isActive: boolean;
  visibilityEnabled: boolean;
  suspended: boolean;
  bannedFromBot: boolean;
  // Effective customer-facing visibility (false = hidden from search/bot).
  visibleInSearch: boolean;
  productCount: number;
  createdAt: string;
}

export interface AdminMessageRecord {
  id: string;
  body: string;
  target: string;
  total: number;
  sent: number;
  failed: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const loginInput = z.object({
  whatsapp: z.string().trim().min(3).max(40),
  password: z.string().min(4).max(200),
});

const tokenInput = z.object({ token: z.string().trim().min(20).max(300) });

const merchantActionInput = tokenInput.extend({
  merchantId: z.string().trim().min(1).max(100),
});

const visibilityInput = merchantActionInput.extend({ enabled: z.boolean() });
const suspendInput = merchantActionInput.extend({ suspended: z.boolean() });
const subscriptionInput = merchantActionInput.extend({
  status: z.enum(["active", "expired", "trial", "none"]),
  packageExpiry: z.string().trim().max(40).optional(),
});

const changePasswordInput = tokenInput.extend({
  currentPassword: z.string().min(4).max(200),
  newPassword: z.string().min(6).max(200),
});

const passwordResetRequestInput = z.object({
  whatsapp: z.string().trim().min(3).max(40),
});

const passwordResetInput = z.object({
  whatsapp: z.string().trim().min(3).max(40),
  code: z.string().trim().min(4).max(12),
  newPassword: z.string().min(6).max(200),
});

const broadcastInput = tokenInput.extend({
  body: z.string().trim().min(1).max(4000),
  // Empty/undefined merchantIds => broadcast to all merchants.
  merchantIds: z.array(z.string().trim().min(1)).optional(),
});

const directMessageInput = merchantActionInput.extend({
  body: z.string().trim().min(1).max(4000),
});

// ---------------------------------------------------------------------------
// Admin authentication (DB-backed, password changeable, no hardcoded frontend)
// ---------------------------------------------------------------------------

const ADMIN_SESSION_TTL_DAYS = 7;
const DEFAULT_ADMIN_SEED_VERSION = "owner-admin-2026-06-13";

// Bootstrap credentials. Seeded into the DB on first login if no admin exists,
// then editable via changeAdminPassword. NOT used for auth after seeding.
const DEFAULT_ADMIN = { whatsapp: "07836635435", password: "ma@MA769667" };

async function hashPassword(password: string, salt: string) {
  return sha256(`${salt}:${password}`);
}

function adminIdentity(row: EventRow) {
  return getString(row.payload?.adminId) || row.id;
}

// Seed/update the owner admin. This intentionally keeps the requested owner
// login available even when older admin rows already exist in the event store.
async function ensureAdminSeed(): Promise<void> {
  const admins = await listEvents("botly_admin");
  const normalized = normalizePhone(DEFAULT_ADMIN.whatsapp);
  const existing = admins.find((row) => getString(row.payload?.whatsappNormalized) === normalized);
  if (existing) {
    if (getString(existing.payload?.ownerSeedVersion) === DEFAULT_ADMIN_SEED_VERSION) return;

    const salt = getString(existing.payload?.passwordSalt);
    const expectedHash = getString(existing.payload?.passwordHash);
    const defaultHash = salt ? await hashPassword(DEFAULT_ADMIN.password, salt) : "";
    if (salt && expectedHash === defaultHash) {
      await appendEvent("botly_admin", {
        ...(existing.payload ?? {}),
        adminId: adminIdentity(existing),
        ownerSeedVersion: DEFAULT_ADMIN_SEED_VERSION,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const newSalt = randomToken();
    await appendEvent("botly_admin", {
      ...(existing.payload ?? {}),
      adminId: adminIdentity(existing),
      whatsapp: DEFAULT_ADMIN.whatsapp,
      whatsappNormalized: normalized,
      passwordSalt: newSalt,
      passwordHash: await hashPassword(DEFAULT_ADMIN.password, newSalt),
      ownerSeedVersion: DEFAULT_ADMIN_SEED_VERSION,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  const salt = randomToken();
  await appendEvent("botly_admin", {
    adminId: crypto.randomUUID(),
    whatsapp: DEFAULT_ADMIN.whatsapp,
    whatsappNormalized: normalizePhone(DEFAULT_ADMIN.whatsapp),
    passwordSalt: salt,
    passwordHash: await hashPassword(DEFAULT_ADMIN.password, salt),
    ownerSeedVersion: DEFAULT_ADMIN_SEED_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

// Latest admin event per adminId (current state in the append-only log).
async function latestAdmins(): Promise<EventRow[]> {
  const rows = await listEvents("botly_admin");
  const seen = new Map<string, EventRow>();
  for (const row of rows) {
    const id = adminIdentity(row);
    if (!seen.has(id)) seen.set(id, row);
  }
  return [...seen.values()];
}

async function findAdminByPhone(whatsapp: string): Promise<EventRow | null> {
  const normalized = normalizePhone(whatsapp);
  const admins = await latestAdmins();
  return admins.find((row) => getString(row.payload?.whatsappNormalized) === normalized) ?? null;
}

async function findAdminById(adminId: string): Promise<EventRow | null> {
  const admins = await latestAdmins();
  return admins.find((row) => adminIdentity(row) === adminId) ?? null;
}

// Validate an admin session token -> adminId. Throws if invalid/expired.
async function authorizeAdmin(token: string): Promise<string> {
  const tokenHash = await sha256(token);
  const sessions = await listEvents("botly_admin_session");
  const session = sessions.find((row) => {
    const p = row.payload ?? {};
    return (
      getString(p.tokenHash) === tokenHash &&
      new Date(getString(p.expiresAt)).getTime() > Date.now()
    );
  });
  if (!session) throw new Error("انتهت جلسة الأدمن. سجل دخول مرة ثانية.");
  return getString(session.payload?.adminId);
}

async function createAdminSession(adminId: string): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(
    Date.now() + ADMIN_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  await appendEvent("botly_admin_session", {
    adminId,
    tokenHash,
    expiresAt,
    createdAt: new Date().toISOString(),
  });
  return token;
}

export const loginAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => loginInput.parse(d))
  .handler(async ({ data }) => {
    await ensureAdminSeed();
    if (phoneKey(data.whatsapp) !== phoneKey(DEFAULT_ADMIN.whatsapp)) {
      throw new Error("رقم الأدمن غير صحيح.");
    }

    const row = await findAdminByPhone(data.whatsapp);
    if (!row) throw new Error("رقم الهاتف غير مسجل كأدمن.");

    const salt = getString(row.payload?.passwordSalt);
    const expected = getString(row.payload?.passwordHash);
    const actual = await hashPassword(data.password, salt);
    if (!salt || actual !== expected) throw new Error("كلمة المرور غير صحيحة.");

    const adminId = adminIdentity(row);
    const token = await createAdminSession(adminId);
    return {
      token,
      admin: { id: adminId, whatsapp: getString(row.payload?.whatsapp) } satisfies AdminAccount,
    };
  });

export const getCurrentAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }): Promise<AdminAccount> => {
    const adminId = await authorizeAdmin(data.token);
    const row = await findAdminById(adminId);
    if (!row) throw new Error("لم يتم العثور على حساب الأدمن.");
    return { id: adminId, whatsapp: getString(row.payload?.whatsapp) };
  });

export const changeAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((d) => changePasswordInput.parse(d))
  .handler(async ({ data }) => {
    const adminId = await authorizeAdmin(data.token);
    const row = await findAdminById(adminId);
    if (!row) throw new Error("لم يتم العثور على حساب الأدمن.");

    const salt = getString(row.payload?.passwordSalt);
    const expected = getString(row.payload?.passwordHash);
    const actual = await hashPassword(data.currentPassword, salt);
    if (actual !== expected) throw new Error("كلمة المرور الحالية غير صحيحة.");

    const newSalt = randomToken();
    await appendEvent("botly_admin", {
      ...(row.payload ?? {}),
      adminId,
      passwordSalt: newSalt,
      passwordHash: await hashPassword(data.newPassword, newSalt),
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  });

function generateResetCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + (bytes[0] % 900000));
}

async function hashResetCode(resetId: string, code: string) {
  return sha256(`${resetId}:${code.trim()}`);
}

export const requestAdminPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d) => passwordResetRequestInput.parse(d))
  .handler(async ({ data }) => {
    await ensureAdminSeed();
    if (phoneKey(data.whatsapp) !== phoneKey(DEFAULT_ADMIN.whatsapp)) {
      throw new Error("رقم الهاتف غير مسجل كأدمن.");
    }

    const row = await findAdminByPhone(data.whatsapp);
    if (!row) throw new Error("رقم الهاتف غير مسجل كأدمن.");

    const adminId = adminIdentity(row);
    const resetId = crypto.randomUUID();
    const code = generateResetCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await appendEvent("botly_admin_password_reset", {
      resetId,
      adminId,
      whatsapp: getString(row.payload?.whatsapp) || DEFAULT_ADMIN.whatsapp,
      codeHash: await hashResetCode(resetId, code),
      used: false,
      expiresAt,
      createdAt: new Date().toISOString(),
    });

    const recipient = toWhatsAppRecipient(getString(row.payload?.whatsapp) || DEFAULT_ADMIN.whatsapp);
    const message = `رمز تغيير كلمة مرور لوحة أدمن Botly هو: ${code}\nينتهي خلال 15 دقيقة.`;
    const result = await sendWhatsAppText(recipient, message);
    if (!result.ok) {
      throw new Error(result.error || "تعذر إرسال رمز الاسترجاع إلى رقم الواتساب المسجل.");
    }

    return { ok: true };
  });

export const resetAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((d) => passwordResetInput.parse(d))
  .handler(async ({ data }) => {
    await ensureAdminSeed();
    if (phoneKey(data.whatsapp) !== phoneKey(DEFAULT_ADMIN.whatsapp)) {
      throw new Error("رقم الهاتف غير مسجل كأدمن.");
    }

    const row = await findAdminByPhone(data.whatsapp);
    if (!row) throw new Error("رقم الهاتف غير مسجل كأدمن.");

    const adminId = adminIdentity(row);
    const resetRows = await listEvents("botly_admin_password_reset");
    const latestByResetId = new Map<string, EventRow>();
    for (const resetRow of resetRows) {
      const resetId = getString(resetRow.payload?.resetId);
      if (!resetId || latestByResetId.has(resetId)) continue;
      latestByResetId.set(resetId, resetRow);
    }

    let matched: EventRow | null = null;
    for (const resetRow of latestByResetId.values()) {
      const p = resetRow.payload ?? {};
      const resetId = getString(p.resetId);
      if (getString(p.adminId) !== adminId) continue;
      if (p.used === true) continue;
      if (new Date(getString(p.expiresAt)).getTime() <= Date.now()) continue;
      const expected = getString(p.codeHash);
      const actual = await hashResetCode(resetId, data.code);
      if (expected && expected === actual) {
        matched = resetRow;
        break;
      }
    }

    if (!matched) throw new Error("رمز الاسترجاع غير صحيح أو منتهي.");

    const newSalt = randomToken();
    await appendEvent("botly_admin", {
      ...(row.payload ?? {}),
      adminId,
      passwordSalt: newSalt,
      passwordHash: await hashPassword(data.newPassword, newSalt),
      ownerSeedVersion: DEFAULT_ADMIN_SEED_VERSION,
      updatedAt: new Date().toISOString(),
    });
    await appendEvent("botly_admin_password_reset", {
      ...(matched.payload ?? {}),
      used: true,
      usedAt: new Date().toISOString(),
    });

    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Merchant management
// ---------------------------------------------------------------------------

function merchantIdentity(row: EventRow) {
  return getString(row.payload?.merchantId) || row.id;
}

// Latest merchant event per merchantId.
async function latestMerchants(): Promise<EventRow[]> {
  const rows = await listEvents("botly_merchant");
  const seen = new Map<string, EventRow>();
  for (const row of rows) {
    const id = merchantIdentity(row);
    if (!seen.has(id)) seen.set(id, row);
  }
  return [...seen.values()];
}

// Compute effective customer-facing visibility from the control flags.
function isVisibleInSearch(p: Record<string, unknown>): boolean {
  if (p.bannedFromBot === true) return false;
  if (p.visibilityEnabled === false) return false;
  if (p.isActive === false) return false;
  if (getString(p.suspendedAt)) return false;
  if (getString(p.subscriptionStatus) === "expired") return false;
  const expiry = getString(p.packageExpiry);
  if (expiry && new Date(expiry).getTime() < Date.now()) return false;
  return true;
}

// Load product counts (active, latest-per-productId).
async function loadMerchantMetrics(): Promise<{
  productCounts: Map<string, number>;
}> {
  const productCounts = new Map<string, number>();

  // Products: count latest-per-productId, non-rejected.
  const productRows = await listEvents("botly_product");
  const seenProduct = new Set<string>();
  for (const row of productRows) {
    const pid = getString(row.payload?.productId) || row.id;
    if (seenProduct.has(pid)) continue;
    seenProduct.add(pid);
    const status = getString(row.payload?.status) || "active";
    if (status === "rejected") continue;
    const mId = getString(row.payload?.merchantId);
    if (!mId) continue;
    productCounts.set(mId, (productCounts.get(mId) ?? 0) + 1);
  }

  return { productCounts };
}

export const listMerchants = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }): Promise<MerchantAdminView[]> => {
    await authorizeAdmin(data.token);
    const merchants = await latestMerchants();
    const { productCounts } = await loadMerchantMetrics();

    return merchants
      .map((row) => {
        const p = row.payload ?? {};
        const mId = merchantIdentity(row);
        return {
          merchantId: mId,
          storeName: getString(p.storeName) || "متجر",
          whatsapp: getString(p.whatsapp),
          email: getString(p.email) || undefined,
          subscriptionStatus: getString(p.subscriptionStatus) || "none",
          packageExpiry: getString(p.packageExpiry) || null,
          isActive: p.isActive !== false,
          visibilityEnabled: p.visibilityEnabled !== false,
          suspended: Boolean(getString(p.suspendedAt)),
          bannedFromBot: p.bannedFromBot === true,
          visibleInSearch: isVisibleInSearch(p),
          productCount: productCounts.get(mId) ?? 0,
          createdAt: getString(p.createdAt) || eventTime(row),
        } satisfies MerchantAdminView;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

// Append a merchant event with merged control flags. Preserves credentials and
// profile fields so merchant login keeps working.
async function applyMerchantControl(merchantId: string, changes: Record<string, unknown>) {
  const merchants = await listEvents("botly_merchant");
  const row = merchants.find((r) => merchantIdentity(r) === merchantId);
  if (!row) throw new Error("لم يتم العثور على المتجر.");

  await appendEvent("botly_merchant", {
    ...(row.payload ?? {}),
    merchantId,
    ...changes,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true };
}

// Enable/disable visibility in customer search + WhatsApp bot.
export const setMerchantVisibility = createServerFn({ method: "POST" })
  .inputValidator((d) => visibilityInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    return applyMerchantControl(data.merchantId, { visibilityEnabled: data.enabled });
  });

// Suspend / reactivate a merchant entirely.
export const setMerchantSuspended = createServerFn({ method: "POST" })
  .inputValidator((d) => suspendInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    return applyMerchantControl(data.merchantId, {
      suspendedAt: data.suspended ? new Date().toISOString() : "",
      isActive: !data.suspended,
    });
  });

// Override subscription/package state (e.g. mark expired, set expiry).
export const setMerchantSubscription = createServerFn({ method: "POST" })
  .inputValidator((d) => subscriptionInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    return applyMerchantControl(data.merchantId, {
      subscriptionStatus: data.status,
      packageExpiry: data.packageExpiry ?? "",
    });
  });

// Hard delete a merchant store and all its data (products, orders, sessions).
//
// Deletes by row id rather than a payload->>merchantId filter: merchants
// created before the merchantId payload field existed are identified by their
// row id (see merchantIdentity), so a JSON-path filter matches nothing for
// them and the store silently survives. Collecting ids via listEvents also
// works on both the source/event_type and legacy provider column schemas.
export const deleteMerchantStore = createServerFn({ method: "POST" })
  .inputValidator((d) => merchantActionInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const merchants = await listEvents("botly_merchant");
    const target = merchants.find(
      (r) => merchantIdentity(r) === data.merchantId || r.id === data.merchantId,
    );
    if (!target) throw new Error("لم يتم العثور على المتجر.");

    const merchantId = merchantIdentity(target);

    const [products, orders, sessions] = await Promise.all([
      listEvents("botly_product"),
      listEvents("botly_order"),
      listEvents("botly_session"),
    ]);

    const ids = new Set<string>();
    // Every profile event in the merchant's append-only history.
    for (const r of merchants) {
      if (merchantIdentity(r) === merchantId || r.id === data.merchantId) ids.add(r.id);
    }
    const belongsToMerchant = (r: EventRow) => getString(r.payload?.merchantId) === merchantId;
    for (const r of products) if (belongsToMerchant(r)) ids.add(r.id);
    for (const r of orders) if (belongsToMerchant(r)) ids.add(r.id);
    for (const r of sessions) if (belongsToMerchant(r)) ids.add(r.id);

    const all = [...ids];
    for (let i = 0; i < all.length; i += 200) {
      const chunk = all.slice(i, i + 200);
      const result = await supabaseAdmin
        .from("whatsapp_webhook_events")
        .delete()
        .in("id", chunk as never[]);
      if (result.error) {
        throw new Error(`تعذر حذف المتجر من قاعدة البيانات: ${result.error.message}`);
      }
    }

    return { ok: true, deleted: all.length };
  });

// ---------------------------------------------------------------------------
// Admin messaging (via the existing WhatsApp integration)
// ---------------------------------------------------------------------------

// WhatsApp Graph API expects the number without a leading "+".
function toWhatsAppRecipient(whatsapp: string): string {
  return normalizePhone(whatsapp).replace(/^\+/, "");
}

async function recordAdminMessage(body: string, target: string, total: number, sent: number) {
  await appendEvent("botly_admin_message", {
    messageId: crypto.randomUUID(),
    body,
    target,
    total,
    sent,
    failed: total - sent,
    createdAt: new Date().toISOString(),
  }).catch((error) => console.error("[Admin Message] Failed to record", error));
}

// Broadcast to all merchants (or a selected subset). Uses the existing WhatsApp
// sender; reports per-send success/failure counts.
export const sendAdminBroadcast = createServerFn({ method: "POST" })
  .inputValidator((d) => broadcastInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const merchants = await latestMerchants();

    const targets = merchants.filter((row) => {
      const phone = getString(row.payload?.whatsapp);
      if (!phone) return false;
      if (!data.merchantIds || data.merchantIds.length === 0) return true;
      return data.merchantIds.includes(merchantIdentity(row));
    });

    let sent = 0;
    for (const row of targets) {
      const recipient = toWhatsAppRecipient(getString(row.payload?.whatsapp));
      try {
        const result = await sendWhatsAppText(recipient, data.body);
        if (result.ok) sent += 1;
      } catch (error) {
        console.error("[Admin Broadcast] Send failed", recipient, error);
      }
    }

    const target =
      !data.merchantIds || data.merchantIds.length === 0 ? "all" : `selection(${targets.length})`;
    await recordAdminMessage(data.body, target, targets.length, sent);

    return { total: targets.length, sent, failed: targets.length - sent };
  });

// Send a single message to one merchant.
export const sendMerchantMessage = createServerFn({ method: "POST" })
  .inputValidator((d) => directMessageInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const merchants = await latestMerchants();
    const row = merchants.find((r) => merchantIdentity(r) === data.merchantId);
    if (!row) throw new Error("لم يتم العثور على المتجر.");

    const recipient = toWhatsAppRecipient(getString(row.payload?.whatsapp));
    const result = await sendWhatsAppText(recipient, data.body);
    await recordAdminMessage(data.body, `merchant:${data.merchantId}`, 1, result.ok ? 1 : 0);

    if (!result.ok) throw new Error(result.error || "تعذر إرسال الرسالة عبر واتساب.");
    return { ok: true };
  });

// Recent admin message history (delivery stats).
export const listAdminMessages = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }): Promise<AdminMessageRecord[]> => {
    await authorizeAdmin(data.token);
    const rows = await listEvents("botly_admin_message");
    return rows.slice(0, 50).map((row) => {
      const p = row.payload ?? {};
      return {
        id: getString(p.messageId) || row.id,
        body: getString(p.body),
        target: getString(p.target),
        total: getNumber(p.total) ?? 0,
        sent: getNumber(p.sent) ?? 0,
        failed: getNumber(p.failed) ?? 0,
        createdAt: getString(p.createdAt) || eventTime(row),
      };
    });
  });

// ---------------------------------------------------------------------------
// Customers (الزبائن) + purchase report
// ---------------------------------------------------------------------------

export interface CustomerAdminView {
  customerId: string;
  name: string;
  whatsapp: string;
  landmark: string;
  governorate: string;
  createdAt: string;
}

function customerIdentity(row: EventRow) {
  return getString(row.payload?.customerId) || row.id;
}

export const listCustomers = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }): Promise<CustomerAdminView[]> => {
    await authorizeAdmin(data.token);

    const customerRows = await listEvents("botly_customer");

    // Latest profile per customer.
    const seen = new Map<string, EventRow>();
    for (const row of customerRows) {
      const id = customerIdentity(row);
      if (!seen.has(id)) seen.set(id, row);
    }

    return [...seen.values()].map((row) => {
      const p = row.payload ?? {};
      return {
        customerId: customerIdentity(row),
        name: getString(p.name) || "زبون",
        whatsapp: getString(p.whatsapp),
        landmark: getString(p.landmark),
        governorate: getString(p.governorate),
        createdAt: getString(p.createdAt) || eventTime(row),
      };
    });
  });

// ---------------------------------------------------------------------------
// Platform settings (mediator contact number)
// ---------------------------------------------------------------------------

export const getPlatformSettings = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const rows = await listEvents("botly_settings");
    for (const row of rows) {
      const storedPhones = Array.isArray(row.payload?.mediatorPhones)
        ? (row.payload?.mediatorPhones as unknown[]).filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      const mediatorPhones = normalizeMediatorPhones([
        ...storedPhones,
        getString(row.payload?.mediatorPhone),
      ]);
      if (mediatorPhones.length > 0) {
        return { mediatorPhone: mediatorPhones[0], mediatorPhones };
      }
    }
    return { mediatorPhone: "", mediatorPhones: [] as string[] };
  });

const mediatorPhoneInput = tokenInput.extend({
  mediatorPhone: z.string().trim().max(40).optional().or(z.literal("")),
  mediatorPhones: z.array(z.string().trim().min(3).max(40)).max(20).optional(),
});

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

export const setMediatorPhone = createServerFn({ method: "POST" })
  .inputValidator((d) => mediatorPhoneInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const mediatorPhones = normalizeMediatorPhones([
      ...(data.mediatorPhones ?? []),
      data.mediatorPhone ?? "",
    ]);
    await appendEvent("botly_settings", {
      mediatorPhone: mediatorPhones[0] ?? "",
      mediatorPhones,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Car catalogue configuration (admin-managed, single source of truth for the
// customer/merchant dropdowns)
// ---------------------------------------------------------------------------
//
// The admin owns the FULL catalogue, not just visibility flags: makes, models,
// colors and years can be added, removed, shown or hidden. The hardcoded lists
// in car-data.ts only seed the first load; after that, whatever the admin
// saves here is the catalogue.

const catalogItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
});

const catalogInput = tokenInput.extend({
  config: z.object({
    makes: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(80),
          label: z.string().trim().min(1).max(80),
          enabled: z.boolean(),
          models: z.array(catalogItemSchema).max(300),
        }),
      )
      .max(300),
    colors: z.array(catalogItemSchema).max(200),
    years: z.array(catalogItemSchema).max(200),
  }),
});

export const getCarCatalogueConfig = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }): Promise<CatalogueConfig> => {
    await authorizeAdmin(data.token);
    // listEvents returns newest first — the first parseable event is the
    // current catalogue. No saved catalogue yet → seed from the standard list
    // (everything unchecked) so the admin has something to start from.
    const rows = await listEvents("botly_catalogue_config");
    for (const row of rows) {
      const parsed = parseCatalogueConfig(row.payload);
      if (parsed) return parsed;
    }
    return defaultCatalogueConfig();
  });

export const saveCarCatalogueConfig = createServerFn({ method: "POST" })
  .inputValidator((d) => catalogInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    await appendEvent("botly_catalogue_config", {
      ...data.config,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  });
