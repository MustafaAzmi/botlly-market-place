import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendEvent,
  deleteEventsByPayloadField,
  getEventById,
  listEvents,
  listEventsForAdminExport,
  listEventsByPayloadField,
  listEventsByPayloadFieldPage,
  listEventsPage,
  latestEventWhere,
  normalizePageRequest,
  getString,
  getNumber,
  eventTime,
  sha256,
  randomToken,
  normalizePhone,
  phoneKey,
  type EventRow,
  type PageResult,
} from "@/lib/eventStore.server";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  defaultCatalogueConfig,
  parseCatalogueConfig,
  type CatalogueConfig,
} from "@/lib/car-data";
import { normalizeGovernorate } from "@/lib/governorates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminAccount {
  id: string;
  whatsapp: string;
}

export interface MerchantSaleDetail {
  orderId: string;
  productTitle: string;
  price: number;
  currency: string;
  customerName: string;
  customerPhone: string;
  commissionPercent: number;
  commissionAmount: number;
  merchantNet: number;
  operationStatus: "مكتملة" | "ملغاة" | "قيد المراجعة";
  createdAt: string;
}

export interface MerchantSalesTotal {
  currency: string;
  amount: number;
}

function salesReportResetTime(row: EventRow): string {
  return getString(row.payload?.resetAt) || eventTime(row);
}

export interface MerchantAdminView {
  merchantId: string;
  storeName: string;
  whatsapp: string;
  governorate: string;
  email?: string;
  subscriptionStatus: string; // active | expired | trial | none
  packageExpiry: string | null;
  isActive: boolean;
  visibilityEnabled: boolean;
  showPhoneToRequesters: boolean;
  suspended: boolean;
  bannedFromBot: boolean;
  // Effective customer-facing visibility (false = hidden from search/bot).
  visibleInSearch: boolean;
  productCount: number;
  salesCount: number;
  salesTotals: MerchantSalesTotal[];
  sales: MerchantSaleDetail[];
  createdAt: string;
}

export interface AdminMerchantProductView {
  id: string;
  title: string;
  imageUrl: string;
  currentPrice: number;
  discountPrice?: number;
  currency: string;
  carMake: string;
  carModel: string;
  carYear: string;
  color: string;
  quantity?: number;
  createdAt: string;
}

export interface SalesConfirmationSummary {
  confirmedByBoth: number;
  customerOnly: number;
  merchantOnly: number;
  conflicts: number;
  pending: number;
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

export interface PopularSmartSearchProduct {
  productKey: string;
  productName: string;
  requestCount: number;
  customerCount: number;
  fitterCount: number;
  carMakes: string[];
  governorates: string[];
  lastRequestedAt: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const loginInput = z.object({
  whatsapp: z.string().trim().min(3).max(40),
  password: z.string().min(4).max(200),
});

const tokenInput = z.object({ token: z.string().trim().min(20).max(300) });
const paginatedTokenInput = tokenInput.extend({
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().max(100).optional().or(z.literal("")),
});

const merchantActionInput = tokenInput.extend({
  merchantId: z.string().trim().min(1).max(100),
});
const paginatedMerchantInput = merchantActionInput.extend({
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().max(100).optional().or(z.literal("")),
});

const merchantProductActionInput = merchantActionInput.extend({
  productId: z.string().trim().min(1).max(160),
});

const visibilityInput = merchantActionInput.extend({ enabled: z.boolean() });
const phoneVisibilityInput = merchantActionInput.extend({ enabled: z.boolean() });
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

async function hashPassword(password: string, salt: string) {
  return sha256(`${salt}:${password}`);
}

function adminIdentity(row: EventRow) {
  return getString(row.payload?.adminId) || row.id;
}

function adminBootstrapCredentials() {
  const whatsapp = process.env.ADMIN_BOOTSTRAP_WHATSAPP?.trim() ?? "";
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim() ?? "";
  return whatsapp && password ? { whatsapp, password } : null;
}

// Existing accounts and changed passwords are never overwritten by bootstrap.
async function ensureAdminSeed(): Promise<void> {
  const credentials = adminBootstrapCredentials();
  if (!credentials) return;

  const admins = await listEvents("botly_admin");
  if (admins.length > 0) return;

  const salt = randomToken();
  await appendEvent("botly_admin", {
    adminId: crypto.randomUUID(),
    whatsapp: credentials.whatsapp,
    whatsappNormalized: normalizePhone(credentials.whatsapp),
    passwordSalt: salt,
    passwordHash: await hashPassword(credentials.password, salt),
    bootstrapSource: "environment",
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
  const rows = await listEventsByPayloadField(
    "botly_admin",
    "whatsappNormalized",
    normalized,
    1,
  );
  return rows[0] ?? null;
}

async function findAdminById(adminId: string): Promise<EventRow | null> {
  return latestEventWhere("botly_admin", "adminId", adminId);
}

// Validate an admin session token -> adminId. Throws if invalid/expired.
async function authorizeAdmin(token: string): Promise<string> {
  const tokenHash = await sha256(token);
  const sessions = await listEventsByPayloadField(
    "botly_admin_session",
    "tokenHash",
    tokenHash,
    1,
  );
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
    const row = await findAdminByPhone(data.whatsapp);
    if (!row) throw new Error("رقم الهاتف غير مسجل كأدمن.");

    const adminId = adminIdentity(row);
    const resetId = crypto.randomUUID();
    const code = generateResetCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await appendEvent("botly_admin_password_reset", {
      resetId,
      adminId,
      whatsapp: getString(row.payload?.whatsapp),
      codeHash: await hashResetCode(resetId, code),
      used: false,
      expiresAt,
      createdAt: new Date().toISOString(),
    });

    const recipient = toWhatsAppRecipient(getString(row.payload?.whatsapp));
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

function productIdentity(row: EventRow) {
  return getString(row.payload?.productId) || row.id;
}

function isDeletedProduct(row: EventRow) {
  return getString(row.payload?.status) === "deleted";
}

function toAdminMerchantProduct(row: EventRow): AdminMerchantProductView {
  const p = row.payload ?? {};
  const primaryImage = getString(p.imageUrl);
  const extraImages = Array.isArray(p.imageUrls)
    ? (p.imageUrls as unknown[]).filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  return {
    id: productIdentity(row),
    title: getString(p.title) || getString(p.description) || "منتج",
    imageUrl: /^data:image\//i.test(primaryImage || extraImages[0] || "")
      ? `/api/product-image/${encodeURIComponent(productIdentity(row))}?index=0`
      : primaryImage || extraImages[0] || "",
    currentPrice: getNumber(p.currentPrice) ?? getNumber(p.price) ?? 0,
    discountPrice: getNumber(p.discountPrice),
    currency: getString(p.currency) || "IQD",
    carMake: getString(p.carMake),
    carModel: getString(p.carModel),
    carYear: getString(p.carYear),
    color: getString(p.color),
    quantity: getNumber(p.quantity),
    createdAt: getString(p.createdAt) || eventTime(row),
  };
}

// Latest merchant event per merchantId.
async function latestMerchants(sourceRows?: EventRow[]): Promise<EventRow[]> {
  const rows = sourceRows ?? await listEvents("botly_merchant");
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
  salesByMerchant: Map<string, MerchantSaleDetail[]>;
  salesTotalsByMerchant: Map<string, MerchantSalesTotal[]>;
}> {
  const productCounts = new Map<string, number>();
  const salesByMerchant = new Map<string, MerchantSaleDetail[]>();
  const salesTotalsByMerchant = new Map<string, MerchantSalesTotal[]>();
  const salesResetAtByMerchant = new Map<string, string>();
  const platformCommissionPercent = await getPlatformCommissionPercent();

  // Products: count latest-per-productId, visible in merchant dashboards.
  const productRows = await listEvents("botly_product", 100);
  const seenProduct = new Set<string>();
  for (const row of productRows) {
    const pid = productIdentity(row);
    if (seenProduct.has(pid)) continue;
    seenProduct.add(pid);
    const status = getString(row.payload?.status) || "active";
    if (status === "rejected" || status === "deleted") continue;
    const mId = getString(row.payload?.merchantId);
    if (!mId) continue;
    productCounts.set(mId, (productCounts.get(mId) ?? 0) + 1);
  }

  const resetRows = await listEvents("botly_merchant_sales_reset", 100);
  for (const row of resetRows) {
    const merchantId = getString(row.payload?.merchantId);
    if (merchantId && !salesResetAtByMerchant.has(merchantId)) {
      salesResetAtByMerchant.set(merchantId, salesReportResetTime(row));
    }
  }

  const orderRows = latestByPayloadId(await listEvents("botly_order", 100), "orderId");
  for (const row of orderRows) {
    const p = row.payload ?? {};
    if (getString(p.merchantStatus) !== "Sold" || getString(p.requesterStatus) !== "Purchased") continue;
    const merchantId = getString(p.merchantId);
    if (!merchantId) continue;
    const saleCreatedAt = getString(p.updatedAt) || getString(p.createdAt) || eventTime(row);
    const resetAt = salesResetAtByMerchant.get(merchantId);
    if (resetAt && saleCreatedAt <= resetAt) continue;
    const price = getNumber(p.price) ?? getNumber(p.currentPrice) ?? 0;
    const currency = getString(p.currency) || "IQD";
    const commissionPercent = getNumber(p.commissionPercent) ?? platformCommissionPercent;
    const commissionAmount = Number(((price * commissionPercent) / 100).toFixed(2));
    const sale: MerchantSaleDetail = {
      orderId: getString(p.orderId) || row.id,
      productTitle: getString(p.productTitle) || "منتج",
      price,
      currency,
      customerName: getString(p.customerName) || getString(p.requesterName),
      customerPhone: getString(p.customerPhone) || getString(p.customerNumber) || getString(p.requesterPhone),
      commissionPercent,
      commissionAmount,
      merchantNet: Number((price - commissionAmount).toFixed(2)),
      operationStatus: "مكتملة",
      createdAt: saleCreatedAt,
    };
    const merchantSales = salesByMerchant.get(merchantId) ?? [];
    merchantSales.push(sale);
    salesByMerchant.set(merchantId, merchantSales);
  }

  for (const [merchantId, sales] of salesByMerchant) {
    const totals = new Map<string, number>();
    for (const sale of sales) {
      totals.set(sale.currency, (totals.get(sale.currency) ?? 0) + sale.price);
    }
    salesTotalsByMerchant.set(
      merchantId,
      [...totals.entries()].map(([currency, amount]) => ({ currency, amount })),
    );
    sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return { productCounts, salesByMerchant, salesTotalsByMerchant };
}

async function getPlatformCommissionPercent() {
  const rows = await listEvents("botly_settings");
  for (const row of rows) {
    const value =
      getNumber(row.payload?.platformCommissionPercent) ??
      getNumber(row.payload?.merchantCommissionPercent) ??
      getNumber(row.payload?.commissionPercent);
    if (value !== undefined) return Math.min(100, Math.max(0, value));
  }
  return DEFAULT_PLATFORM_COMMISSION_PERCENT;
}

export const listMerchants = createServerFn({ method: "POST" })
  .inputValidator((d) => paginatedTokenInput.parse(d))
  .handler(async ({ data }): Promise<PageResult<MerchantAdminView>> => {
    await authorizeAdmin(data.token);
    const pagination = normalizePageRequest(data);
    const merchantPage = await listEventsPage("botly_merchant", pagination);
    const merchants = await latestMerchants(merchantPage.items);
    const { productCounts, salesByMerchant, salesTotalsByMerchant } = await loadMerchantMetrics();

    const items = merchants
      .map((row) => {
        const p = row.payload ?? {};
        const mId = merchantIdentity(row);
        return {
          merchantId: mId,
          storeName: getString(p.storeName) || "متجر",
          whatsapp: getString(p.whatsapp),
          governorate:
            normalizeGovernorate(
              getString(p.city) ||
                getString(p.governorate) ||
                getString(p.merchantGovernorate),
            ) || "غير محدد",
          email: getString(p.email) || undefined,
          subscriptionStatus: getString(p.subscriptionStatus) || "none",
          packageExpiry: getString(p.packageExpiry) || null,
          isActive: p.isActive !== false,
          visibilityEnabled: p.visibilityEnabled !== false,
          showPhoneToRequesters: p.showPhoneToRequesters === true,
          suspended: Boolean(getString(p.suspendedAt)),
          bannedFromBot: p.bannedFromBot === true,
          visibleInSearch: isVisibleInSearch(p),
          productCount: productCounts.get(mId) ?? 0,
          salesCount: salesByMerchant.get(mId)?.length ?? 0,
          salesTotals: salesTotalsByMerchant.get(mId) ?? [],
          sales: salesByMerchant.get(mId) ?? [],
          createdAt: getString(p.createdAt) || eventTime(row),
        } satisfies MerchantAdminView;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      items,
      page: pagination.page,
      limit: pagination.limit,
      nextCursor: merchantPage.nextCursor,
      hasMore: merchantPage.hasMore,
    };
  });

export const listMerchantProductsForAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => paginatedMerchantInput.parse(d))
  .handler(async ({ data }): Promise<PageResult<AdminMerchantProductView>> => {
    await authorizeAdmin(data.token);
    const merchant = await latestEventWhere(
      "botly_merchant",
      "merchantId",
      data.merchantId,
    );
    if (!merchant) throw new Error("لم يتم العثور على المتجر.");

    const merchantId = merchantIdentity(merchant);
    const pagination = normalizePageRequest(data);
    const productPage = await listEventsByPayloadFieldPage(
      "botly_product",
      "merchantId",
      merchantId,
      pagination,
    );
    const rows = productPage.items;
    const seen = new Set<string>();
    const products: AdminMerchantProductView[] = [];
    for (const row of rows) {
      if (getString(row.payload?.merchantId) !== merchantId) continue;
      const productId = productIdentity(row);
      if (seen.has(productId)) continue;
      seen.add(productId);
      if (isDeletedProduct(row)) continue;
      const status = getString(row.payload?.status) || "active";
      if (status === "rejected") continue;
      products.push(toAdminMerchantProduct(row));
    }
    return {
      items: products.slice(0, pagination.limit),
      page: pagination.page,
      limit: pagination.limit,
      nextCursor: productPage.nextCursor,
      hasMore: productPage.hasMore,
    };
  });

export const deleteMerchantProductForAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => merchantProductActionInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const merchant = await latestEventWhere(
      "botly_merchant",
      "merchantId",
      data.merchantId,
    );
    if (!merchant) throw new Error("لم يتم العثور على المتجر.");

    const merchantId = merchantIdentity(merchant);
    const row = await latestEventWhere("botly_product", "productId", data.productId);
    if (!row || getString(row.payload?.merchantId) !== merchantId) {
      throw new Error("لم يتم العثور على المنتج.");
    }

    const p = row.payload ?? {};
    const productId = productIdentity(row);
    await appendEvent("botly_product", {
      ...p,
      productId,
      merchantId,
      title: getString(p.title) || getString(p.description),
      imageUrl: getString(p.imageUrl),
      currentPrice: getNumber(p.currentPrice) ?? getNumber(p.price) ?? 0,
      currency: getString(p.currency) || "IQD",
      status: "deleted",
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdAt: getString(p.createdAt) || eventTime(row),
    });

    return { ok: true };
  });

export const getSalesConfirmationSummary = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }): Promise<SalesConfirmationSummary> => {
    await authorizeAdmin(data.token);
    const orders = latestByPayloadId(await listEvents("botly_order"), "orderId");
    const summary: SalesConfirmationSummary = {
      confirmedByBoth: 0,
      customerOnly: 0,
      merchantOnly: 0,
      conflicts: 0,
      pending: 0,
    };

    for (const row of orders) {
      const p = row.payload ?? {};
      if (getString(p.sourceContext) !== "missing_product_request" && !getString(p.merchantStatus) && !getString(p.requesterStatus)) continue;
      const merchantStatus = getString(p.merchantStatus) || "Pending";
      const requesterStatus = getString(p.requesterStatus) || "Pending";
      if (merchantStatus === "Sold" && requesterStatus === "Purchased") summary.confirmedByBoth += 1;
      else if (
        (merchantStatus === "Sold" && requesterStatus === "Cancelled") ||
        (merchantStatus === "Cancelled" && requesterStatus === "Purchased")
      ) summary.conflicts += 1;
      else if (merchantStatus === "Sold" && requesterStatus === "Pending") summary.merchantOnly += 1;
      else if (
        (merchantStatus === "Pending" || merchantStatus === "Available") &&
        requesterStatus === "Purchased"
      ) summary.customerOnly += 1;
      else summary.pending += 1;
    }

    return summary;
  });

export const resetMerchantSalesReport = createServerFn({ method: "POST" })
  .inputValidator((d) => merchantActionInput.parse(d))
  .handler(async ({ data }) => {
    const adminId = await authorizeAdmin(data.token);
    await appendEvent("botly_merchant_sales_reset", {
      merchantId: data.merchantId,
      resetAt: new Date().toISOString(),
      resetByAdminId: adminId,
    });
    return { ok: true };
  });

export const getMerchantSalesExport = createServerFn({ method: "POST" })
  .inputValidator((d) => merchantActionInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const merchant = await latestEventWhere(
      "botly_merchant",
      "merchantId",
      data.merchantId,
    );
    if (!merchant) throw new Error("لم يتم العثور على المتجر.");

    const [orderRows, resetRows] = await Promise.all([
      listEventsForAdminExport("botly_order"),
      listEventsByPayloadField(
        "botly_merchant_sales_reset",
        "merchantId",
        data.merchantId,
        1,
      ),
    ]);
    const resetAt = resetRows[0] ? salesReportResetTime(resetRows[0]) : "";
    const commissionPercent = await getPlatformCommissionPercent();
    const sales = latestByPayloadId(orderRows, "orderId")
      .filter((row) => {
        const payload = row.payload ?? {};
        const createdAt =
          getString(payload.updatedAt) ||
          getString(payload.createdAt) ||
          eventTime(row);
        return (
          getString(payload.merchantId) === data.merchantId &&
          getString(payload.merchantStatus) === "Sold" &&
          getString(payload.requesterStatus) === "Purchased" &&
          (!resetAt || createdAt > resetAt)
        );
      })
      .map((row): MerchantSaleDetail => {
        const payload = row.payload ?? {};
        const price =
          getNumber(payload.price) ?? getNumber(payload.currentPrice) ?? 0;
        const appliedPercent =
          getNumber(payload.commissionPercent) ?? commissionPercent;
        const commissionAmount = Number(
          ((price * appliedPercent) / 100).toFixed(2),
        );
        return {
          orderId: getString(payload.orderId) || row.id,
          productTitle: getString(payload.productTitle) || "منتج",
          price,
          currency: getString(payload.currency) || "IQD",
          customerName:
            getString(payload.customerName) ||
            getString(payload.requesterName),
          customerPhone:
            getString(payload.customerPhone) ||
            getString(payload.customerNumber) ||
            getString(payload.requesterPhone),
          commissionPercent: appliedPercent,
          commissionAmount,
          merchantNet: Number((price - commissionAmount).toFixed(2)),
          operationStatus: "مكتملة",
          createdAt:
            getString(payload.updatedAt) ||
            getString(payload.createdAt) ||
            eventTime(row),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const totals = new Map<string, number>();
    for (const sale of sales) {
      totals.set(sale.currency, (totals.get(sale.currency) ?? 0) + sale.price);
    }
    return {
      sales,
      salesCount: sales.length,
      salesTotals: [...totals.entries()].map(([currency, amount]) => ({
        currency,
        amount,
      })),
    };
  });

// Append a merchant event with merged control flags. Preserves credentials and
// profile fields so merchant login keeps working.
async function applyMerchantControl(merchantId: string, changes: Record<string, unknown>) {
  const row = await latestEventWhere("botly_merchant", "merchantId", merchantId);
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

// Enable/disable exposing the merchant WhatsApp number to customers/fitters.
export const setMerchantPhoneVisibility = createServerFn({ method: "POST" })
  .inputValidator((d) => phoneVisibilityInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    return applyMerchantControl(data.merchantId, { showPhoneToRequesters: data.enabled });
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
// Delete by merchantId so the operation remains complete regardless of list
// pagination. Legacy profiles without merchantId are removed by exact row id.
export const deleteMerchantStore = createServerFn({ method: "POST" })
  .inputValidator((d) => merchantActionInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const target =
      await latestEventWhere("botly_merchant", "merchantId", data.merchantId)
      ?? await getEventById("botly_merchant", data.merchantId);
    if (!target) throw new Error("لم يتم العثور على المتجر.");

    const merchantId = merchantIdentity(target);

    const deleted = await Promise.all([
      deleteEventsByPayloadField("botly_product", "merchantId", merchantId),
      deleteEventsByPayloadField("botly_order", "merchantId", merchantId),
      deleteEventsByPayloadField("botly_session", "merchantId", merchantId),
      deleteEventsByPayloadField("botly_merchant", "merchantId", merchantId),
    ]);

    // Legacy merchant rows used their row id as the identity.
    if (!getString(target.payload?.merchantId)) {
      const result = await supabaseAdmin
        .from("whatsapp_webhook_events")
        .delete()
        .eq("id", target.id);
      if (result.error) {
        throw new Error(`تعذر حذف المتجر من قاعدة البيانات: ${result.error.message}`);
      }
    }

    return { ok: true, deleted: deleted.reduce((sum, count) => sum + count, 0) };
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
    const merchants = await latestMerchants(
      await listEventsForAdminExport("botly_merchant"),
    );

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
  .inputValidator((d) => paginatedTokenInput.parse(d))
  .handler(async ({ data }): Promise<PageResult<AdminMessageRecord>> => {
    await authorizeAdmin(data.token);
    const pagination = normalizePageRequest(data);
    const page = await listEventsPage("botly_admin_message", pagination);
    const items = page.items.map((row) => {
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
    return { ...page, items };
  });

// ---------------------------------------------------------------------------
// Customers (الزبائن) + purchase report
// ---------------------------------------------------------------------------

function latestByPayloadId(rows: EventRow[], payloadKey: string): EventRow[] {
  const latest = new Map<string, EventRow>();
  for (const row of rows) {
    const id = getString(row.payload?.[payloadKey]) || row.id;
    if (!latest.has(id)) latest.set(id, row);
  }
  return [...latest.values()];
}

function orderGovernorate(p: Record<string, unknown>) {
  return (
    getString(p.merchantGovernorate) ||
    getString(p.customerGovernorate) ||
    getString(p.fitterCity) ||
    "غير محدد"
  );
}

function orderGross(p: Record<string, unknown>) {
  return getNumber(p.productPrice) ?? getNumber(p.price) ?? 0;
}

function orderCurrency(p: Record<string, unknown>) {
  return (getString(p.currency) || "IQD").trim().toUpperCase();
}

function orderCurrentPrice(p: Record<string, unknown>, fallback: number) {
  return getNumber(p.productCurrentPrice) ?? getNumber(p.currentPrice) ?? fallback;
}

function orderCommission(p: Record<string, unknown>) {
  return getNumber(p.commissionAmount) ?? 0;
}

export const getAdminOverview = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }): Promise<AdminOverviewStats> => {
    await authorizeAdmin(data.token);
    const [
      merchantRows,
      productRows,
      customerRows,
      fitterRows,
      orderRows,
      fitterOrderRows,
      settingsRows,
      resetRows,
    ] = await Promise.all([
      latestMerchants(),
      listEvents("botly_product"),
      listEvents("botly_customer"),
      listEvents("botly_fitter"),
      listEvents("botly_order"),
      listEvents("botly_fitter_order"),
      listEvents("botly_settings"),
      listEvents("botly_order_counter_reset"),
    ]);

    const merchants = merchantRows.filter((row) => !getString(row.payload?.deletedAt));
    const products = latestByPayloadId(productRows, "productId").filter((row) => {
      const p = row.payload ?? {};
      return getString(p.status) !== "rejected" && getString(p.availability) !== "out_of_stock";
    });
    const customers = latestByPayloadId(customerRows, "customerId");
    const fitters = latestFitterRows(fitterRows);
    const latestOrders = latestByPayloadId(orderRows, "orderId");
    const confirmedFitterOrders = latestByPayloadId(fitterOrderRows, "orderId").filter(
      (row) => getString(row.payload?.status) === "confirmed",
    );

    const settings = settingsRows[0]?.payload ?? {};
    const mediatorContacts = normalizeMediatorContacts(settings.mediatorContacts);
    const legacyMediatorPhones = Array.isArray(settings.mediatorPhones)
      ? (settings.mediatorPhones as unknown[]).filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const mediators =
      mediatorContacts.length > 0
        ? mediatorContacts.length
        : normalizeMediatorPhones([...legacyMediatorPhones, getString(settings.mediatorPhone)])
            .length;

    const counted = new Map<string, AdminOverviewStats["recentOrders"][number]>();
    for (const row of latestOrders) {
      const p = row.payload ?? {};
      const id = getString(p.orderId) || row.id;
      const grossSales = orderGross(p);
      const currency = orderCurrency(p);
      const currentPrice = orderCurrentPrice(p, grossSales);
      const fitterCommission = orderCommission(p);
      counted.set(id, {
        orderId: id,
        governorate: orderGovernorate(p),
        currency,
        source: getString(p.sourceContext) || "customer_site",
        productTitle: getString(p.productTitle) || "منتج",
        grossSales,
        currentPrice,
        fitterCommission,
        netProfit: Math.max(0, grossSales - currentPrice - fitterCommission),
        createdAt: getString(p.createdAt) || eventTime(row),
      });
    }
    for (const row of confirmedFitterOrders) {
      const p = row.payload ?? {};
      const id = getString(p.orderId) || row.id;
      const grossSales = orderGross(p);
      const currency = orderCurrency(p);
      const currentPrice = orderCurrentPrice(p, grossSales);
      const fitterCommission = orderCommission(p);
      counted.set(id, {
        orderId: id,
        governorate: orderGovernorate(p),
        currency,
        source: "fitter_site",
        productTitle: getString(p.productTitle) || "منتج",
        grossSales,
        currentPrice,
        fitterCommission,
        netProfit: Math.max(0, grossSales - currentPrice - fitterCommission),
        createdAt: getString(p.updatedAt) || getString(p.createdAt) || eventTime(row),
      });
    }

    const recentOrders = [...counted.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const orderCounterResetAt = getString(resetRows[0]?.payload?.createdAt);
    const orderCounterResetMs = orderCounterResetAt ? new Date(orderCounterResetAt).getTime() : 0;
    const byGovernorateMap = new Map<string, AdminGovernorateSales>();
    const byCurrencyMap = new Map<string, AdminCurrencySales>();
    for (const order of recentOrders) {
      const countOrder =
        !orderCounterResetMs || new Date(order.createdAt).getTime() > orderCounterResetMs ? 1 : 0;
      const governorateKey = `${order.governorate}::${order.currency}`;
      const current =
        byGovernorateMap.get(governorateKey) ??
        ({
          governorate: order.governorate,
          currency: order.currency,
          orders: 0,
          grossSales: 0,
          currentPrice: 0,
          fitterCommission: 0,
          netProfit: 0,
        } satisfies AdminGovernorateSales);
      current.orders += countOrder;
      current.grossSales += order.grossSales;
      current.currentPrice += order.currentPrice;
      current.fitterCommission += order.fitterCommission;
      current.netProfit += order.netProfit;
      byGovernorateMap.set(governorateKey, current);

      const byCurrency =
        byCurrencyMap.get(order.currency) ??
        ({
          currency: order.currency,
          orders: 0,
          grossSales: 0,
          currentPrice: 0,
          fitterCommission: 0,
          netProfit: 0,
        } satisfies AdminCurrencySales);
      byCurrency.orders += countOrder;
      byCurrency.grossSales += order.grossSales;
      byCurrency.currentPrice += order.currentPrice;
      byCurrency.fitterCommission += order.fitterCommission;
      byCurrency.netProfit += order.netProfit;
      byCurrencyMap.set(order.currency, byCurrency);
    }

    const grossSales = recentOrders.reduce((sum, order) => sum + order.grossSales, 0);
    const currentPrice = recentOrders.reduce((sum, order) => sum + order.currentPrice, 0);
    const fitterCommission = recentOrders.reduce((sum, order) => sum + order.fitterCommission, 0);
    const netProfit = recentOrders.reduce((sum, order) => sum + order.netProfit, 0);
    const ordersAfterReset = recentOrders.filter(
      (order) => !orderCounterResetMs || new Date(order.createdAt).getTime() > orderCounterResetMs,
    ).length;

    return {
      totals: {
        mediators,
        merchants: merchants.length,
        visibleMerchants: merchants.filter((row) => isVisibleInSearch(row.payload ?? {})).length,
        customers: customers.length,
        products: products.length,
        fitters: fitters.length,
        orders: ordersAfterReset,
        grossSales,
        currentPrice,
        fitterCommission,
        netProfit,
        orderCounterResetAt,
      },
      byGovernorate: [...byGovernorateMap.values()].sort((a, b) => b.netProfit - a.netProfit),
      byCurrency: [...byCurrencyMap.values()].sort((a, b) => b.netProfit - a.netProfit),
      recentOrders: recentOrders.slice(0, 12),
    };
  });

export const resetAdminOrderCounter = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const createdAt = new Date().toISOString();
    await appendEvent("botly_order_counter_reset", {
      createdAt,
    });
    return { ok: true, createdAt };
  });

export interface CustomerAdminView {
  customerId: string;
  name: string;
  whatsapp: string;
  landmark: string;
  governorate: string;
  createdAt: string;
}

export interface AdminGovernorateSales {
  governorate: string;
  currency: string;
  orders: number;
  grossSales: number;
  currentPrice: number;
  fitterCommission: number;
  netProfit: number;
}

export interface AdminCurrencySales {
  currency: string;
  orders: number;
  grossSales: number;
  currentPrice: number;
  fitterCommission: number;
  netProfit: number;
}

export interface AdminOverviewStats {
  totals: {
    mediators: number;
    merchants: number;
    visibleMerchants: number;
    customers: number;
    products: number;
    fitters: number;
    orders: number;
    grossSales: number;
    currentPrice: number;
    fitterCommission: number;
    netProfit: number;
    orderCounterResetAt?: string;
  };
  byGovernorate: AdminGovernorateSales[];
  byCurrency: AdminCurrencySales[];
  recentOrders: Array<{
    orderId: string;
    governorate: string;
    currency: string;
    source: string;
    productTitle: string;
    grossSales: number;
    currentPrice: number;
    fitterCommission: number;
    netProfit: number;
    createdAt: string;
  }>;
}

export interface MediatorContact {
  phone: string;
  city: string;
}

const DEFAULT_PLATFORM_COMMISSION_PERCENT = 5;

export interface FitterAdminView {
  fitterId: string;
  name: string;
  whatsapp: string;
  city: string;
  address: string;
  latitude?: number;
  longitude?: number;
  visaNumber: string;
  commissionPercent: number;
  totalProfit: number;
  salesCount: number;
  createdAt: string;
}

function customerIdentity(row: EventRow) {
  return getString(row.payload?.customerId) || row.id;
}

export const listCustomers = createServerFn({ method: "POST" })
  .inputValidator((d) => paginatedTokenInput.parse(d))
  .handler(async ({ data }): Promise<PageResult<CustomerAdminView>> => {
    await authorizeAdmin(data.token);
    const pagination = normalizePageRequest(data);
    const customerPage = await listEventsPage("botly_customer", pagination);
    const customerRows = customerPage.items;

    // Latest profile per customer.
    const seen = new Map<string, EventRow>();
    for (const row of customerRows) {
      const id = customerIdentity(row);
      if (!seen.has(id)) seen.set(id, row);
    }

    const items = [...seen.values()].map((row) => {
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
    return {
      items,
      page: pagination.page,
      limit: pagination.limit,
      nextCursor: customerPage.nextCursor,
      hasMore: customerPage.hasMore,
    };
  });

// ---------------------------------------------------------------------------
// Fitters
// ---------------------------------------------------------------------------

const fitterAdminActionInput = tokenInput.extend({
  fitterId: z.string().trim().min(1),
});

const fitterAdminUpdateInput = fitterAdminActionInput.extend({
  name: z.string().trim().min(2).max(100),
  whatsapp: z.string().trim().min(6).max(40),
  city: z.string().trim().min(2).max(100),
  address: z.string().trim().min(2).max(200),
  visaNumber: z.string().trim().max(80),
  commissionPercent: z.number().min(0).max(100),
});

function fitterIdentity(row: EventRow) {
  return getString(row.payload?.fitterId) || row.id;
}

function latestFitterRows(rows: EventRow[]) {
  const seen = new Map<string, EventRow>();
  for (const row of rows) {
    const id = fitterIdentity(row);
    if (!seen.has(id)) seen.set(id, row);
  }
  return [...seen.values()].filter((row) => !getString(row.payload?.deletedAt));
}

async function currentFitterProfit(fitterId: string, fallbackCommissionPercent = 0) {
  const resetRows = await listEventsByPayloadField(
    "botly_fitter_reset",
    "fitterId",
    fitterId,
    100,
  );
  const reset = resetRows.find((row) => getString(row.payload?.fitterId) === fitterId);
  const resetAt = reset ? new Date(getString(reset.payload?.createdAt) || eventTime(reset)).getTime() : 0;
  const orderRows = await listEventsByPayloadField(
    "botly_fitter_order",
    "fitterId",
    fitterId,
    100,
  );
  const latestOrders = new Map<string, EventRow>();
  for (const row of orderRows) {
    if (getString(row.payload?.fitterId) !== fitterId) continue;
    const orderId = getString(row.payload?.orderId) || row.id;
    if (!latestOrders.has(orderId)) latestOrders.set(orderId, row);
  }
  const confirmedOrders = [...latestOrders.values()].filter((row) => {
    if (getString(row.payload?.status) !== "confirmed") return false;
    return new Date(getString(row.payload?.updatedAt) || getString(row.payload?.createdAt) || eventTime(row)).getTime() > resetAt;
  });
  const legacySales = (await listEventsByPayloadField(
    "botly_fitter_sale",
    "fitterId",
    fitterId,
    100,
  )).filter((row) => {
    if (getString(row.payload?.fitterId) !== fitterId) return false;
    if (getString(row.payload?.orderId)) return false;
    return new Date(getString(row.payload?.createdAt) || eventTime(row)).getTime() > resetAt;
  });
  return {
    totalProfit: Number(
      [...confirmedOrders, ...legacySales]
        .reduce((sum, row) => {
          const storedCommission = getNumber(row.payload?.commissionAmount) ?? 0;
          if (storedCommission > 0) return sum + storedCommission;
          const productPrice = getNumber(row.payload?.productPrice) ?? getNumber(row.payload?.price) ?? 0;
          return sum + Number(((productPrice * fallbackCommissionPercent) / 100).toFixed(2));
        }, 0)
        .toFixed(2),
    ),
    salesCount: confirmedOrders.length + legacySales.length,
  };
}

export const listFitters = createServerFn({ method: "POST" })
  .inputValidator((d) => paginatedTokenInput.parse(d))
  .handler(async ({ data }): Promise<PageResult<FitterAdminView>> => {
    await authorizeAdmin(data.token);
    const pagination = normalizePageRequest(data);
    const fitterPage = await listEventsPage("botly_fitter", pagination);
    const fitters = latestFitterRows(fitterPage.items);
    const items = await Promise.all(
      fitters.map(async (row) => {
        const p = row.payload ?? {};
        const fitterId = fitterIdentity(row);
        const commissionPercent = getNumber(p.commissionPercent) ?? 0;
        const profit = await currentFitterProfit(fitterId, commissionPercent);
        return {
          fitterId,
          name: getString(p.name) || "فيتر",
          whatsapp: getString(p.whatsapp),
          city: getString(p.city),
          address: getString(p.address),
          latitude: getNumber(p.latitude),
          longitude: getNumber(p.longitude),
          visaNumber: getString(p.visaNumber),
          commissionPercent,
          totalProfit: profit.totalProfit,
          salesCount: profit.salesCount,
          createdAt: getString(p.createdAt) || eventTime(row),
        };
      }),
    );
    return {
      items,
      page: pagination.page,
      limit: pagination.limit,
      nextCursor: fitterPage.nextCursor,
      hasMore: fitterPage.hasMore,
    };
  });

export const updateFitterByAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => fitterAdminUpdateInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const row = await latestEventWhere("botly_fitter", "fitterId", data.fitterId);
    if (!row) throw new Error("لم يتم العثور على الفيتر.");
    await appendEvent("botly_fitter", {
      ...(row.payload ?? {}),
      fitterId: data.fitterId,
      name: data.name,
      whatsapp: data.whatsapp,
      city: data.city,
      address: data.address,
      visaNumber: data.visaNumber,
      commissionPercent: data.commissionPercent,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  });

export const deleteFitterByAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => fitterAdminActionInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const row = await latestEventWhere("botly_fitter", "fitterId", data.fitterId);
    if (!row) throw new Error("لم يتم العثور على الفيتر.");
    await appendEvent("botly_fitter", {
      ...(row.payload ?? {}),
      fitterId: data.fitterId,
      deletedAt: new Date().toISOString(),
    });
    return { ok: true };
  });

export const resetFitterProfitByAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => fitterAdminActionInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    await appendEvent("botly_fitter_reset", {
      resetId: crypto.randomUUID(),
      fitterId: data.fitterId,
      createdAt: new Date().toISOString(),
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Platform settings (mediator contact number)
// ---------------------------------------------------------------------------

export const getPlatformSettings = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const rows = await listEvents("botly_settings");
    const latestSettings = rows[0]?.payload ?? {};
    const platformCommissionPercent =
      getNumber(latestSettings.platformCommissionPercent) ??
      getNumber(latestSettings.merchantCommissionPercent) ??
      getNumber(latestSettings.commissionPercent) ??
      DEFAULT_PLATFORM_COMMISSION_PERCENT;
    for (const row of rows) {
      const mediatorContacts = normalizeMediatorContacts(row.payload?.mediatorContacts);
      const storedPhones = Array.isArray(row.payload?.mediatorPhones)
        ? (row.payload?.mediatorPhones as unknown[]).filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      const mediatorPhones = normalizeMediatorPhones([
        ...storedPhones,
        getString(row.payload?.mediatorPhone),
      ]);
      const contacts =
        mediatorContacts.length > 0
          ? mediatorContacts
          : mediatorPhones.map((phone) => ({ phone, city: "" }));
      if (contacts.length > 0) {
        return {
          mediatorPhone: contacts[0].phone,
          mediatorPhones: contacts.map((contact) => contact.phone),
          mediatorContacts: contacts,
          platformCommissionPercent,
        };
      }
    }
    return {
      mediatorPhone: "",
      mediatorPhones: [] as string[],
      mediatorContacts: [] as MediatorContact[],
      platformCommissionPercent,
    };
  });

function normalizeSmartSearchProductName(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ar")
    .replace(/\u0640|\p{M}/gu, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export const listPopularSmartSearchProducts = createServerFn({ method: "POST" })
  .inputValidator((d) => paginatedTokenInput.parse(d))
  .handler(async ({ data }): Promise<PageResult<PopularSmartSearchProduct>> => {
    await authorizeAdmin(data.token);
    const pagination = normalizePageRequest(data);
    const eventPage = await listEventsByPayloadFieldPage(
      "botly_order",
      "sourceContext",
      "missing_product_request",
      pagination,
    );
    const rows = eventPage.items;
    const seenRequests = new Set<string>();
    const products = new Map<
      string,
      PopularSmartSearchProduct & {
        carMakeSet: Set<string>;
        governorateSet: Set<string>;
      }
    >();

    for (const row of rows) {
      const payload = row.payload ?? {};
      if (getString(payload.sourceContext) !== "missing_product_request") continue;
      if (getString(payload.eventName) !== "missing_request_created") continue;

      const requestId =
        getString(payload.missingRequestId) || getString(payload.orderId) || row.id;
      if (seenRequests.has(requestId)) continue;
      seenRequests.add(requestId);

      const productName = getString(payload.productTitle).trim();
      const productKey = normalizeSmartSearchProductName(productName);
      if (!productKey) continue;

      const requestedAt =
        getString(payload.eventAt) ||
        getString(payload.createdAt) ||
        eventTime(row);
      const requesterType = getString(payload.requesterType);
      const carMake = getString(payload.carMake).trim();
      const governorate = normalizeGovernorate(
        getString(payload.requesterGovernorate) || getString(payload.governorate),
      );
      const current = products.get(productKey);

      if (current) {
        current.requestCount += 1;
        if (requesterType === "fitter") current.fitterCount += 1;
        else current.customerCount += 1;
        if (carMake) current.carMakeSet.add(carMake);
        if (governorate) current.governorateSet.add(governorate);
        if (requestedAt > current.lastRequestedAt) {
          current.productName = productName;
          current.lastRequestedAt = requestedAt;
        }
        continue;
      }

      products.set(productKey, {
        productKey,
        productName,
        requestCount: 1,
        customerCount: requesterType === "fitter" ? 0 : 1,
        fitterCount: requesterType === "fitter" ? 1 : 0,
        carMakes: [],
        governorates: [],
        lastRequestedAt: requestedAt,
        carMakeSet: new Set(carMake ? [carMake] : []),
        governorateSet: new Set(governorate ? [governorate] : []),
      });
    }

    const items = [...products.values()]
      .map(({ carMakeSet, governorateSet, ...product }) => ({
        ...product,
        carMakes: [...carMakeSet].sort((a, b) => a.localeCompare(b, "ar")),
        governorates: [...governorateSet].sort((a, b) => a.localeCompare(b, "ar")),
      }))
      .sort(
        (a, b) =>
          b.requestCount - a.requestCount ||
          b.lastRequestedAt.localeCompare(a.lastRequestedAt),
      );
    return { ...eventPage, items };
  });

const mediatorPhoneInput = tokenInput.extend({
  mediatorPhone: z.string().trim().max(40).optional().or(z.literal("")),
  mediatorPhones: z.array(z.string().trim().min(3).max(40)).max(20).optional(),
  platformCommissionPercent: z.number().min(0).max(100).optional(),
  mediatorContacts: z
    .array(
      z.object({
        phone: z.string().trim().min(3).max(40),
        city: z.string().trim().min(2).max(100),
      }),
    )
    .max(20)
    .optional(),
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

export const setMediatorPhone = createServerFn({ method: "POST" })
  .inputValidator((d) => mediatorPhoneInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    const existingCommissionPercent = await getPlatformCommissionPercent();
    const mediatorContacts = normalizeMediatorContacts(data.mediatorContacts ?? []);
    const mediatorPhones = normalizeMediatorPhones([
      ...mediatorContacts.map((contact) => contact.phone),
      ...(data.mediatorPhones ?? []),
      data.mediatorPhone ?? "",
    ]);
    await appendEvent("botly_settings", {
      mediatorPhone: mediatorPhones[0] ?? "",
      mediatorPhones,
      mediatorContacts:
        mediatorContacts.length > 0
          ? mediatorContacts
          : mediatorPhones.map((phone) => ({ phone, city: "" })),
      platformCommissionPercent: data.platformCommissionPercent ?? existingCommissionPercent,
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
