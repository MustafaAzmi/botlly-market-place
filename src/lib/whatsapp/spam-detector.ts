import type { SpamAnalysis } from "./types";

const SPAM_KEYWORDS = [
  "click here",
  "buy now",
  "limited time",
  "urgent",
  "act now",
  "كليك",
  "اشتري",
  "عرض محدود",
  "استعجل",
];

export function detectSpam(
  text: string,
  productTitle?: string,
  _metadata?: unknown,
): SpamAnalysis {
  const reasons: string[] = [];
  let score = 0;

  // Check for excessive capital letters
  const capitalLetters = (text.match(/[A-Z]/g) || []).length;
  const totalLetters = (text.match(/[A-Za-z]/g) || []).length;

  if (totalLetters > 0 && capitalLetters / totalLetters > 0.5) {
    score += 0.2;
    reasons.push("Excessive capital letters");
  }

  // Check for emoji-only or mostly emoji
  const emojiCount = (text.match(/\p{Emoji}/gu) || []).length;
  const textLength = text.length;

  if (emojiCount > textLength * 0.5) {
    score += 0.3;
    reasons.push("High emoji ratio");
  }

  // Check for repeated characters
  if (/([a-zA-Zأ-ي])\1{4,}/.test(text)) {
    score += 0.25;
    reasons.push("Repeated characters detected");
  }

  // Check for URLs/links
  const urlCount = (text.match(/https?:\/\/|www\./g) || []).length;
  if (urlCount > 1) {
    score += 0.15 * urlCount;
    reasons.push(`Multiple URLs (${urlCount})`);
  }

  // Check for spam keywords
  const lowerText = text.toLowerCase();
  for (const keyword of SPAM_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      score += 0.1;
      reasons.push(`Spam keyword: "${keyword}"`);
    }
  }

  // Check for very long text (might be catalog dump)
  if (text.length > 500) {
    score += 0.1;
    reasons.push("Very long message (possible catalog dump)");
  }

  // Check for excessive line breaks
  const lineBreaks = (text.match(/\n/g) || []).length;
  if (lineBreaks > 5) {
    score += 0.1;
    reasons.push(`Many line breaks (${lineBreaks})`);
  }

  return {
    isSpam: score >= 0.7,
    score: Math.min(1, score),
    reasons,
  };
}

const messageCache = new Map<string, { text: string; timestamp: number }>();

export async function isRepeatedMessage(
  fromNumber: string,
  text: string,
  withinSeconds: number = 3600,
): Promise<boolean> {
  const now = Date.now();
  const cacheKey = fromNumber;

  const cached = messageCache.get(cacheKey);

  if (cached) {
    const timeDiff = now - cached.timestamp;

    // If same message within time window, it's repeated
    if (timeDiff < withinSeconds * 1000 && cached.text === text) {
      return true;
    }

    // Clean up old cache entries
    if (timeDiff > withinSeconds * 1000) {
      messageCache.delete(cacheKey);
    }
  }

  // Store current message
  messageCache.set(cacheKey, { text, timestamp: now });

  // Periodically clean up old entries
  if (messageCache.size > 10000) {
    for (const [key, value] of messageCache.entries()) {
      if (now - value.timestamp > withinSeconds * 2000) {
        messageCache.delete(key);
      }
    }
  }

  return false;
}
