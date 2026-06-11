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
  deleteEventsByPayloadField,
  type EventRow,
} from "@/lib/eventStore.server";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

// Hard delete a merchant store and all its products from the database.
export const deleteMerchantStore = createServerFn({ method: "POST" })
  .inputValidator((d) => merchantActionInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const merchants = await listEvents("botly_merchant");
    const row = merchants.find((r) => merchantIdentity(r) === data.merchantId);
    if (!row) throw new Error("لم يتم العثور على المتجر.");

    const merchantId = merchantIdentity(row);

    // PostgREST JSON-path filter syntax is payload->>field (no quotes).
    // supabase-js returns errors in the result instead of throwing, so each
    // step checks result.error explicitly.

    // Delete all products for this merchant
    const productsResult = await supabaseAdmin
      .from("whatsapp_webhook_events")
      .delete()
      .eq("source", "botly")
      .eq("event_type", "botly_product")
      .eq("payload->>merchantId" as never, merchantId);
    if (productsResult.error) {
      console.error("[Admin] Failed to delete products", productsResult.error);
    }

    // Delete all orders for this merchant
    const ordersResult = await supabaseAdmin
      .from("whatsapp_webhook_events")
      .delete()
      .eq("source", "botly")
      .eq("event_type", "botly_order")
      .eq("payload->>merchantId" as never, merchantId);
    if (ordersResult.error) {
      console.error("[Admin] Failed to delete orders", ordersResult.error);
    }

    // Delete the merchant record itself
    const merchantResult = await supabaseAdmin
      .from("whatsapp_webhook_events")
      .delete()
      .eq("source", "botly")
      .eq("event_type", "botly_merchant")
      .eq("payload->>merchantId" as never, merchantId);
    if (merchantResult.error) {
      throw new Error(`تعذر حذف المتجر من قاعدة البيانات: ${merchantResult.error.message}`);
    }

    return { ok: true };
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
  orderCount: number;
  receivedCount: number;
  createdAt: string;
}

export interface OrderReportRow {
  orderId: string;
  storeName: string;
  productTitle: string;
  productPrice: number;
  currency: string;
  customerName: string;
  customerNumber: string;
  status: string;
  source: string;
  createdAt: string;
  receivedAt?: string;
}

function customerIdentity(row: EventRow) {
  return getString(row.payload?.customerId) || row.id;
}

// Latest event per orderId (newest-first log → first occurrence wins).
async function latestOrders(): Promise<EventRow[]> {
  const rows = await listEvents("botly_order");
  const seen = new Map<string, EventRow>();
  for (const row of rows) {
    const id = getString(row.payload?.orderId) || row.id;
    if (!seen.has(id)) seen.set(id, row);
  }
  return [...seen.values()];
}

export const listCustomers = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }): Promise<CustomerAdminView[]> => {
    await authorizeAdmin(data.token);

    const [customerRows, orders] = await Promise.all([
      listEvents("botly_customer"),
      latestOrders(),
    ]);

    // Latest profile per customer.
    const seen = new Map<string, EventRow>();
    for (const row of customerRows) {
      const id = customerIdentity(row);
      if (!seen.has(id)) seen.set(id, row);
    }

    // Order stats keyed by format-independent phone.
    const orderCount = new Map<string, number>();
    const receivedCount = new Map<string, number>();
    for (const row of orders) {
      const key = phoneKey(getString(row.payload?.customerNumber));
      if (!key) continue;
      orderCount.set(key, (orderCount.get(key) ?? 0) + 1);
      if (getString(row.payload?.status) === "received_by_customer") {
        receivedCount.set(key, (receivedCount.get(key) ?? 0) + 1);
      }
    }

    return [...seen.values()].map((row) => {
      const p = row.payload ?? {};
      const key = phoneKey(getString(p.whatsapp));
      return {
        customerId: customerIdentity(row),
        name: getString(p.name) || "زبون",
        whatsapp: getString(p.whatsapp),
        landmark: getString(p.landmark),
        governorate: getString(p.governorate),
        orderCount: orderCount.get(key) ?? 0,
        receivedCount: receivedCount.get(key) ?? 0,
        createdAt: getString(p.createdAt) || eventTime(row),
      };
    });
  });

// Purchase report: every order with its merchant, product and live status —
// including whether the customer pressed "تم الاستلام".
export const listOrdersReport = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }): Promise<OrderReportRow[]> => {
    await authorizeAdmin(data.token);
    const orders = await latestOrders();
    return orders.map((row) => {
      const p = row.payload ?? {};
      return {
        orderId: getString(p.orderId) || row.id,
        storeName: getString(p.storeName) || "متجر",
        productTitle: getString(p.productTitle) || "منتج",
        productPrice: getNumber(p.productPrice) ?? 0,
        currency: getString(p.currency) || "IQD",
        customerName: getString(p.customerName) || "—",
        customerNumber: getString(p.customerNumber),
        status: getString(p.status) || "pending",
        source: getString(p.source) || "whatsapp",
        createdAt: getString(p.createdAt) || eventTime(row),
        receivedAt: getString(p.receivedAt) || undefined,
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
    const mediatorPhone = rows
      .map((row) => getString(row.payload?.mediatorPhone))
      .find(Boolean);
    return { mediatorPhone: mediatorPhone ?? "" };
  });

const mediatorPhoneInput = tokenInput.extend({
  mediatorPhone: z.string().trim().max(40),
});

export const setMediatorPhone = createServerFn({ method: "POST" })
  .inputValidator((d) => mediatorPhoneInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    await appendEvent("botly_settings", {
      mediatorPhone: data.mediatorPhone,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Maintenance: purge ALL products (old demo data cleanup)
// ---------------------------------------------------------------------------

// Hard-deletes every product row (with their inline images) from the event
// store. Used once to clear the old non-car demo catalogue (pants, watches...).
export const purgeAllProducts = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);

    const primary = await supabaseAdmin
      .from("whatsapp_webhook_events")
      .delete({ count: "exact" })
      .eq("source", "botly")
      .eq("event_type", "botly_product");

    if (!primary.error) return { ok: true, deleted: primary.count ?? 0 };

    // Older schema fallback (provider column instead of source/event_type).
    const fallback = await supabaseAdmin
      .from("whatsapp_webhook_events")
      .delete({ count: "exact" })
      .eq("provider" as never, "botly_product");

    if (fallback.error) {
      throw new Error(`تعذر مسح المنتجات: ${fallback.error.message ?? "خطأ غير معروف"}`);
    }
    return { ok: true, deleted: fallback.count ?? 0 };
  });
