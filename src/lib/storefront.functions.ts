// Public storefront server functions.
//
// The /store/$slug page is PUBLIC (no merchant session): customers open a
// store link and see the merchant's real profile + active products. Hidden /
// suspended / expired merchants return null so the page shows "not found"
// instead of leaking a store the admin disabled.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { diagnoseServerResult } from "@/lib/egress-diagnostics.server";
import {
  getProjectedEventByPayloadField,
  getString,
  listProjectedEventsByPayloadFieldPage,
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

function projectedNumber(value: unknown): number | undefined {
  const text = getString(value).trim();
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
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
    const pagination = normalizePageRequest(data);
    const finish = (result: PublicStore | null) =>
      diagnoseServerResult("api:getPublicStore", result, {
        user: data.slug,
        params: pagination,
      });
    // Merchants are event-sourced: newest event per merchantId is the current
    // state. Match the CURRENT state's slug only, so renamed slugs don't keep
    // serving the store under an old address.
    const merchant = await getProjectedEventByPayloadField(
      "botly_merchant",
      "storeSlug",
      data.slug,
      [
        "merchant_id:payload->>merchantId",
        "store_name:payload->>storeName",
        "bio:payload->>bio",
        "address:payload->>address",
        "whatsapp:payload->>whatsapp",
        "banned:payload->bannedFromBot",
        "visibility:payload->visibilityEnabled",
        "active:payload->isActive",
        "suspended_at:payload->>suspendedAt",
        "subscription_status:payload->>subscriptionStatus",
        "package_expiry:payload->>packageExpiry",
      ].join(","),
    );
    if (!merchant) return finish(null);

    const p: Record<string, unknown> = {
      bannedFromBot: merchant.banned,
      visibilityEnabled: merchant.visibility,
      isActive: merchant.active,
      suspendedAt: merchant.suspended_at,
      subscriptionStatus: merchant.subscription_status,
      packageExpiry: merchant.package_expiry,
    };
    if (isHiddenMerchant(p)) return finish(null);

    const merchantId = getString(merchant.merchant_id) || merchant.id;

    // Active products, latest event per productId (append-only log).
    const productPage = await listProjectedEventsByPayloadFieldPage(
      "botly_product",
      "merchantId",
      merchantId,
      [
        "product_id:payload->>productId",
        "merchant_id:payload->>merchantId",
        "status:payload->>status",
        "title:payload->>title",
        "description:payload->>description",
        "current_price:payload->>currentPrice",
        "discount_price:payload->>discountPrice",
        "currency:payload->>currency",
        "size:payload->>size",
        "color:payload->>color",
        "car_model:payload->>carModel",
        "car_year:payload->>carYear",
        "quantity:payload->>quantity",
      ].join(","),
      pagination,
    );
    const productRows = productPage.items;
    const seenProduct = new Set<string>();
    const products: PublicStoreProduct[] = [];
    for (const row of productRows) {
      const pid = getString(row.product_id) || row.id;
      if (seenProduct.has(pid)) continue;
      seenProduct.add(pid);
      if (getString(row.merchant_id) !== merchantId) continue;
      if ((getString(row.status) || "active") !== "active") continue;
      const currentPrice = projectedNumber(row.current_price);
      const discountPrice = projectedNumber(row.discount_price);
      const quantity = projectedNumber(row.quantity);
      products.push({
        id: pid,
        title: getString(row.title) || getString(row.description) || "منتج",
        description: getString(row.description),
        imageUrl: `/api/product-image/${encodeURIComponent(pid)}?index=0`,
        price: currentPrice ?? 0,
        discountPrice,
        currency: getString(row.currency) || "IQD",
        size: getString(row.size) || undefined,
        color: getString(row.color) || undefined,
        carModel: getString(row.car_model) || undefined,
        carYear: getString(row.car_year) || undefined,
        quantity,
      });
    }

    return finish({
      storeName: getString(merchant.store_name) || "متجر",
      storeSlug: data.slug,
      bio: getString(merchant.bio) || undefined,
      address: getString(merchant.address) || undefined,
      logoUrl: `/api/merchant-image/${encodeURIComponent(merchantId)}?type=logo`,
      coverUrl: `/api/merchant-image/${encodeURIComponent(merchantId)}?type=cover`,
      whatsapp: getString(merchant.whatsapp) || undefined,
      products,
      page: pagination.page,
      limit: pagination.limit,
      hasMore: productPage.hasMore,
      nextCursor: productPage.nextCursor,
    });
  });
