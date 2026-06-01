import type { ArabicAnalysis } from "./types";

export const IRAQI_SLANG_MAP: Record<string, string> = {
  عامية: "iraqi",
  كاعد: "is/sitting",
  موسم: "season",
  چيرة: "how",
  إدا: "if",
  نص: "half",
  ربع: "quarter",
  درزن: "12",
  كرتة: "24",
  كفالة: "warranty",
  فويق: "above",
  تحت: "below",
  زين: "good",
  حديه: "this",
  گلبي: "my heart",
  شنو: "what",
  شلون: "how",
  يدور: "search",
  يلاقي: "find",
  گول: "say",
  بغداد: "baghdad",
  كويت: "kuwait",
  موجود: "available",
  نفذ: "out of stock",
  ياخد: "takes",
  يكسر: "breaks",
  يطول: "takes long",
  بسرعة: "quickly",
  حالا: "now",
  بعدين: "later",
};

export const IRAQI_PRICE_SHORTCUTS: Record<string, number> = {
  k: 1000,
  ك: 1000,
  m: 1000000,
  م: 1000000,
};

export const IRAQI_PRICE_MULTIPLIERS: Record<string, number> = {
  نص: 0.5,
  ربع: 0.25,
  درزن: 12,
  كرتة: 24,
  زوج: 2,
  ثنين: 2,
};

const IRAQI_MARKERS = [
  "شنو",
  "شلون",
  "كاعد",
  "موسم",
  "نص",
  "درزن",
  "كفالة",
  "زين",
  "حديه",
  "گول",
  "يدور",
  "يلاقي",
  "يخت",
  "بغداد",
  "كويت",
  "موجود",
  "نفذ",
];

export function detectIraqiDialect(text: string): ArabicAnalysis {
  if (!text) {
    return {
      dialect: "formal_arabic",
      confidence: 0,
      hasSlang: false,
      hasDialectWords: false,
      slangTerms: [],
    };
  }

  const lowerText = text.toLowerCase();
  const foundSlang: string[] = [];

  let iraqiMarkerCount = 0;
  for (const marker of IRAQI_MARKERS) {
    if (lowerText.includes(marker)) {
      iraqiMarkerCount++;
      foundSlang.push(marker);
    }
  }

  const hasEnglish = /[a-z]/i.test(text);
  const arabicCharCount = (text.match(/[؀-ۿ]/g) || []).length;
  const englishCharCount = (text.match(/[a-z]/gi) || []).length;

  let dialect: "formal_arabic" | "iraqi" | "mixed" | "transliterated";
  let confidence: number;

  if (iraqiMarkerCount >= 2) {
    dialect = "iraqi";
    confidence = Math.min(0.95, 0.5 + iraqiMarkerCount * 0.15);
  } else if (iraqiMarkerCount === 1) {
    dialect = "iraqi";
    confidence = 0.6;
  } else if (hasEnglish && arabicCharCount > 10) {
    dialect = "mixed";
    confidence = 0.7;
  } else if (englishCharCount > arabicCharCount && arabicCharCount === 0) {
    dialect = "transliterated";
    confidence = 0.4;
  } else {
    dialect = "formal_arabic";
    confidence = 0.5;
  }

  return {
    dialect,
    confidence,
    hasSlang: foundSlang.length > 0,
    hasDialectWords: iraqiMarkerCount > 0,
    slangTerms: foundSlang,
  };
}

export function normalizeArabicText(text: string): string {
  if (!text) return "";

  let normalized = text;

  // Remove diacritics
  normalized = normalized.replace(/[ً-ْ]/g, "");

  // Normalize alef variants
  normalized = normalized.replace(/أ|إ/g, "ا");

  // Normalize yaa variants
  normalized = normalized.replace(/ى/g, "ي");

  // Remove zero-width characters
  normalized = normalized.replace(/[​-‍﻿]/g, "");

  // Trim whitespace
  normalized = normalized.trim();

  return normalized;
}

export function expandPriceShortcuts(text: string): string {
  let expanded = text;

  // Handle number + shortcut (e.g., "25k" -> "25000")
  expanded = expanded.replace(/(\d+)\s*k/gi, (match, num) => {
    return String(Number(num) * IRAQI_PRICE_SHORTCUTS.k);
  });

  expanded = expanded.replace(/(\d+)\s*م/gi, (match, num) => {
    return String(Number(num) * IRAQI_PRICE_SHORTCUTS.م);
  });

  // Handle multipliers
  for (const [key, multiplier] of Object.entries(IRAQI_PRICE_MULTIPLIERS)) {
    if (multiplier < 1) {
      // For fractions, handle as "نص السعر" -> "50%"
      expanded = expanded.replace(
        new RegExp(`\\b${key}\\s+`, "g"),
        `${multiplier * 100}% `,
      );
    } else {
      // For amounts like "درزن" -> "12"
      expanded = expanded.replace(new RegExp(`\\b${key}\\b`, "g"), String(multiplier));
    }
  }

  return expanded;
}

export function extractArabicKeywords(text: string): string[] {
  const normalized = normalizeArabicText(text);

  // Common stop words to exclude
  const stopWords = new Set([
    "في",
    "من",
    "على",
    "هذا",
    "هذه",
    "ذات",
    "و",
    "أو",
    "إن",
    "كان",
    "هو",
    "هي",
    "ما",
    "لا",
    "إذا",
    "أي",
    "كل",
    "بعض",
  ]);

  // Split on space and punctuation, filter empty
  const words = normalized
    .split(/[\s\p{P}]+/u)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  return [...new Set(words)];
}
