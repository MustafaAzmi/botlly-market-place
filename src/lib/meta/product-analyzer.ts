// AI product analysis: convert a raw social post into a structured product.
//
// GPT is used here ONLY to understand and normalise messy Arabic/Iraqi captions
// into structured fields. It is never used to search. Every extraction carries a
// confidence_score; low-confidence results are flagged pending_review rather than
// blindly trusted. If GPT fails entirely, we fall back to regex extraction so the
// import pipeline never fully breaks.

import OpenAI from "openai";

import {
  normalizeArabicText,
  expandPriceShortcuts,
  extractArabicKeywords,
} from "@/lib/whatsapp/iraqi-arabic";
import {
  extractPriceRegex,
  extractColorAndSize,
  extractKeywordsRegex,
} from "@/lib/whatsapp/fallback-extraction";
import { detectSpam } from "@/lib/whatsapp/spam-detector";
import type { ExtractedProduct, RawSocialPost } from "./types";

function getOpenAIApiKey() {
  return process.env.OPENAI_API_KEY;
}

function getOpenAIModel() {
  return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
}

const ANALYSIS_SYSTEM_PROMPT = `أنت محلل منتجات ذكي لمنصة Botly. مهمتك تحويل منشور سوشيال ميديا عراقي إلى منتج منظم.
المنشورات تحتوي لهجة عراقية، إيموجي، أسعار ناقصة، كلام تسويقي، وكلمات عشوائية.
نظّف النص واستخرج الحقول. اذا معلومة مو موجودة خليها null.
رجّع JSON فقط بالشكل التالي بدون أي شرح:
{
  "title": string,
  "category": string|null,
  "brand": string|null,
  "price": number|null,
  "currency": string,
  "color": string|null,
  "condition": "new"|"used"|"refurbished"|"unknown",
  "keywords": string[],
  "availability": "in_stock"|"out_of_stock"|"unknown",
  "description": string,
  "confidence_score": number,
  "confidence_reason": string
}
confidence_score من 0 الى 1. قلله اذا: ماكو سعر، العنوان مو واضح، لغة مخلوطة، إيموجي كثير، كلام قصير.`;

interface RawAnalysis {
  title?: string;
  category?: string | null;
  brand?: string | null;
  price?: number | null;
  currency?: string;
  color?: string | null;
  condition?: string;
  keywords?: string[];
  availability?: string;
  description?: string;
  confidence_score?: number;
  confidence_reason?: string;
}

// Analyse a single post. Always returns a result — AI first, regex fallback
// second, never a hard failure.
export async function analyzePost(post: RawSocialPost): Promise<ExtractedProduct> {
  const caption = post.caption?.trim() ?? "";

  // Empty/spam captions skip AI entirely and go straight to a low-confidence shell.
  const spam = detectSpam(caption);
  if (!caption || (spam.isSpam && spam.score > 0.7)) {
    return fallbackExtract(post, caption ? "spam caption" : "empty caption");
  }

  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return fallbackExtract(post, "no AI key configured");
  }

  const normalized = expandPriceShortcuts(normalizeArabicText(caption));

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: getOpenAIModel(),
      max_tokens: 400,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: `المنشور:\n${normalized}` },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return fallbackExtract(post, "empty AI response");

    const raw = JSON.parse(content) as RawAnalysis;
    return normalizeAnalysis(raw, post, normalized);
  } catch (error) {
    console.error("[Product Analyzer] AI analysis failed, using fallback", post.postId, error);
    return fallbackExtract(post, "AI analysis error");
  }
}

// Clamp + sanity-check the AI output, and adjust confidence for missing fields.
function normalizeAnalysis(
  raw: RawAnalysis,
  post: RawSocialPost,
  normalizedCaption: string,
): ExtractedProduct {
  const title = (raw.title ?? "").trim() || normalizedCaption.slice(0, 80) || "منتج";
  const price =
    typeof raw.price === "number" && Number.isFinite(raw.price) && raw.price > 0 ? raw.price : null;

  let confidence =
    typeof raw.confidence_score === "number" ? Math.max(0, Math.min(1, raw.confidence_score)) : 0.5;

  const reasons: string[] = [];
  if (raw.confidence_reason) reasons.push(raw.confidence_reason);
  if (!price) {
    confidence -= 0.15;
    reasons.push("no price detected");
  }
  if (title.length < 5) {
    confidence -= 0.15;
    reasons.push("short/unclear title");
  }
  if (post.mediaUrls.length === 0) {
    confidence -= 0.1;
    reasons.push("no media");
  }
  confidence = Math.max(0, Math.min(1, confidence));

  const keywords =
    Array.isArray(raw.keywords) && raw.keywords.length > 0
      ? raw.keywords.map((k) => String(k)).slice(0, 12)
      : extractArabicKeywords(normalizedCaption);

  const condition = ["new", "used", "refurbished"].includes(String(raw.condition))
    ? (raw.condition as ExtractedProduct["condition"])
    : "unknown";

  const availability = ["in_stock", "out_of_stock"].includes(String(raw.availability))
    ? (raw.availability as ExtractedProduct["availability"])
    : "unknown";

  return {
    title,
    category: raw.category?.trim() || null,
    brand: raw.brand?.trim() || null,
    price,
    currency: (raw.currency ?? "IQD").trim() || "IQD",
    color: raw.color?.trim() || null,
    condition,
    keywords,
    availability,
    description: (raw.description ?? "").trim() || title,
    confidenceScore: confidence,
    confidenceReason: reasons.join("; ") || "AI extraction",
  };
}

// Pure regex/manual extraction used when AI is unavailable or fails. Produces
// partial-but-searchable data with low confidence so it can be reviewed later.
function fallbackExtract(post: RawSocialPost, reason: string): ExtractedProduct {
  const caption = post.caption?.trim() ?? "";
  const normalized = expandPriceShortcuts(normalizeArabicText(caption));
  const priceResult = extractPriceRegex(normalized);
  const attributes = extractColorAndSize(normalized);
  const keywords = extractKeywordsRegex(normalized);

  const title = normalized.split("\n")[0]?.slice(0, 80).trim() || "منتج";

  // Low base confidence: regex extraction is inherently less reliable than AI.
  let confidence = 0.2;
  if (priceResult.price) confidence += 0.1;
  if (keywords.length > 0) confidence += 0.1;
  confidence = Math.max(0, Math.min(0.5, confidence));

  return {
    title,
    category: null,
    brand: null,
    price: priceResult.price ?? null,
    currency: priceResult.currency ?? "IQD",
    color: attributes.color ?? null,
    condition: "unknown",
    keywords,
    availability: "unknown",
    description: normalized.slice(0, 200) || title,
    confidenceScore: confidence,
    confidenceReason: `fallback (${reason})`,
  };
}
