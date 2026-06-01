import type { ConfidenceScore, ParsingMetadata } from "./types";

export interface GuardrailConfig {
  prevent_price_hallucination: boolean;
  prevent_availability_hallucination: boolean;
  prevent_merchant_hallucination: boolean;
  uncertain_threshold: number;
}

export function buildIraqiReplyPrompt(
  customerText: string,
  catalog: string,
  _metadata: ParsingMetadata,
): string {
  return `أنت مساعد بيع عراقي اسمك "زيد". كلامك عراقي طبيعي بغدادي فقط.
لازم:
- تكون مختصر جداً (سطر واحد أو اثنين فقط)
- ما تستخدم إيموجي أبداً
- ما تستخدم كلام رسمي أو تسويقي
- ترد على الزبون بطريقة طبيعية زي الشات العراقي
- تعتمد على الكتالوج الحقيقي فقط

إذا ما حصلت البضاعة، قول: "مو موجودة حاليا"
إذا ما فهمت شنو يدور، قول: "مو واضح شنو تقول، احتاج تفاصيل اكثر"

أمثلة ردود صحيحة:
- "موجودة، السعر 50 ألف"
- "نفذت حاليا"
- "شنو بالضبط تدور؟"
- "هذني الأنواع الموجودة..."
- "الحمد لله عندنا، بكام تخذها؟"

كتالوج المنتجات الحقيقي:
${catalog}

رسالة الزبون: "${customerText}"`;
}

export function applyGuardrails(
  reply: string,
  confidenceScore: ConfidenceScore,
  guardrails: GuardrailConfig,
): { reply: string; modified: boolean; reason?: string } {
  let modified = false;
  let finalReply = reply;
  let modificationReason: string | undefined;

  // Check confidence threshold
  if (confidenceScore.overall < guardrails.uncertain_threshold) {
    finalReply = "مو واضح شنو تقول، احتاج تفاصيل اكثر";
    modified = true;
    modificationReason = "Confidence below threshold";
  }

  // Check for hallucination patterns
  if (guardrails.prevent_price_hallucination) {
    // Red flags: very precise prices not in catalog, "من الآن", "سعر خاص"
    const hallucPricePatterns = [
      /سعر خاص|special price|exclusive/i,
      /يشمل شحن|includes shipping/i,
      /عرض محدود|limited offer/i,
      /اليوم فقط|today only/i,
    ];

    for (const pattern of hallucPricePatterns) {
      if (pattern.test(finalReply)) {
        finalReply = "أسعارنا موجودة بالكتالوج";
        modified = true;
        modificationReason = "Removed hallucinated pricing claim";
        break;
      }
    }
  }

  if (guardrails.prevent_availability_hallucination) {
    // Only say things that were explicitly in the input
    const hallucAvailPatterns = [
      /سيصل غدا|will arrive tomorrow/i,
      /سيتم التوصيل|will be delivered/i,
      /نوفر التوصيل|we provide delivery/i,
      /نضمن التوصيل الآمن|we guarantee safe delivery/i,
    ];

    for (const pattern of hallucAvailPatterns) {
      if (pattern.test(finalReply)) {
        finalReply = "احتاج تفاصيل اكثر عن الاستلام";
        modified = true;
        modificationReason = "Removed hallucinated availability claim";
        break;
      }
    }
  }

  if (guardrails.prevent_merchant_hallucination) {
    // Don't mention specific merchant details not in catalog
    const hallucMerchantPatterns = [
      /عندنا فرع في|we have a branch/i,
      /أوقات العمل|working hours/i,
      /العنوان|address/i,
      /إسم الدكان|shop name/i,
    ];

    for (const pattern of hallucMerchantPatterns) {
      if (pattern.test(finalReply)) {
        finalReply = "ارسل موقعك أو شنو تدور بالضبط";
        modified = true;
        modificationReason = "Removed hallucinated merchant claim";
        break;
      }
    }
  }

  // Remove any AI/technical references
  finalReply = finalReply
    .replace(/أنا نموذج AI|I'm an AI|I'm a bot/gi, "")
    .replace(/عذرا لكن|I apologize but/gi, "")
    .replace(/كمساعد|as an assistant/gi, "");

  // Ensure no emojis
  finalReply = finalReply.replace(/\p{Emoji}/gu, "");

  // Trim whitespace
  finalReply = finalReply.trim();

  // Ensure max length (WhatsApp limit)
  if (finalReply.length > 4096) {
    finalReply = finalReply.substring(0, 4090) + "...";
    modified = true;
    modificationReason = "Reply truncated to fit WhatsApp limit";
  }

  // Ensure reply isn't empty
  if (!finalReply) {
    finalReply = "شنو تدور بالضبط؟";
    modified = true;
    modificationReason = "Empty reply replaced with clarification question";
  }

  return {
    reply: finalReply,
    modified,
    reason: modificationReason,
  };
}

export function sanitizeReplyForWhatsApp(text: string): string {
  if (!text) return "";

  let sanitized = text;

  // Remove emojis
  sanitized = sanitized.replace(/\p{Emoji}/gu, "");

  // Remove markdown if any
  sanitized = sanitized
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/~~/, "");

  // Clean multiple spaces
  sanitized = sanitized.replace(/\s+/g, " ");

  // Trim
  sanitized = sanitized.trim();

  // WhatsApp max length
  if (sanitized.length > 4096) {
    sanitized = sanitized.substring(0, 4090) + "...";
  }

  return sanitized;
}

export function isUncertainReply(reply: string): boolean {
  const uncertainPatterns = [
    "مو واضح",
    "احتاج تفاصيل",
    "ما فهمت",
    "شنو بالضبط",
    "شنو تقول",
    "unclear",
    "need more details",
  ];

  const lowerReply = reply.toLowerCase();

  for (const pattern of uncertainPatterns) {
    if (lowerReply.includes(pattern.toLowerCase())) {
      return true;
    }
  }

  return false;
}

export function generateFallbackReply(
  extractedFields: Record<string, unknown>,
): string {
  let reply = "";

  if (extractedFields.price) {
    reply += `سعر هاي الحاجة ${extractedFields.price}`;
  }

  if (extractedFields.keywords && Array.isArray(extractedFields.keywords)) {
    if (reply) reply += "، ";
    reply += `دورت على ${(extractedFields.keywords as string[]).join(" أو ")}؟`;
  }

  if (!reply) {
    reply = "شنو تحتاج بالضبط؟";
  }

  return reply;
}
