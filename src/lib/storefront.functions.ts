// Public storefront server functions.
//
// The /store/$slug page is PUBLIC (no merchant session): customers open a
// store link and see the merchant's real profile + active products. Hidden /
// suspended / expired merchants return null so the page shows "not found"
// instead of leaking a store the admin disabled.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  getNumber,
  getString,
  latestEventWhere,
  listEventsByPayloadFieldPage,
  normalizePageRequest,
} from "@/lib/eventStore.server";

export type PublicStoreProduct = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  price: number;
  discountPrice?: number;
  currency: string;
  size?: string;
  color?: string;
  carModel?: string;
  carYear?: string;
  quantity?: number;
};

export type PublicStore = {
  storeName: string;
  storeSlug: string;
  bio?: string;
  address?: string;
  logoUrl?: string;
  coverUrl?: string;
  whatsapp?: string;
  products: PublicStoreProduct[];
  page: number;
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
};

// Same effective-visibility rules the bot search applies (flags may be stored
// as booleans or strings depending on which code path wrote the event).
function isHiddenMerchant(p: Record<string, unknown>): boolean {
  if (p.bannedFromBot === true || p.bannedFromBot === "true") return true;
  if (p.visibilityEnabled === false || p.visibilityEnabled === "false") return true;
  if (p.isActive === false || p.isActive === "false") return true;
  if (getString(p.suspendedAt).trim() !== "") return true;
  if (getString(p.subscriptionStatus) === "expired") return true;
  const expiry = getString(p.packageExpiry);
  if (expiry && new Date(expiry).getTime() < Date.now()) return true;
  return false;
}

const slugInput = z.object({
  slug: z.string().trim().min(1).max(80),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().max(100).optional().or(z.literal("")),
});

export const getPublicStore = createServerFn({ method: "POST" })
  .inputValidator((d) => slugInput.parse(d))
  .handler(async ({ data }): Promise<PublicStore | null> => {
    // Merchants are event-sourced: newest event per merchantId is the current
    // state. Match the CURRENT state's slug only, so renamed slugs don't keep
    // serving the store under an old address.
    const merchant = await latestEventWhere("botly_merchant", "storeSlug", data.slug);
    if (!merchant) return null;

    const p = merchant.payload ?? {};
    if (isHiddenMerchant(p)) return null;

    const merchantId = getString(p.merchantId) || merchant.id;

    // Active products, latest event per productId (append-only log).
    const pagination = normalizePageRequest(data);
    const productPage = await listEventsByPayloadFieldPage(
      "botly_product",
      "merchantId",
      merchantId,
      pagination,
    );
    const productRows = productPage.items;
    const seenProduct = new Set<string>();
    const products: PublicStoreProduct[] = [];
    for (const row of productRows) {
      const pp = row.payload ?? {};
      const pid = getString(pp.productId) || row.id;
      if (seenProduct.has(pid)) continue;
      seenProduct.add(pid);
      if (getString(pp.merchantId) !== merchantId) continue;
      if ((getString(pp.status) || "active") !== "active") continue;
      products.push({
        id: pid,
        title: getString(pp.title) || getString(pp.description) || "منتج",
        description: getString(pp.description),
        imageUrl: /^data:image\//i.test(getString(pp.imageUrl))
          ? `/api/product-image/${encodeURIComponent(pid)}?index=0`
          : getString(pp.imageUrl),
        price: getNumber(pp.currentPrice) ?? 0,
        discountPrice: getNumber(pp.discountPrice),
        currency: getString(pp.currency) || "IQD",
        size: getString(pp.size) || undefined,
        color: getString(pp.color) || undefined,
        carModel: getString(pp.carModel) || undefined,
        carYear: getString(pp.carYear) || undefined,
        quantity: getNumber(pp.quantity),
      });
    }

    return {
      storeName: getString(p.storeName) || "متجر",
      storeSlug: data.slug,
      bio: getString(p.bio) || undefined,
      address: getString(p.address) || undefined,
      logoUrl: /^data:image\//i.test(getString(p.logoUrl))
        ? `/api/merchant-image/${encodeURIComponent(merchantId)}?type=logo`
        : getString(p.logoUrl) || undefined,
      coverUrl: /^data:image\//i.test(getString(p.coverUrl))
        ? `/api/merchant-image/${encodeURIComponent(merchantId)}?type=cover`
        : getString(p.coverUrl) || undefined,
      whatsapp: getString(p.whatsapp) || undefined,
      products,
      page: pagination.page,
      limit: pagination.limit,
      hasMore: productPage.hasMore,
      nextCursor: productPage.nextCursor,
    };
  });
