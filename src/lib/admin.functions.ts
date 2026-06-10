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
  type EventRow,
} from "@/lib/eventStore.server";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";

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

// Bootstrap credentials. Seeded into the DB on first login if no admin exists,
// then editable via changeAdminPassword. NOT used for auth after seeding.
const DEFAULT_ADMIN = { whatsapp: "07836653453", password: "123456" };

async function hashPassword(password: string, salt: string) {
  return sha256(`${salt}:${password}`);
}

function adminIdentity(row: EventRow) {
  return getString(row.payload?.adminId) || row.id;
}

// Seed the default admin once if the admin table is empty.
async function ensureAdminSeed(): Promise<void> {
  const admins = await listEvents("botly_admin");
  if (admins.length > 0) return;

  const salt = randomToken();
  await appendEvent("botly_admin", {
    adminId: crypto.randomUUID(),
    whatsapp: DEFAULT_ADMIN.whatsapp,
    whatsappNormalized: normalizePhone(DEFAULT_ADMIN.whatsapp),
    passwordSalt: salt,
    passwordHash: await hashPassword(DEFAULT_ADMIN.password, salt),
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

    const row = await findAdminByPhone(data.whatsapp);
    if (!row) throw new Error("رقم الواتساب غير مسجل كأدمن.");

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
