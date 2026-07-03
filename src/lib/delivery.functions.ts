// Delivery companies (server side).
//
// The admin registers platform-wide delivery companies in /admin/delivery.
// Merchants who don't have their own courier pick one of these companies from
// a dropdown in /dashboard/store — selecting a company simply fills the
// merchant's deliveryPhone with the company's WhatsApp number, so the existing
// order-notification path (sendPurchaseDetails → deliveryPhone) works as-is.
//
// Storage follows the platform's event-sourcing model: each change appends a
// `botly_delivery_company` event keyed by companyId; the newest event per
// company wins, and `deleted: true` tombstones remove it from listings.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendEvent,
  authorizeMerchantId,
  getString,
  latestEventWhere,
  listEventsByPayloadField,
  listEventsPage,
  normalizePageRequest,
  sha256,
  type PageRequest,
  type PageResult,
} from "@/lib/eventStore.server";

export interface DeliveryCompanyRecord {
  id: string;
  name: string;
  phone: string;
  cities: string[];
  bannedFromBot: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const tokenInput = z.object({ token: z.string().trim().min(20).max(300) });
const paginatedTokenInput = tokenInput.extend({
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().max(100).optional().or(z.literal("")),
});

const addInput = tokenInput.extend({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40),
  cities: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
});

const companyActionInput = tokenInput.extend({
  companyId: z.string().trim().min(1).max(100),
});

const banInput = companyActionInput.extend({ banned: z.boolean() });

// ---------------------------------------------------------------------------
// Auth — same session model as admin.functions.ts (botly_admin_session rows
// keyed by SHA-256 token hash with TTL).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Read model: newest event per companyId wins; deleted rows drop out.
// ---------------------------------------------------------------------------

function readCities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((c): c is string =>
    typeof c === "string" && c.trim().length > 0 && c.length <= 60
  );
}

async function loadDeliveryCompanies(
  request: PageRequest = {},
): Promise<PageResult<DeliveryCompanyRecord>> {
  const page = await listEventsPage("botly_delivery_company", request);
  const rows = page.items;
  const byId = new Map<string, DeliveryCompanyRecord | null>();

  // listEvents returns newest-first, so the first row per companyId is the
  // current state. A tombstone (`deleted`) marks the company as removed.
  for (const row of rows) {
    const payload = row.payload ?? {};
    const companyId = getString(payload.companyId) || row.id;
    if (byId.has(companyId)) continue;
    if (payload.deleted === true) {
      byId.set(companyId, null);
      continue;
    }
    const name = getString(payload.name);
    const phone = getString(payload.phone);
    if (!name || !phone) {
      byId.set(companyId, null);
      continue;
    }
    byId.set(companyId, {
      id: companyId,
      name,
      phone,
      cities: readCities(payload.cities),
      bannedFromBot: payload.bannedFromBot === true,
      createdAt: getString(payload.createdAt) || new Date().toISOString(),
    });
  }

  const items = [...byId.values()].filter(
    (company): company is DeliveryCompanyRecord => company !== null,
  );
  return { ...page, items };
}

// ---------------------------------------------------------------------------
// Admin server functions
// ---------------------------------------------------------------------------

export const listDeliveryCompaniesAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => paginatedTokenInput.parse(d))
  .handler(async ({ data }): Promise<PageResult<DeliveryCompanyRecord>> => {
    await authorizeAdmin(data.token);
    return loadDeliveryCompanies(normalizePageRequest(data));
  });

export const addDeliveryCompany = createServerFn({ method: "POST" })
  .inputValidator((d) => addInput.parse(d))
  .handler(async ({ data }): Promise<DeliveryCompanyRecord> => {
    await authorizeAdmin(data.token);

    const record: DeliveryCompanyRecord = {
      id: crypto.randomUUID(),
      name: data.name,
      phone: data.phone,
      cities: data.cities ?? [],
      bannedFromBot: false,
      createdAt: new Date().toISOString(),
    };
    await appendEvent("botly_delivery_company", {
      companyId: record.id,
      name: record.name,
      phone: record.phone,
      cities: record.cities,
      bannedFromBot: false,
      createdAt: record.createdAt,
    });
    return record;
  });

export const setDeliveryCompanyBan = createServerFn({ method: "POST" })
  .inputValidator((d) => banInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);

    const row = await latestEventWhere(
      "botly_delivery_company",
      "companyId",
      data.companyId,
    );
    const payload = row?.payload ?? {};
    const company = row
      ? {
          id: data.companyId,
          name: getString(payload.name),
          phone: getString(payload.phone),
          cities: readCities(payload.cities),
          bannedFromBot: payload.bannedFromBot === true,
          createdAt: getString(payload.createdAt) || new Date().toISOString(),
        }
      : null;
    if (!company) throw new Error("لم يتم العثور على شركة التوصيل.");

    await appendEvent("botly_delivery_company", {
      companyId: company.id,
      name: company.name,
      phone: company.phone,
      cities: company.cities,
      bannedFromBot: data.banned,
      createdAt: company.createdAt,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  });

export const removeDeliveryCompany = createServerFn({ method: "POST" })
  .inputValidator((d) => companyActionInput.parse(d))
  .handler(async ({ data }) => {
    await authorizeAdmin(data.token);
    await appendEvent("botly_delivery_company", {
      companyId: data.companyId,
      deleted: true,
      deletedAt: new Date().toISOString(),
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Merchant server function — the dropdown in /dashboard/store. Only active
// (non-banned) companies are offered to merchants.
// ---------------------------------------------------------------------------

export const listActiveDeliveryCompanies = createServerFn({ method: "POST" })
  .inputValidator((d) => paginatedTokenInput.parse(d))
  .handler(async ({ data }): Promise<PageResult<DeliveryCompanyRecord>> => {
    await authorizeMerchantId(data.token);
    const page = await loadDeliveryCompanies(normalizePageRequest(data));
    return {
      ...page,
      items: page.items.filter((company) => !company.bannedFromBot),
    };
  });
