import type { ValidationError, ParsedProduct } from "./types";

const VALID_CATEGORIES = [
  "electronics",
  "phones",
  "clothing",
  "furniture",
  "shoes",
  "jewelry",
  "beauty",
  "food",
  "tools",
  "sports",
  "books",
  "toys",
  "home",
  "car",
  "other",
];

const CURRENCY_CODES = ["IQD", "USD"];

export function validateProductTitle(title: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!title || title.trim().length === 0) {
    errors.push({
      field: "title",
      reason: "Title is empty",
      severity: "error",
    });
    return errors;
  }

  if (title.length < 3) {
    errors.push({
      field: "title",
      reason: "Title too short (min 3 chars)",
      severity: "error",
    });
  }

  if (title.length > 200) {
    errors.push({
      field: "title",
      reason: "Title too long (max 200 chars)",
      severity: "error",
    });
  }

  // Check for emoji-only titles
  const emojiOnly = /^(\p{Emoji}|\s)+$/u.test(title);
  if (emojiOnly) {
    errors.push({
      field: "title",
      reason: "Title is emoji-only",
      severity: "error",
    });
  }

  // Count emojis
  const emojiCount = (title.match(/\p{Emoji}/gu) || []).length;
  if (emojiCount > 3) {
    errors.push({
      field: "title",
      reason: `Excessive emojis (${emojiCount})`,
      severity: "warning",
    });
  }

  return errors;
}

export function validatePrice(
  price: number | undefined,
  currency?: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (price === undefined || price === null) {
    return errors; // Price is optional
  }

  if (typeof price !== "number" || isNaN(price)) {
    errors.push({
      field: "price",
      reason: "Price is not a valid number",
      severity: "error",
    });
    return errors;
  }

  if (price < 0) {
    errors.push({
      field: "price",
      reason: "Price cannot be negative",
      severity: "error",
    });
  }

  if (price > 999999999) {
    errors.push({
      field: "price",
      reason: "Price exceeds maximum allowed value",
      severity: "error",
    });
  }

  if (currency && !CURRENCY_CODES.includes(currency.toUpperCase())) {
    errors.push({
      field: "currency",
      reason: `Unknown currency code: ${currency}`,
      severity: "warning",
    });
  }

  return errors;
}

export function validateImages(imageUrls: string[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!imageUrls || imageUrls.length === 0) {
    errors.push({
      field: "images",
      reason: "No images provided",
      severity: "warning",
    });
    return errors;
  }

  if (imageUrls.length > 5) {
    errors.push({
      field: "images",
      reason: `Too many images (${imageUrls.length}), may be spam`,
      severity: "warning",
    });
  }

  for (const url of imageUrls) {
    try {
      new URL(url);
    } catch {
      errors.push({
        field: "images",
        reason: `Invalid image URL: ${url}`,
        severity: "warning",
      });
    }
  }

  return errors;
}

export function validateCategory(category: string | undefined): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!category) {
    errors.push({
      field: "category",
      reason: "Category is missing",
      severity: "warning",
    });
    return errors;
  }

  const categoryLower = category.toLowerCase();
  if (!VALID_CATEGORIES.includes(categoryLower)) {
    errors.push({
      field: "category",
      reason: `Unknown category: ${category}`,
      severity: "warning",
    });
  }

  return errors;
}

export function validateForDuplicates(
  current: ParsedProduct,
  recent: ParsedProduct[],
): { isDuplicate: boolean; matchId?: string; similarity: number } {
  if (recent.length === 0) {
    return { isDuplicate: false, similarity: 0 };
  }

  for (const prev of recent) {
    const similarity = calculateSimilarity(current.title, prev.title);
    const priceSimilar =
      current.price &&
      prev.price &&
      Math.abs(current.price - prev.price) / Math.max(current.price, prev.price) < 0.05;

    if (similarity > 0.85 && priceSimilar) {
      return { isDuplicate: true, similarity };
    }
  }

  return { isDuplicate: false, similarity: 0 };
}

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 1;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function getEditDistance(s1: string, s2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[s2.length][s1.length];
}

export function validateProduct(product: Partial<ParsedProduct>): ValidationError[] {
  const allErrors: ValidationError[] = [];

  allErrors.push(...validateProductTitle(product.title || ""));
  allErrors.push(...validatePrice(product.price, product.currency));
  allErrors.push(...validateImages(product.images || []));
  allErrors.push(...validateCategory(product.category));

  return allErrors;
}

export function getValidationSummary(errors: ValidationError[]): {
  hasErrors: boolean;
  errorCount: number;
  warningCount: number;
} {
  const errorCount = errors.filter((e) => e.severity === "error").length;
  const warningCount = errors.filter((e) => e.severity === "warning").length;

  return {
    hasErrors: errorCount > 0,
    errorCount,
    warningCount,
  };
}
