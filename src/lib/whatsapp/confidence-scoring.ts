import type {
  ConfidenceScore,
  RawMessageData,
  ParsedProduct,
  ParsingMetadata,
  ArabicAnalysis,
} from "./types";

export function scoreProductParsing(
  input: RawMessageData,
  parsed: ParsedProduct,
  metadata: ParsingMetadata,
): ConfidenceScore {
  const factors = {
    title_clarity: 1.0,
    price_clarity: parsed.price ? 1.0 : 0.5,
    image_quality: parsed.images.length > 0 ? 1.0 : 0.5,
    language_clarity: scoreLanguageClarity(input.text).score,
    category_certainty: parsed.category ? 0.9 : 0.5,
  };

  const reasons: string[] = [];

  // Title scoring
  if (parsed.title.length < 10) {
    factors.title_clarity -= 0.15;
    reasons.push("Title is short/unclear");
  }

  if (parsed.title.length > 100) {
    factors.title_clarity -= 0.1;
    reasons.push("Title is very long");
  }

  // Price scoring
  if (!parsed.price) {
    factors.price_clarity = 0.4;
    reasons.push("No price detected");
  } else if (parsed.price < 10 || parsed.price > 10000000) {
    factors.price_clarity -= 0.2;
    reasons.push("Price seems unusual");
  }

  // Image scoring
  if (parsed.images.length === 0) {
    factors.image_quality = 0.3;
    reasons.push("No images provided");
  } else if (parsed.images.length > 5) {
    factors.image_quality -= 0.2;
    reasons.push("Too many images (possible spam)");
  }

  // Category scoring
  if (!parsed.category) {
    factors.category_certainty = 0.4;
    reasons.push("Category not detected");
  }

  // Language scoring
  if (metadata?.language === "mixed") {
    factors.language_clarity -= 0.15;
    reasons.push("Mixed language detected");
  } else if (metadata?.language === "transliterated") {
    factors.language_clarity -= 0.2;
    reasons.push("Transliterated text (less clear)");
  }

  // Fallback penalty
  if (metadata?.fallback_used) {
    factors.title_clarity -= 0.1;
    factors.price_clarity -= 0.1;
    reasons.push("Fallback extraction used");
  }

  // Calculate overall score
  const overall =
    (factors.title_clarity +
      factors.price_clarity +
      factors.image_quality +
      factors.language_clarity +
      factors.category_certainty) /
    5;

  // Clamp to 0-1
  const clampedOverall = Math.max(0, Math.min(1, overall));

  // Add positive reason if score is good
  if (clampedOverall >= 0.8) {
    reasons.push("All key fields detected clearly");
  } else if (clampedOverall >= 0.6) {
    reasons.push("Most fields detected with reasonable confidence");
  }

  return {
    overall: clampedOverall,
    reasons: [...new Set(reasons)], // Remove duplicates
    factors: {
      title_clarity: Math.max(0, Math.min(1, factors.title_clarity)),
      price_clarity: Math.max(0, Math.min(1, factors.price_clarity)),
      image_quality: Math.max(0, Math.min(1, factors.image_quality)),
      language_clarity: Math.max(0, Math.min(1, factors.language_clarity)),
      category_certainty: Math.max(0, Math.min(1, factors.category_certainty)),
    },
  };
}

export function scoreLanguageClarity(text: string): {
  score: number;
  detected: string;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Check for Arabic script
  const arabicChars = (text.match(/[؀-ۿ]/g) || []).length;
  const englishChars = (text.match(/[a-z]/gi) || []).length;
  const totalChars = arabicChars + englishChars;

  if (totalChars === 0) {
    return { score: 0.3, detected: "unknown", reasons: ["No recognizable text"] };
  }

  const arabicRatio = arabicChars / totalChars;

  if (arabicRatio > 0.95) {
    reasons.push("Pure Arabic");
    return {
      score: 1.0,
      detected: "arabic",
      reasons,
    };
  }

  if (arabicRatio > 0.7) {
    reasons.push("Mostly Arabic");
    return {
      score: 0.85,
      detected: "arabic",
      reasons,
    };
  }

  if (arabicRatio > 0.3 && arabicRatio < 0.7) {
    reasons.push("Mixed Arabic and English");
    return {
      score: 0.6,
      detected: "mixed",
      reasons,
    };
  }

  reasons.push("Mostly English");
  return {
    score: 0.5,
    detected: "english",
    reasons,
  };
}

export function calculateConfidenceReason(
  score: ConfidenceScore,
): string {
  if (score.overall >= 0.85) {
    return "All critical fields detected with high clarity";
  }
  if (score.overall >= 0.75) {
    return "Most critical fields detected; some minor gaps";
  }
  if (score.overall >= 0.6) {
    return "Core information extracted but with some uncertainty";
  }
  if (score.overall >= 0.4) {
    return "Partial extraction; fallback methods used";
  }
  return "Low confidence; manual review recommended";
}
