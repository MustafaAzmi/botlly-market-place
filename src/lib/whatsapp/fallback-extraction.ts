import type { FallbackExtractionResult } from "./types";
import { expandPriceShortcuts } from "./iraqi-arabic";

export async function fallbackExtraction(text: string): Promise<FallbackExtractionResult> {
  const extracted: Record<string, unknown> = {};
  const methods: string[] = [];
  let confidence = 0;

  // Try to extract price
  const priceResult = extractPriceRegex(text);
  if (priceResult.price !== undefined) {
    extracted.price = priceResult.price;
    extracted.currency = priceResult.currency || "IQD";
    methods.push("regex_price");
    confidence += 0.25;
  }

  // Try to extract phone
  const phone = extractPhoneRegex(text);
  if (phone) {
    extracted.phone = phone;
    methods.push("regex_phone");
    confidence += 0.15;
  }

  // Try to extract keywords
  const keywords = extractKeywordsRegex(text);
  if (keywords.length > 0) {
    extracted.keywords = keywords;
    methods.push("keyword_extraction");
    confidence += 0.2;
  }

  // Try to extract color/size
  const attributes = extractColorAndSize(text);
  if (attributes.color) {
    extracted.color = attributes.color;
    methods.push("attribute_extraction");
  }
  if (attributes.size) {
    extracted.size = attributes.size;
    methods.push("attribute_extraction");
  }

  if (attributes.color || attributes.size) {
    confidence += 0.15;
  }

  return {
    extracted,
    method: methods.join(", ") || "none",
    confidence: Math.min(1, confidence),
  };
}

export function extractPriceRegex(text: string): {
  price?: number;
  currency?: string;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Expand shortcuts like "25k" -> "25000"
  const expanded = expandPriceShortcuts(text);

  // Pattern: "دينار", "IQD", "ج.م", "ريال", "درهم", "دولار", "$"
  const currencyPatterns: Array<[RegExp, string]> = [
    [/دينار عراقي|د\.ع|IQD|عراقي/i, "IQD"],
    [/دينار|د\.ج|JOD/i, "JOD"],
    [/درهم|AED|د\.ا/i, "AED"],
    [/ريال|SAR|ر\.س/i, "SAR"],
    [/دولار|USD|us\$/i, "USD"],
    [/يورو|EUR|€/i, "EUR"],
  ];

  let currency: string | undefined;

  for (const [pattern, code] of currencyPatterns) {
    if (pattern.test(expanded)) {
      currency = code;
      break;
    }
  }

  // Look for number patterns
  // Pattern 1: "25000", "25,000", "25.000"
  const matches = expanded.matchAll(
    /(\d+(?:[.,]\d{3})*|\d+)\s*(?:دينار|عراقي|IQD|USD|دولار|درهم|AED|ريال|SAR|€|ج\.م|ريال|k|ك|م|م)?/gi,
  );

  let maxPrice: number | undefined;

  for (const match of matches) {
    const numStr = match[1].replace(/[.,]/g, "");
    const price = Number(numStr);

    if (price > 0 && price < 1000000000) {
      if (!maxPrice || price > maxPrice) {
        maxPrice = price;
        reasons.push(`Extracted price: ${price}`);
      }
    }
  }

  // Pattern 2: "السعر: 50000" or "السعر 50000"
  const labelPattern = /(?:السعر|price|الثمن|الكلفة)\s*:?\s*(\d+(?:[.,]\d{3})*)/gi;
  for (const match of expanded.matchAll(labelPattern)) {
    const numStr = match[1].replace(/[.,]/g, "");
    const price = Number(numStr);

    if (price > 0 && price < 1000000000) {
      maxPrice = price;
      reasons.push(`Extracted price from label: ${price}`);
    }
  }

  return {
    price: maxPrice,
    currency: currency || "IQD",
    reasons,
  };
}

export function extractPhoneRegex(text: string): string | null {
  // Iraqi phone patterns
  const patterns = [
    /(\+964|00964|964|0)?(?:\s)?([7][0-9]{9})/, // 07XX XXXXXX or +964 7XX XXXXXX
    /\+964\s*(?:7)[0-9]{9}/, // +964 7XX XXXXXX with space
    /00964\s*(?:7)[0-9]{9}/, // 00964 7XX XXXXXX
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Normalize to international format
      let phone = match[0];

      if (phone.startsWith("0")) {
        phone = "+964" + phone.slice(1);
      } else if (!phone.startsWith("+")) {
        phone = "+" + phone;
      }

      return phone;
    }
  }

  return null;
}

export function extractKeywordsRegex(text: string): string[] {
  // Remove URLs, emails, phone numbers
  let cleaned = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\S+@\S+/g, "")
    .replace(/\+?[0-9]{10,}/g, "");

  // Remove common stop words
  const stopWords = new Set([
    "في",
    "من",
    "على",
    "هذا",
    "هذه",
    "و",
    "أو",
    "إن",
    "كان",
    "هو",
    "هي",
    "ما",
    "لا",
    "the",
    "a",
    "an",
    "and",
    "or",
    "in",
    "on",
    "at",
  ]);

  // Split on whitespace and punctuation
  const words = cleaned
    .split(/[\s\p{P}]+/u)
    .filter(
      (w) =>
        w.length > 2 && // Min 3 chars
        !stopWords.has(w.toLowerCase()) &&
        !/^[0-9]+$/.test(w), // Not pure numbers
    );

  return [...new Set(words)].slice(0, 10); // Return top 10 unique
}

export function extractColorAndSize(text: string): {
  color?: string;
  size?: string;
} {
  const colors: Record<string, string> = {
    أحمر: "red",
    أسود: "black",
    أبيض: "white",
    أزرق: "blue",
    أخضر: "green",
    أصفر: "yellow",
    بنفسجي: "purple",
    برتقالي: "orange",
    رمادي: "gray",
    بني: "brown",
    وردي: "pink",
    red: "red",
    black: "black",
    white: "white",
    blue: "blue",
    green: "green",
    yellow: "yellow",
    purple: "purple",
    orange: "orange",
    gray: "gray",
    brown: "brown",
    pink: "pink",
  };

  const sizes: Record<string, string> = {
    "xs": "XS",
    "s": "S",
    "m": "M",
    "l": "L",
    "xl": "XL",
    "xxl": "XXL",
    "xxxl": "XXXL",
    "small": "S",
    "medium": "M",
    "large": "L",
    "extra large": "XL",
    "صغير": "S",
    "وسط": "M",
    "كبير": "L",
    "كبير جدا": "XL",
    "34": "34",
    "35": "35",
    "36": "36",
    "37": "37",
    "38": "38",
    "39": "39",
    "40": "40",
    "41": "41",
    "42": "42",
    "43": "43",
  };

  const lowerText = text.toLowerCase();
  let color: string | undefined;
  let size: string | undefined;

  for (const [key, value] of Object.entries(colors)) {
    if (lowerText.includes(key.toLowerCase())) {
      color = value;
      break;
    }
  }

  for (const [key, value] of Object.entries(sizes)) {
    if (lowerText.includes(key.toLowerCase())) {
      size = value;
      break;
    }
  }

  return { color, size };
}

export async function saveUnparseablePost(
  webhookEventId: string,
  rawText: string,
  extractedFields: Record<string, unknown>,
  reason: string,
): Promise<void> {
  // This will be called from the webhook handler
  // Implementation depends on Supabase integration
  console.log(
    `[Unparseable Post] ID: ${webhookEventId}, Reason: ${reason}`,
    extractedFields,
  );
}
