// Public storefront server functions.
//
// The /store/$slug page is PUBLIC (no merchant session): customers open a
// store link and see the merchant's real profile + active products. Hidden /
// suspended / expired merchants return null so the page shows "not found"
// instead of leaking a store the admin disabled.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getNumber, getString, listEvents, type EventRow } from "@/lib/eventStore.server";

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

const slugInput = z.object({ slug: z.string().trim().min(1).max(80) });

export const getPublicStore = createServerFn({ method: "POST" })
  .inputValidator((d) => slugInput.parse(d))
  .handler(async ({ data }): Promise<PublicStore | null> => {
    // Merchants are event-sourced: newest event per merchantId is the current
    // state. Match the CURRENT state's slug only, so renamed slugs don't keep
    // serving the store under an old address.
    const merchantRows = await listEvents("botly_merchant");
    const seenMerchant = new Set<string>();
    let merchant: EventRow | null = null;
    for (const row of merchantRows) {
      const id = getString(row.payload?.merchantId) || row.id;
      if (seenMerchant.has(id)) continue;
      seenMerchant.add(id);
      if (getString(row.payload?.storeSlug) === data.slug) {
        merchant = row;
        break;
      }
    }
    if (!merchant) return null;

    const p = merchant.payload ?? {};
    if (isHiddenMerchant(p)) return null;

    const merchantId = getString(p.merchantId) || merchant.id;

    // Active products, latest event per productId (append-only log).
    const productRows = await listEvents("botly_product");
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
        imageUrl: getString(pp.imageUrl),
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
      logoUrl: getString(p.logoUrl) || undefined,
      coverUrl: getString(p.coverUrl) || undefined,
      whatsapp: getString(p.whatsapp) || undefined,
      products,
    };
  });
