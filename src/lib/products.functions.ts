import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendEvent,
  listEventsByPayloadFieldPage,
  listEvents,
  latestEventWhere,
  normalizePageRequest,
  authorizeMerchantId,
  getString,
  getNumber,
  eventTime,
  type EventRow,
  type PageRequest,
  type PageResult,
} from "@/lib/eventStore.server";

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export type ManagedProduct = {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  postUrl: string;
  source: string; // "manual" | "video"
  category: string | null;
  brand: string | null;
  color: string | null;
  status: string; // active | pending_review | rejected | unavailable
  confidenceScore: number | null;
  confidenceReason: string | null;
  requiresReview: boolean;
  availability: string;
  createdAt: string;
};

export type MerchantLead = {
  id: string;
  productId: string;
  customerNumber: string;
  customerQuery: string;
  matchedTitle: string;
  notified: boolean;
  createdAt: string;
};

const tokenInput = z.object({ token: z.string().trim().min(20).max(300) });
const paginatedTokenInput = tokenInput.extend({
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().max(100).optional().or(z.literal("")),
});

const productActionInput = tokenInput.extend({
  productId: z.string().trim().min(1).max(100),
});

const productEditInput = productActionInput.extend({
  title: z.string().trim().min(1).max(280).optional(),
  description: z.string().trim().max(1000).optional(),
  currentPrice: z.number().min(0).max(999_999_999).optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  category: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(80).optional(),
  color: z.string().trim().max(80).optional(),
});

const availabilityInput = productActionInput.extend({
  available: z.boolean(),
});

// ---------------------------------------------------------------------------
// Helpers (latest-per-productId over the append-only product log)
// ---------------------------------------------------------------------------

function productId(row: EventRow): string {
  return getString(row.payload?.productId) || row.id;
}

// Collapse the product event log to the latest row per productId.
async function latestProductsByMerchant(merchantId: string, request: PageRequest = {}) {
  const page = await listEventsByPayloadFieldPage(
    "botly_product",
    "merchantId",
    merchantId,
    request,
  );
  const rows = page.items;
  const seen = new Map<string, EventRow>();
  for (const row of rows) {
    if (getString(row.payload?.merchantId) !== merchantId) continue;
    const pid = productId(row);
    if (!seen.has(pid)) seen.set(pid, row); // first = newest
  }
  return { rows: [...seen.values()], page };
}

function toManaged(row: EventRow): ManagedProduct {
  const p = row.payload ?? {};
  const id = productId(row);
  const rawImageUrl = getString(p.imageUrl);
  return {
    id,
    title: getString(p.title) || getString(p.description) || "منتج",
    description: getString(p.description),
    price: getNumber(p.discountPrice) ?? getNumber(p.currentPrice) ?? 0,
    currency: getString(p.currency) || "IQD",
    imageUrl: /^data:image\//i.test(rawImageUrl)
      ? `/api/product-image/${encodeURIComponent(id)}?index=0`
      : rawImageUrl,
    postUrl: getString(p.postUrl),
    source: getString(p.source) || "manual",
    category: getString(p.category) || null,
    brand: getString(p.brand) || null,
    color: getString(p.color) || null,
    status: getString(p.status) || "active",
    confidenceScore: getNumber(p.confidenceScore) ?? null,
    confidenceReason: getString(p.confidenceReason) || null,
    requiresReview: p.requiresReview === true,
    availability: getString(p.availability) || "unknown",
    createdAt: getString(p.createdAt) || eventTime(row),
  };
}

// Find the latest event for a product owned by the merchant, or throw.
async function requireOwnedProduct(merchantId: string, pid: string): Promise<EventRow> {
  const row = await latestEventWhere("botly_product", "productId", pid);
  if (!row || getString(row.payload?.merchantId) !== merchantId) {
    throw new Error("المنتج غير موجود أو لا يخص متجرك.");
  }
  return row;
}

// Append an updated product event (append-only "edit"). Recomputes searchText.
async function appendProductUpdate(base: EventRow, changes: Record<string, unknown>) {
  const current = base.payload ?? {};
  const merged: Record<string, unknown> = {
    ...current,
    ...changes,
    updatedAt: new Date().toISOString(),
  };

  merged.searchText = [
    merged.title,
    merged.category,
    merged.brand,
    merged.color,
    ...(Array.isArray(merged.keywords) ? (merged.keywords as unknown[]) : []),
  ]
    .filter(Boolean)
    .join(" ");

  await appendEvent("botly_product", merged);
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

// Products awaiting merchant confirmation (low-confidence AI extractions).
export const listReviewProducts = createServerFn({ method: "POST" })
  .inputValidator((d) => paginatedTokenInput.parse(d))
  .handler(async ({ data }): Promise<PageResult<ManagedProduct>> => {
    const merchantId = await authorizeMerchantId(data.token);
    const result = await latestProductsByMerchant(merchantId, data);
    const items = result.rows
      .map(toManaged)
      .filter((p) => p.status === "pending_review" || p.requiresReview)
      .sort((a, b) => (a.confidenceScore ?? 0) - (b.confidenceScore ?? 0));
    return { ...result.page, items };
  });

// Full managed catalogue (manual + imported), latest state per product.
export const listManagedProducts = createServerFn({ method: "POST" })
  .inputValidator((d) => paginatedTokenInput.parse(d))
  .handler(async ({ data }): Promise<PageResult<ManagedProduct>> => {
    const merchantId = await authorizeMerchantId(data.token);
    const result = await latestProductsByMerchant(merchantId, data);
    const items = result.rows
      .map(toManaged)
      .filter((p) => p.status !== "rejected")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { ...result.page, items };
  });

// Approve a pending product -> active and searchable.
export const approveProduct = createServerFn({ method: "POST" })
  .inputValidator((d) => productActionInput.parse(d))
  .handler(async ({ data }) => {
    const merchantId = await authorizeMerchantId(data.token);
    const row = await requireOwnedProduct(merchantId, data.productId);
    await appendProductUpdate(row, { status: "active", requiresReview: false });
    return { ok: true };
  });

// Reject a product -> hidden from search.
export const rejectProduct = createServerFn({ method: "POST" })
  .inputValidator((d) => productActionInput.parse(d))
  .handler(async ({ data }) => {
    const merchantId = await authorizeMerchantId(data.token);
    const row = await requireOwnedProduct(merchantId, data.productId);
    await appendProductUpdate(row, { status: "rejected", requiresReview: false });
    return { ok: true };
  });

// Edit + activate a product (merchant correction of AI extraction).
export const updateImportedProduct = createServerFn({ method: "POST" })
  .inputValidator((d) => productEditInput.parse(d))
  .handler(async ({ data }) => {
    const merchantId = await authorizeMerchantId(data.token);
    const row = await requireOwnedProduct(merchantId, data.productId);

    const changes: Record<string, unknown> = {
      status: "active",
      requiresReview: false,
    };
    if (data.title !== undefined) changes.title = data.title;
    if (data.description !== undefined) changes.description = data.description;
    if (data.currentPrice !== undefined) changes.currentPrice = data.currentPrice;
    if (data.currency !== undefined) changes.currency = data.currency;
    if (data.category !== undefined) changes.category = data.category;
    if (data.brand !== undefined) changes.brand = data.brand;
    if (data.color !== undefined) changes.color = data.color;

    await appendProductUpdate(row, changes);
    return { ok: true };
  });

// Toggle availability (e.g. sold out). Unavailable products drop out of search.
export const setProductAvailability = createServerFn({ method: "POST" })
  .inputValidator((d) => availabilityInput.parse(d))
  .handler(async ({ data }) => {
    const merchantId = await authorizeMerchantId(data.token);
    const row = await requireOwnedProduct(merchantId, data.productId);
    await appendProductUpdate(row, {
      availability: data.available ? "in_stock" : "out_of_stock",
      status: data.available ? "active" : "unavailable",
    });
    return { ok: true };
  });

// Leads (interested customers) for this merchant, newest first.
export const listMerchantLeads = createServerFn({ method: "POST" })
  .inputValidator((d) => paginatedTokenInput.parse(d))
  .handler(async ({ data }): Promise<PageResult<MerchantLead>> => {
    const merchantId = await authorizeMerchantId(data.token);
    const pagination = normalizePageRequest(data);
    const page = await listEventsByPayloadFieldPage(
      "botly_lead",
      "merchantId",
      merchantId,
      pagination,
    );
    const items = page.items
      .filter((row) => getString(row.payload?.merchantId) === merchantId)
      .map((row) => {
        const p = row.payload ?? {};
        return {
          id: getString(p.leadId) || row.id,
          productId: getString(p.productId),
          customerNumber: getString(p.customerNumber),
          customerQuery: getString(p.customerQuery),
          matchedTitle: getString(p.matchedTitle),
          notified: p.notified === true,
          createdAt: getString(p.createdAt) || eventTime(row),
        };
      });
    return { ...page, items };
  });
