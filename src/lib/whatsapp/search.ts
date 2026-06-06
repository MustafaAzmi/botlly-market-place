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
import { eventTime, getNumber, getString, listEvents } from "@/lib/eventStore.server";

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

export interface ProductMatch {
  id: string;
  merchantId: string;
  storeName: string;
  merchantWhatsapp: string;
  merchantAddress: string;
  deliveryPhone: string;
  merchantLatitude: number | null;
  merchantLongitude: number | null;
  sponsored: boolean;
  distanceKm: number | null;
  title: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  postUrl: string;
  source: string;
  color: string | null;
  similarity: number;
}

export interface CustomerLocation {
  latitude: number;
  longitude: number;
}

export interface SearchOptions {
  merchantId?: string | null;
  customerLocation?: CustomerLocation | null;
  radiusKm?: number;
  limit?: number;
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

// Run the actual database search via the pg_trgm RPC. Falls back gracefully to
// an empty result set if the RPC (migration) isn't deployed yet.
export async function searchProducts(
  intent: SearchIntent,
  maxResults = 8,
  optionsOrMerchantId?: SearchOptions | string | null,
): Promise<ProductMatch[]> {
  const options: SearchOptions =
    typeof optionsOrMerchantId === "string" || optionsOrMerchantId === null
      ? { merchantId: optionsOrMerchantId }
      : optionsOrMerchantId ?? {};
  const merchantId = options.merchantId;
  const radiusKm = options.radiusKm ?? 15;
  const resultLimit = options.limit ?? maxResults;
  const query = [intent.searchTerms, intent.brand, intent.category, intent.color]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!query) return [];

  const merchants = await loadSearchableMerchants();

  // The RPC lives in a migration not reflected in the generated Supabase types,
  // so we bypass the typed client surface here (same pattern as merchant.functions).
  const { data, error } = await (
    supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>
  )("search_botly_products", {
    search_query: query,
    max_results: maxResults,
  });

  if (error) {
    console.error("[Search] RPC search_botly_products failed", error);
    return searchProductsFromEventStore(intent, resultLimit, merchants, options);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    payload: Record<string, unknown>;
    similarity: number;
  }>;

  let matches: ProductMatch[] = rows
    .map((row) => {
      const p = row.payload ?? {};
      const rowMerchantId = getString(p.merchantId);
      const merchant = merchants.get(rowMerchantId);
      if (!merchant) return null;
      return {
        id: getString(p.productId) || row.id,
        merchantId: rowMerchantId,
        storeName: merchant.storeName,
        merchantWhatsapp: merchant.whatsapp,
        merchantAddress: merchant.address,
        deliveryPhone: merchant.deliveryPhone,
        merchantLatitude: merchant.latitude,
        merchantLongitude: merchant.longitude,
        sponsored: merchant.sponsored,
        distanceKm: calculateDistanceKm(options.customerLocation, merchant),
        title: getString(p.title) || getString(p.description) || "منتج",
        description: getString(p.description),
        price: getNumber(p.discountPrice) ?? getNumber(p.currentPrice) ?? 0,
        currency: getString(p.currency) || "IQD",
        imageUrl: getString(p.imageUrl),
        postUrl: getString(p.postUrl),
        source: getString(p.source) || getString(p.platform) || "manual",
        color: getString(p.color) || null,
        similarity: row.similarity ?? 0,
      };
    })
    .filter((match): match is ProductMatch => Boolean(match))
    .filter((match) => !merchantId || match.merchantId === merchantId)
    .filter((match) => {
      if (!options.customerLocation) return true;
      if (match.sponsored) return true;
      return typeof match.distanceKm === "number" && match.distanceKm <= radiusKm;
    });

  // Apply the price filter from intent (DB returns by relevance only).
  if (intent.maxPrice) {
    matches = matches.filter((m) => m.price === 0 || m.price <= intent.maxPrice!);
  }

  matches = sortMatches(matches);

  if (matches.length > 0) return matches.slice(0, resultLimit);

  return searchProductsFromEventStore(intent, resultLimit, merchants, options);
}

interface SearchableMerchant {
  storeName: string;
  whatsapp: string;
  address: string;
  deliveryPhone: string;
  latitude: number | null;
  longitude: number | null;
  sponsored: boolean;
}

function isMerchantSearchable(payload: Record<string, unknown>) {
  if (payload.bannedFromBot === true) return false;
  if (payload.visibilityEnabled === false) return false;
  if (payload.isActive === false) return false;
  if (getString(payload.suspendedAt)) return false;
  if (getString(payload.subscriptionStatus) === "expired") return false;

  const packageExpiry = getString(payload.packageExpiry);
  if (packageExpiry && new Date(packageExpiry).getTime() < Date.now()) return false;

  return true;
}

async function loadSearchableMerchants(): Promise<Map<string, SearchableMerchant>> {
  const rows = await listEvents("botly_merchant");
  const merchants = new Map<string, SearchableMerchant>();

  for (const row of rows) {
    const payload = row.payload ?? {};
    const merchantId = getString(payload.merchantId) || row.id;
    if (merchants.has(merchantId)) continue;
    if (!isMerchantSearchable(payload)) continue;

    merchants.set(merchantId, {
      storeName: getString(payload.storeName) || "متجر",
      whatsapp: getString(payload.whatsappNormalized) || getString(payload.whatsapp),
      address:
        getString(payload.address) ||
        getString(payload.location) ||
        getString(payload.storeAddress) ||
        "",
      deliveryPhone: getString(payload.deliveryPhone),
      latitude: getNumber(payload.latitude) ?? getNumber(payload.lat) ?? null,
      longitude: getNumber(payload.longitude) ?? getNumber(payload.lng) ?? null,
      sponsored:
        getString(payload.subscriptionStatus) === "active" ||
        payload.featuredInSearch === true ||
        payload.sponsoredSearch === true,
    });
  }

  return merchants;
}

function calculateDistanceKm(
  customerLocation: CustomerLocation | null | undefined,
  merchant: SearchableMerchant,
) {
  if (!customerLocation || merchant.latitude === null || merchant.longitude === null) return null;
  const earthRadiusKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(merchant.latitude - customerLocation.latitude);
  const dLon = toRad(merchant.longitude - customerLocation.longitude);
  const lat1 = toRad(customerLocation.latitude);
  const lat2 = toRad(merchant.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sortMatches(matches: ProductMatch[]) {
  return matches.sort((a, b) => {
    if (a.sponsored !== b.sponsored) return a.sponsored ? -1 : 1;
    if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm;
    }
    return b.similarity - a.similarity;
  });
}

function normalizeSearchValue(value: string): string {
  return normalizeArabicText(value).toLowerCase().trim();
}

function tokenize(value: string): string[] {
  return normalizeSearchValue(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function isGenericCatalogQuery(value: string): boolean {
  const normalized = normalizeSearchValue(value);
  return [
    "شنو عندك",
    "شنو المنتجات",
    "عندك منتجات",
    "منتجات",
    "المتوفر",
    "شنو متوفر",
    "catalog",
    "products",
  ].some((phrase) => normalized.includes(phrase));
}

function scoreProduct(payload: Record<string, unknown>, terms: string[]): number {
  const haystack = normalizeSearchValue(
    [
      getString(payload.searchText),
      getString(payload.title),
      getString(payload.description),
      getString(payload.category),
      getString(payload.brand),
      getString(payload.color),
      getString(payload.condition),
      Array.isArray(payload.keywords) ? payload.keywords.join(" ") : "",
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (!haystack) return 0;

  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += 2;
    for (const word of haystack.split(/\s+/)) {
      if (word.startsWith(term) || term.startsWith(word)) score += 0.5;
    }
  }
  return score;
}

async function searchProductsFromEventStore(
  intent: SearchIntent,
  maxResults: number,
  merchants: Map<string, SearchableMerchant>,
  options: SearchOptions = {},
): Promise<ProductMatch[]> {
  const merchantId = options.merchantId;
  const radiusKm = options.radiusKm ?? 15;
  const query = [intent.searchTerms, intent.brand, intent.category, intent.color]
    .filter(Boolean)
    .join(" ");
  const terms = tokenize(query);
  const genericCatalogQuery = isGenericCatalogQuery(query);
  if (terms.length === 0 && !genericCatalogQuery) return [];

  const rows = await listEvents("botly_product");
  const latestRowsByProduct = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const payload = row.payload ?? {};
    const productId = getString(payload.productId) || row.id;
    if (!latestRowsByProduct.has(productId)) latestRowsByProduct.set(productId, row);
  }

  const matches = [...latestRowsByProduct.values()]
    .map((row) => {
      const payload = row.payload ?? {};
      const rowMerchantId = getString(payload.merchantId);
      if (merchantId && rowMerchantId !== merchantId) return null;
      const merchant = merchants.get(rowMerchantId);
      if (!merchant) return null;

      const status = getString(payload.status) || "active";
      const availability = getString(payload.availability);
      const quantity = getNumber(payload.quantity);

      if (
        status === "deleted" ||
        status === "pending_review" ||
        status === "rejected" ||
        status === "unavailable"
      ) {
        return null;
      }
      if (availability === "out_of_stock") return null;
      if (typeof quantity === "number" && quantity <= 0) return null;

      const similarity = genericCatalogQuery ? 1 : scoreProduct(payload, terms);
      if (similarity <= 0) return null;

      const price = getNumber(payload.discountPrice) ?? getNumber(payload.currentPrice) ?? 0;
      if (intent.maxPrice && price > 0 && price > intent.maxPrice) return null;

      return {
        id: getString(payload.productId) || row.id,
        merchantId: rowMerchantId,
        storeName: merchant.storeName,
        merchantWhatsapp: merchant.whatsapp,
        merchantAddress: merchant.address,
        deliveryPhone: merchant.deliveryPhone,
        merchantLatitude: merchant.latitude,
        merchantLongitude: merchant.longitude,
        sponsored: merchant.sponsored,
        distanceKm: calculateDistanceKm(options.customerLocation, merchant),
        title: getString(payload.title) || getString(payload.description) || "منتج",
        description: getString(payload.description),
        price,
        currency: getString(payload.currency) || "IQD",
        imageUrl: getString(payload.imageUrl),
        postUrl: getString(payload.postUrl),
        source: getString(payload.source) || getString(payload.platform) || "manual",
        color: getString(payload.color) || null,
        similarity,
        createdAt: eventTime(row),
      };
    })
    .filter((match): match is ProductMatch & { createdAt: string } => Boolean(match))
    .filter((match) => {
      if (!options.customerLocation) return true;
      if (match.sponsored) return true;
      return typeof match.distanceKm === "number" && match.distanceKm <= radiusKm;
    })
    .sort((a, b) => {
      if (a.sponsored !== b.sponsored) return a.sponsored ? -1 : 1;
      if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm;
      }
      return b.similarity - a.similarity || b.createdAt.localeCompare(a.createdAt);
    })
    .slice(0, maxResults)
    .map(({ createdAt: _createdAt, ...match }) => match);

  console.log("[Search] Event-store fallback matches:", matches.length);
  return matches;
}
