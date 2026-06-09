// Product search for the customer flow.
//
// Division of responsibility (per architecture):
//   - GPT extracts INTENT only (search terms / category / brand / color) from
//     the natural-language customer message.
//   - PostgreSQL (pg_trgm via the search_botly_products RPC) performs the ACTUAL
//     product matching. GPT never searches the catalogue directly.

import OpenAI from "openai";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeArabicText } from "./iraqi-arabic";
import { getString, getNumber, listEvents } from "@/lib/eventStore.server";

function getOpenAIApiKey() {
  return process.env.OPENAI_API_KEY;
}

function getOpenAIModel() {
  return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
}

export interface SearchIntent {
  searchTerms: string;
  category: string | null;
  brand: string | null;
  color: string | null;
  maxPrice: number | null;
}

export interface CustomerLocation {
  latitude: number;
  longitude: number;
}

export interface ProductMatch {
  id: string;
  merchantId: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  postUrl: string;
  color: string | null;
  similarity: number;
  storeName?: string;
  merchantAddress?: string | null;
  merchantWhatsapp?: string | null;
  deliveryPhone?: string | null;
  distanceKm?: number;
  sponsored?: boolean;
  source?: string;
}

const INTENT_PROMPT = `استخرج نية البحث من رسالة الزبون. رجّع JSON فقط:
{"search_terms": string, "category": string|null, "brand": string|null, "color": string|null, "max_price": number|null}
search_terms: أهم الكلمات للبحث (نظّف الإيموجي والكلام الزائد).`;

// GPT-based intent extraction. Falls back to the normalized raw message if the
// model is unavailable or errors — search must still work without AI.
export async function extractSearchIntent(customerText: string): Promise<SearchIntent> {
  const normalized = normalizeArabicText(customerText);
  const fallback: SearchIntent = {
    searchTerms: normalized,
    category: null,
    brand: null,
    color: null,
    maxPrice: null,
  };

  const apiKey = getOpenAIApiKey();
  if (!apiKey) return fallback;

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: getOpenAIModel(),
      max_tokens: 150,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: INTENT_PROMPT },
        { role: "user", content: normalized },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return fallback;

    const raw = JSON.parse(content) as {
      search_terms?: string;
      category?: string | null;
      brand?: string | null;
      color?: string | null;
      max_price?: number | null;
    };

    return {
      searchTerms: (raw.search_terms ?? "").trim() || normalized,
      category: raw.category?.trim() || null,
      brand: raw.brand?.trim() || null,
      color: raw.color?.trim() || null,
      maxPrice: typeof raw.max_price === "number" && raw.max_price > 0 ? raw.max_price : null,
    };
  } catch (error) {
    console.error("[Search] Intent extraction failed, using raw query", error);
    return fallback;
  }
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface SearchOptions {
  customerLocation?: CustomerLocation;
  radiusKm?: number;
  limit?: number;
}

interface MerchantInfo {
  storeName?: string;
  address?: string | null;
  whatsapp?: string | null;
  deliveryPhone?: string | null;
  latitude?: number;
  longitude?: number;
}

// Merchant location + contact details live on the `botly_merchant` event, NOT on
// the product. Build a merchantId → latest-merchant map so search results can be
// enriched (store name / phone) and filtered by real merchant coordinates.
async function loadMerchantMap(): Promise<Map<string, MerchantInfo>> {
  const map = new Map<string, MerchantInfo>();
  try {
    // listEvents returns newest-first, so the first row per merchantId wins.
    const rows = await listEvents("botly_merchant");
    for (const row of rows) {
      const p = row.payload ?? {};
      const id = getString(p.merchantId) || row.id;
      if (!id || map.has(id)) continue;
      map.set(id, {
        storeName: getString(p.storeName) || getString(p.merchantName) || getString(p.name) || undefined,
        address: getString(p.address) || getString(p.merchantAddress) || null,
        whatsapp: getString(p.whatsapp) || getString(p.merchantWhatsapp) || getString(p.phone) || null,
        deliveryPhone: getString(p.deliveryPhone) || null,
        latitude: getNumber(p.latitude) ?? getNumber(p.merchantLatitude),
        longitude: getNumber(p.longitude) ?? getNumber(p.merchantLongitude),
      });
    }
  } catch (error) {
    console.error("[Search] Failed to load merchant map", error);
  }
  return map;
}

// Run the actual database search via the pg_trgm RPC. Falls back gracefully to
// an empty result set if the RPC (migration) isn't deployed yet.
export async function searchProducts(
  intent: SearchIntent,
  maxResults = 8,
  options?: SearchOptions,
): Promise<ProductMatch[]> {
  const query = [intent.searchTerms, intent.brand, intent.category, intent.color]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!query) return [];

  // The RPC lives in a migration not reflected in the generated Supabase types,
  // so we bypass the typed client surface here (same pattern as merchant.functions).
  const { data, error } = await (
    supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>
  )("search_botly_products", {
    search_query: query,
    max_results: Math.max(maxResults * 3, 30),
  });

  if (error) {
    console.error("[Search] RPC search_botly_products failed", error);
    return [];
  }

  const rows = (data ?? []) as Array<{
    id: string;
    payload: Record<string, unknown>;
    similarity: number;
  }>;

  // Enrich with merchant details (store name / phone / coordinates) — these live
  // on the merchant event, not the product. Falls back gracefully if the lookup
  // fails so search still returns products.
  const merchants = await loadMerchantMap();

  let matches: ProductMatch[] = rows.map((row) => {
    const p = row.payload ?? {};
    const merchantId = getString(p.merchantId);
    const merchant = merchants.get(merchantId);
    return {
      id: getString(p.productId) || row.id,
      merchantId,
      title: getString(p.title) || getString(p.description) || "منتج",
      description: getString(p.description),
      price: getNumber(p.discountPrice) ?? getNumber(p.currentPrice) ?? 0,
      currency: getString(p.currency) || "IQD",
      imageUrl: getString(p.imageUrl),
      postUrl: getString(p.postUrl),
      color: getString(p.color) || null,
      similarity: row.similarity ?? 0,
      storeName: merchant?.storeName || "متجر",
      merchantAddress: merchant?.address ?? null,
      merchantWhatsapp: merchant?.whatsapp ?? null,
      deliveryPhone: merchant?.deliveryPhone ?? null,
      sponsored: Boolean((p as Record<string, unknown>).sponsored),
      source: getString(p.source) || "manual",
    };
  });

  if (intent.maxPrice) {
    matches = matches.filter((m) => m.price === 0 || m.price <= intent.maxPrice!);
  }

  if (options?.customerLocation) {
    const radius = options.radiusKm || 15;
    matches = matches
      .map((m) => {
        const merchant = merchants.get(m.merchantId);
        const mLat = merchant?.latitude;
        const mLon = merchant?.longitude;
        // Merchant has no coordinates yet → keep the product (distance unknown).
        // We must NEVER drop a real product just because its store hasn't shared
        // a location; that would empty the results for every registered store.
        if (typeof mLat !== "number" || typeof mLon !== "number") {
          return { ...m, distanceKm: undefined };
        }
        const dist = haversineDistance(
          options.customerLocation!.latitude,
          options.customerLocation!.longitude,
          mLat,
          mLon,
        );
        return { ...m, distanceKm: dist };
      })
      // Only exclude products whose merchant has coordinates AND is out of range.
      // Coordinate-less products (distanceKm undefined) are retained.
      .filter((m) => m.distanceKm === undefined || m.distanceKm <= radius)
      // Nearest first; unknown-distance products sort to the end.
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }

  return matches.slice(0, options?.limit || maxResults);
}
