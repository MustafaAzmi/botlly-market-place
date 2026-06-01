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
    max_results: maxResults,
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
    };
  });

  // Apply the price filter from intent (DB returns by relevance only).
  if (intent.maxPrice) {
    matches = matches.filter((m) => m.price === 0 || m.price <= intent.maxPrice!);
  }

  return matches;
}
