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
import { getString, getNumber } from "@/lib/eventStore.server";

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

  let matches: ProductMatch[] = rows.map((row) => {
    const p = row.payload ?? {};
    const m = row.payload as any;
    return {
      id: getString(p.productId) || row.id,
      merchantId: getString(p.merchantId),
      title: getString(p.title) || getString(p.description) || "منتج",
      description: getString(p.description),
      price: getNumber(p.discountPrice) ?? getNumber(p.currentPrice) ?? 0,
      currency: getString(p.currency) || "IQD",
      imageUrl: getString(p.imageUrl),
      postUrl: getString(p.postUrl),
      color: getString(p.color) || null,
      similarity: row.similarity ?? 0,
      storeName: getString(m.storeName) || getString(m.merchantName) || "متجر",
      merchantAddress: getString(m.merchantAddress) || null,
      merchantWhatsapp: getString(m.merchantWhatsapp) || getString(m.merchantPhone) || null,
      deliveryPhone: getString(m.deliveryPhone) || null,
      sponsored: Boolean(m.sponsored),
      source: getString(m.source) || "manual",
    };
  });

  if (intent.maxPrice) {
    matches = matches.filter((m) => m.price === 0 || m.price <= intent.maxPrice!);
  }

  if (options?.customerLocation) {
    const radius = options.radiusKm || 15;
    matches = matches
      .map((m) => {
        const payload = rows.find((r) => getString(r.payload?.productId) === m.id)?.payload ?? {};
        const mLat = getNumber(payload.merchantLatitude) ?? getNumber(payload.latitude);
        const mLon = getNumber(payload.merchantLongitude) ?? getNumber(payload.longitude);
        if (typeof mLat !== "number" || typeof mLon !== "number") {
          return { ...m, distanceKm: radius + 1 };
        }
        const dist = haversineDistance(
          options.customerLocation!.latitude,
          options.customerLocation!.longitude,
          mLat,
          mLon,
        );
        return { ...m, distanceKm: dist };
      })
      .filter((m) => !m.distanceKm || m.distanceKm <= radius)
      .sort((a, b) => (a.distanceKm || Infinity) - (b.distanceKm || Infinity));
  }

  return matches.slice(0, options?.limit || maxResults);
}
