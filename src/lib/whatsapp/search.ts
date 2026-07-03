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

function getAnthropicApiKey() {
  return process.env.ANTHROPIC_API_KEY;
}

function getAnthropicModel() {
  // Haiku: fast enough for a waiting WhatsApp customer, smart enough for
  // typo/dialect intent extraction. Opus was taking far longer per message.
  return process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";
}

export interface SearchIntent {
  searchTerms: string;
  category: string | null;
  brand: string | null;
  color: string | null;
  maxPrice: number | null;
  // AI-generated alternative search words: spelling corrections, synonyms,
  // singular/plural and dialect variants. These drive tolerant matching so the
  // customer doesn't have to spell the product exactly as the merchant did.
  keywords: string[];
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
  sponsored?: boolean;
  source?: string;
}

// The model is the BRAIN that understands the customer — not a string matcher.
// It corrects spelling mistakes, normalizes hamza/alef/yaa variations, expands
// Iraqi dialect, and produces synonyms so the customer never has to spell a
// product exactly the way the merchant typed it.
const INTENT_PROMPT = `أنت مساعد ذكي تفهم قصد الزبون من رسالته حتى لو فيها أخطاء إملائية أو أحرف ناقصة أو همزات غلط أو لهجة عراقية.

مهمتك: افهم شنو يريد الزبون، صحّح الأخطاء، واستخرج كلمات بحث نظيفة + مرادفات.

رجّع JSON فقط بهذا الشكل:
{
  "search_terms": "الكلمات الأساسية المصححة والنظيفة للبحث",
  "keywords": ["مرادف1","مرادف2","صيغة مفرد/جمع","تصحيح إملائي بديل"],
  "category": "الفئة أو null",
  "brand": "الماركة أو null",
  "color": "اللون أو null",
  "max_price": رقم أو null
}

قواعد مهمة:
- صحّح الأخطاء الإملائية (مثال: "بنطرون" → "بنطلون"، "جنز" → "جينز").
- وحّد الهمزات والألف (أزرق=ازرق=إزرق).
- keywords: ضع كل الصيغ المحتملة الي ممكن التاجر كتب فيها المنتج (مفرد، جمع، مرادفات، أسماء شائعة).
- مثال: لو الزبون كتب "نطلون جنز ازرق" → search_terms="بنطلون جينز ازرق"، keywords=["بنطلون","نطلون","جينز","جنز","ازرق","ازرك","ديم","jeans"].
- نظّف الإيموجي والكلام الزائد.`;

// Hard cap on AI latency: the customer is waiting on WhatsApp, so an
// understanding that takes longer than this is worse than a plain-text search.
const INTENT_TIMEOUT_MS = 6_000;

// AI-driven intent understanding. Order of preference:
//   1. OpenAI (gpt-4.1-mini) — fast (~1s) and excellent at typo/dialect fixes.
//   2. Claude — fallback when OpenAI is down or unconfigured.
//   3. Normalized raw text — last-resort fallback so search never fully breaks.
// Every provider call has a hard timeout so the customer never waits long.
export async function extractSearchIntent(customerText: string): Promise<SearchIntent> {
  const normalized = normalizeArabicText(customerText);
  const fallback: SearchIntent = {
    searchTerms: normalized,
    category: null,
    brand: null,
    color: null,
    maxPrice: null,
    keywords: [],
  };

  // 1. OpenAI first — the fast path.
  if (getOpenAIApiKey()) {
    const viaOpenAI = await extractIntentWithOpenAI(normalized);
    if (viaOpenAI) return viaOpenAI;
  }

  // 2. Claude fallback.
  if (getAnthropicApiKey()) {
    const viaClaude = await extractIntentWithClaude(customerText, normalized);
    if (viaClaude) return viaClaude;
  }

  // 3. Raw normalized text.
  return fallback;
}

export interface RawIntent {
  search_terms?: string;
  keywords?: string[];
  category?: string | null;
  brand?: string | null;
  color?: string | null;
  max_price?: number | null;
}

export function normalizeRawIntent(raw: RawIntent, normalized: string): SearchIntent {
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords
        .map((k) => (typeof k === "string" ? k.trim() : ""))
        .filter((k) => k.length >= 2)
    : [];
  return {
    searchTerms: (raw.search_terms ?? "").trim() || normalized,
    category: raw.category?.trim() || null,
    brand: raw.brand?.trim() || null,
    color: raw.color?.trim() || null,
    maxPrice: typeof raw.max_price === "number" && raw.max_price > 0 ? raw.max_price : null,
    keywords,
  };
}

// Fallback: Claude understands the customer (typos, hamza, dialect).
async function extractIntentWithClaude(
  customerText: string,
  normalized: string,
): Promise<SearchIntent | null> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(INTENT_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: getAnthropicModel(),
        max_tokens: 300,
        temperature: 0,
        system: INTENT_PROMPT,
        messages: [{ role: "user", content: customerText }],
      }),
    });

    if (!response.ok) {
      console.warn("[Search] Claude intent extraction failed", response.status);
      return null;
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((part) => part.type === "text")?.text;
    if (!text) return null;

    // Claude may wrap JSON in prose or code fences — extract the JSON object.
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const raw = JSON.parse(jsonMatch[0]) as RawIntent;
    return normalizeRawIntent(raw, normalized);
  } catch (error) {
    console.error("[Search] Claude intent extraction error", error);
    return null;
  }
}

// Primary: OpenAI extraction with JSON mode (fast, ~1s with gpt-4.1-mini).
async function extractIntentWithOpenAI(normalized: string): Promise<SearchIntent | null> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) return null;

  try {
    const client = new OpenAI({ apiKey, timeout: INTENT_TIMEOUT_MS, maxRetries: 0 });
    const response = await client.chat.completions.create({
      model: getOpenAIModel(),
      max_tokens: 300,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: INTENT_PROMPT },
        { role: "user", content: normalized },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const raw = JSON.parse(content) as RawIntent;
    return normalizeRawIntent(raw, normalized);
  } catch (error) {
    console.error("[Search] OpenAI intent extraction error", error);
    return null;
  }
}

export interface SearchOptions {
  limit?: number;
}

// ---------------------------------------------------------------------------
// Relevance gate
//
// A result must actually BE the product the customer asked for. Keyword
// expansion (colors, dialect variants, synonyms) improves RANKING but must
// never be sufficient for INCLUSION on its own — otherwise a blue watch
// matches "بنطلون جينز ازرق" just because both mention "ازرق".
// ---------------------------------------------------------------------------

// Tokens of the corrected core search terms — the product noun itself.
// Attribute values (color / brand / category) are stripped out so a shared
// attribute alone can never qualify an unrelated product.
function buildCoreTokens(intent: SearchIntent): string[] {
  const attributes = new Set(
    [intent.color, intent.brand, intent.category]
      .filter((v): v is string => Boolean(v))
      .flatMap((v) => normalizeArabicText(v).toLowerCase().split(/\s+/))
      .map((t) => t.trim())
      .filter((t) => t.length >= 2),
  );

  const tokens = Array.from(
    new Set(
      normalizeArabicText(intent.searchTerms)
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && !attributes.has(t)),
    ),
  );

  // The whole query was attributes (customer typed just a color/brand):
  // fall back to them so search still returns something sensible.
  return tokens.length > 0 ? tokens : [...attributes];
}

// One-character-deletion variants for typo/dialect tolerance: a product the
// merchant titled "جنز" still matches the corrected query word "جينز".
function fuzzyVariants(token: string): string[] {
  if (token.length < 4) return [token];
  const variants = [token];
  for (let i = 0; i < token.length; i += 1) {
    const v = token.slice(0, i) + token.slice(i + 1);
    if (v.length >= 3) variants.push(v);
  }
  return variants;
}

// How many core (product-noun) tokens the product text contains.
function countCoreHits(searchable: string, coreTokens: string[]): number {
  let hits = 0;
  for (const token of coreTokens) {
    if (fuzzyVariants(token).some((v) => searchable.includes(v))) hits += 1;
  }
  return hits;
}

// Same searchable-text shape the RPC indexes (botly_product_search_text).
function payloadSearchText(p: Record<string, unknown>): string {
  return normalizeArabicText(
    [
      getString(p.title),
      getString(p.description),
      getString(p.category),
      getString(p.brand),
      getString(p.color),
      getString(p.size),
      getString(p.searchText),
      Array.isArray(p.keywords) ? (p.keywords as unknown[]).filter((k) => typeof k === "string").join(" ") : getString(p.keywords),
    ]
      .filter(Boolean)
      .join(" "),
  ).toLowerCase();
}

interface MerchantInfo {
  storeName?: string;
  address?: string | null;
  whatsapp?: string | null;
  deliveryPhone?: string | null;
}

interface MerchantDirectory {
  map: Map<string, MerchantInfo>;
  hidden: Set<string>;
}

// Merchant contact details live on the `botly_merchant` event, NOT on the
// product. One fetch builds BOTH the enrichment map (store name / phone) and
// the hidden-merchant set, so search never reads the merchant log twice.
async function loadMerchantDirectory(): Promise<MerchantDirectory> {
  const map = new Map<string, MerchantInfo>();
  const hidden = new Set<string>();
  try {
    // listEvents returns newest-first, so the first row per merchantId wins.
    const rows = await listEvents("botly_merchant", 100);
    for (const row of rows) {
      const p = row.payload ?? {};
      const id = getString(p.merchantId) || row.id;
      if (!id || map.has(id)) continue;
      map.set(id, {
        storeName: getString(p.storeName) || getString(p.merchantName) || getString(p.name) || undefined,
        address: getString(p.address) || getString(p.merchantAddress) || null,
        whatsapp: getString(p.whatsapp) || getString(p.merchantWhatsapp) || getString(p.phone) || null,
        deliveryPhone: getString(p.deliveryPhone) || null,
      });
      if (
        (p.bannedFromBot === true || p.bannedFromBot === "true") ||
        p.visibilityEnabled === "false" ||
        p.isActive === "false" ||
        (p.suspendedAt && String(p.suspendedAt).trim() !== "") ||
        p.subscriptionStatus === "expired" ||
        (p.packageExpiry &&
          String(p.packageExpiry).trim() !== "" &&
          new Date(String(p.packageExpiry)) < new Date())
      ) {
        hidden.add(id);
      }
    }
  } catch (error) {
    console.error("[Search] Failed to load merchant directory", error);
  }
  return { map, hidden };
}

// Run the actual database search via the pg_trgm RPC. Falls back gracefully to
// direct database query if the RPC (migration) isn't deployed or returns nothing.
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

  // The product-noun tokens every result MUST contain (relevance gate).
  const coreTokens = buildCoreTokens(intent);

  // Kick off the merchant load in parallel with the search query — both the
  // RPC path and the fallback need it, and neither should wait for the other.
  const merchantsPromise = loadMerchantDirectory();

  // Try the RPC first (faster, with similarity scoring + merchant visibility filters).
  let matches = await tryRpcSearch(query, maxResults, merchantsPromise, coreTokens);

  // RPC failed or returned nothing: fall back to direct database search.
  // Ensures we still return products even if the RPC isn't deployed. The AI's
  // corrected keywords drive tolerant matching here.
  if (matches.length === 0) {
    matches = await fallbackDirectSearch(query, intent.keywords ?? [], maxResults, merchantsPromise, coreTokens);
  }

  // Apply price filter.
  if (intent.maxPrice) {
    matches = matches.filter((m) => m.price === 0 || m.price <= intent.maxPrice!);
  }

  // Search is open nationwide — most sales are delivery, so no geographic
  // filtering is applied. Results are ranked purely by match quality.
  return matches.slice(0, options?.limit || maxResults);
}

// Try the RPC search (fast, with similarity + filters).
async function tryRpcSearch(
  query: string,
  maxResults: number,
  merchantsPromise: Promise<MerchantDirectory>,
  coreTokens: string[],
): Promise<ProductMatch[]> {
  try {
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
      console.warn("[Search] RPC search_botly_products failed", error);
      return [];
    }

    const rows = (data ?? []) as Array<{
      id: string;
      payload: Record<string, unknown>;
      similarity: number;
    }>;

    const { map: merchants } = await merchantsPromise;

    // Relevance gate: trigram similarity on the long concatenated text can
    // fire on side-hits (shared color word, generic keyword). Only keep rows
    // whose text actually contains the product the customer asked for.
    const relevant = rows.filter((row) =>
      countCoreHits(payloadSearchText(row.payload ?? {}), coreTokens) > 0,
    );

    return relevant.map((row) => {
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
  } catch (error) {
    console.error("[Search] RPC search failed", error);
    return [];
  }
}

// Fallback: search products directly (no RPC, no similarity scoring, but reliable).
// Used when RPC fails or returns nothing. Ensures results even if migrations aren't
// deployed yet.
async function fallbackDirectSearch(
  query: string,
  aiKeywords: string[],
  maxResults: number,
  merchantsPromise: Promise<MerchantDirectory>,
  coreTokens: string[],
): Promise<ProductMatch[]> {
  try {
    // Products and merchants load in parallel (single merchant fetch shared
    // with the RPC path).
    const [rows, { map: merchants, hidden: hiddenMerchants }] = await Promise.all([
      listEvents("botly_product", 100),
      merchantsPromise,
    ]);

    const queryNormalized = normalizeArabicText(query).toLowerCase();
    // Token-based matching: a product matches if it shares ANY meaningful word
    // with the query. Full-phrase substring matching is far too strict for
    // natural-language queries ("نطلون جينز ازرق" would never match a product
    // titled "جينز ازرق رجالي"). Word matching + Arabic normalization fixes that.
    //
    // The match vocabulary = the query words PLUS the AI's corrected keywords
    // (synonyms / spelling fixes / dialect variants). This is what lets a
    // misspelled query still find the right product: the model already mapped
    // "جنز" → "جينز", so we match on the corrected form too.
    const queryTokens = Array.from(
      new Set(
        [
          ...queryNormalized.split(/\s+/),
          ...aiKeywords.map((k) => normalizeArabicText(k).toLowerCase()),
        ]
          .map((t) => t.trim())
          .filter((t) => t.length >= 2),
      ),
    );
    const matches: ProductMatch[] = [];
    const seen = new Set<string>();

    // Keep latest version of each product.
    const latestByProductId = new Map<
      string,
      { row: (typeof rows)[0]; productId: string; merchantId: string }
    >();
    for (const row of rows) {
      const p = row.payload ?? {};
      const productId = getString(p.productId) || String(row.id);
      if (latestByProductId.has(productId)) continue;
      latestByProductId.set(productId, {
        row,
        productId,
        merchantId: getString(p.merchantId),
      });
    }

    // Score each product by how many query words it contains, then sort by score.
    const scored: Array<{ match: ProductMatch; score: number }> = [];

    for (const { row, productId, merchantId } of latestByProductId.values()) {
      if (seen.has(productId)) continue;
      const p = row.payload ?? {};

      // Filter: status must be active.
      if (getString(p.status) !== "active") continue;

      // Filter: merchant must not be hidden.
      if (hiddenMerchants.has(merchantId)) continue;

      // Build + normalize the searchable text (same fields the RPC indexes).
      const searchable = payloadSearchText(p);

      // Relevance gate: the product text must contain the product noun the
      // customer asked for (fuzzy). Expansion keywords (colors, synonyms)
      // alone must NOT qualify a product — that's how a watch used to show
      // up for "بنطلون جينز" via a shared generic word.
      const coreHits = countCoreHits(searchable, coreTokens);
      if (coreHits === 0) continue;

      // Score: core (product-noun) hits dominate, expansion keywords refine
      // the ranking, exact-phrase hits go straight to the top.
      let score = coreHits * 3;
      for (const token of queryTokens) {
        if (searchable.includes(token)) score += 1;
      }
      if (queryNormalized.length >= 2 && searchable.includes(queryNormalized)) {
        score += queryTokens.length + coreTokens.length * 3; // boost exact-phrase hits to the top
      }

      seen.add(productId);
      const merchant = merchants.get(merchantId);
      scored.push({
        score,
        match: {
          id: productId,
          merchantId,
          title: getString(p.title) || getString(p.description) || "منتج",
          description: getString(p.description),
          price: getNumber(p.discountPrice) ?? getNumber(p.currentPrice) ?? 0,
          currency: getString(p.currency) || "IQD",
          imageUrl: getString(p.imageUrl),
          postUrl: getString(p.postUrl),
          color: getString(p.color) || null,
          similarity: 0.5,
          storeName: merchant?.storeName || "متجر",
          merchantAddress: merchant?.address ?? null,
          merchantWhatsapp: merchant?.whatsapp ?? null,
          deliveryPhone: merchant?.deliveryPhone ?? null,
          sponsored: Boolean((p as Record<string, unknown>).sponsored),
          source: getString(p.source) || "manual",
        },
      });
    }

    // Best matches (most query words) first, capped to the buffer size.
    scored.sort((a, b) => b.score - a.score);
    for (const { match } of scored) {
      matches.push(match);
      if (matches.length >= maxResults * 3) break;
    }

    return matches;
  } catch (error) {
    console.error("[Search] Fallback search failed", error);
    return [];
  }
}
