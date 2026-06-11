// Image-based product search for the customer flow.
//
// Division of responsibility (mirrors the text pipeline in search.ts):
//   - A vision model only IDENTIFIES the product in the photo (what it is,
//     color, brand, search keywords) and emits the same SearchIntent shape.
//   - PostgreSQL performs the ACTUAL matching via the existing searchProducts
//     pipeline. The model never searches the catalogue directly.

import OpenAI from "openai";

import { normalizeArabicText } from "./iraqi-arabic";
import { normalizeRawIntent, type RawIntent, type SearchIntent } from "./search";

function getWhatsAppAccessToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.META_WHATSAPP_ACCESS_TOKEN;
}

function getOpenAIApiKey() {
  return process.env.OPENAI_API_KEY;
}

function getOpenAIVisionModel() {
  // gpt-4.1-mini handles vision and stays fast enough for a waiting customer.
  return process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
}

function getAnthropicApiKey() {
  return process.env.ANTHROPIC_API_KEY;
}

function getAnthropicModel() {
  return process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";
}

// Vision calls are slower than text intent extraction, but the customer sent a
// photo and expects analysis — a slightly longer (still bounded) wait is fine.
const VISION_TIMEOUT_MS = 15_000;
const MEDIA_TIMEOUT_MS = 10_000;
// WhatsApp caps inbound images at 5MB; reject anything larger defensively.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface WhatsAppImage {
  base64: string;
  mimeType: string;
}

// Fetch the customer's photo from the WhatsApp Cloud API: media id → temporary
// CDN url → bytes. Both requests need the access token.
export async function downloadWhatsAppImage(mediaId: string): Promise<WhatsAppImage | null> {
  const accessToken = getWhatsAppAccessToken();
  if (!accessToken) {
    console.warn("[ImageSearch] Missing WhatsApp access token");
    return null;
  }

  try {
    const metaResponse = await fetch(`https://graph.facebook.com/v24.0/${mediaId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
    });
    if (!metaResponse.ok) {
      console.warn("[ImageSearch] Media lookup failed", metaResponse.status);
      return null;
    }

    const meta = (await metaResponse.json()) as {
      url?: string;
      mime_type?: string;
      file_size?: number;
    };
    if (!meta.url) return null;
    if (meta.file_size && meta.file_size > MAX_IMAGE_BYTES) {
      console.warn("[ImageSearch] Image too large", meta.file_size);
      return null;
    }

    const fileResponse = await fetch(meta.url, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
    });
    if (!fileResponse.ok) {
      console.warn("[ImageSearch] Media download failed", fileResponse.status);
      return null;
    }

    const bytes = await fileResponse.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;

    const mimeType = meta.mime_type?.split(";")[0].trim().toLowerCase() || "image/jpeg";
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      console.warn("[ImageSearch] Unsupported image mime type", mimeType);
      return null;
    }

    return { base64: Buffer.from(bytes).toString("base64"), mimeType };
  } catch (error) {
    console.error("[ImageSearch] Failed to download WhatsApp image", error);
    return null;
  }
}

// The model identifies WHAT the product is and produces the same corrected
// search terms + keyword expansions the text pipeline uses, so a photo and a
// typed description go through identical matching. The catalogue is mostly car
// accessories/parts (German, American, ...), so the prompt is tuned to
// recognize part type + car make/model — but still handles any product.
const VISION_INTENT_PROMPT = `أنت خبير بقطع غيار واكسسوارات السيارات (ألماني، أمريكي، كوري، ياباني) لسوق عراقي على واتساب.

انظر لصورة المنتج الي دزها الزبون وحدد شنو القطعة الظاهرة، ثم استخرج كلمات بحث نظيفة + مرادفات.
إذا الزبون كتب شرح وي الصورة، استخدمه حتى تحدد نوع السيارة والموديل والسنة بدقة أكبر.

رجّع JSON فقط بهذا الشكل:
{
  "search_terms": "نوع القطعة + ماركة/موديل السيارة إذا معروفة (بالعربي)",
  "keywords": ["مرادف1","مرادف2","التسمية بالإنجليزي","صيغة لهجة عراقية"],
  "category": "الفئة أو null",
  "brand": "ماركة السيارة أو القطعة إذا واضحة أو null",
  "color": "اللون الأساسي أو null",
  "max_price": رقم إذا ذكر الزبون سعر بالشرح أو null
}

قواعد مهمة:
- search_terms قصيرة ومركزة، أمثلة: "لايت أمامي مرسيدس"، "بمبر خلفي دوج تشارجر"، "مراية جانبية بي ام دبليو".
- ميّز القطعة بدقة: لايت أمامي/خلفي، سمارت لايت، بمبر، مراية، جاملغ، سبويلر، دعامية، جنط، إلخ.
- إذا شكل القطعة أو الشعار يدل على ماركة السيارة (مرسيدس، بي ام دبليو، أودي، فورد، دوج، شفروليه...) اذكرها.
- keywords: كل التسميات الي ممكن التاجر كتب بيها القطعة (عربي، إنجليزي، لهجة عراقية)، مثال للايت: ["لايت","ليت","فانوس","هيدلايت","headlight","ضوء امامي"].
- ركّز على القطعة الأساسية بالصورة وتجاهل الخلفية والأشخاص.
- إذا الصورة ما تبين منتج واضح (سيلفي، منظر، نص فقط، صورة غامضة) رجّع search_terms = "".`;

// Identify the product in the photo (caption = the customer's own words about
// it, e.g. "لايت جارجر 2017"). Order of preference matches the text pipeline:
// OpenAI first, Claude fallback, null when neither can tell.
export async function extractImageSearchIntent(
  image: WhatsAppImage,
  caption?: string,
): Promise<SearchIntent | null> {
  const captionText = caption?.trim()
    ? `شرح الزبون وي الصورة: ${normalizeArabicText(caption.trim())}`
    : "";

  if (getOpenAIApiKey()) {
    const viaOpenAI = await extractImageIntentWithOpenAI(image, captionText);
    if (viaOpenAI) return viaOpenAI;
  }

  if (getAnthropicApiKey()) {
    const viaClaude = await extractImageIntentWithClaude(image, captionText);
    if (viaClaude) return viaClaude;
  }

  return null;
}

function toIntent(raw: RawIntent): SearchIntent | null {
  const intent = normalizeRawIntent(raw, "");
  // An empty search_terms means the model saw no recognizable product —
  // normalizeRawIntent would otherwise fall back to the (empty) raw text.
  if (!normalizeArabicText(intent.searchTerms).trim()) return null;
  return intent;
}

async function extractImageIntentWithOpenAI(
  image: WhatsAppImage,
  captionText: string,
): Promise<SearchIntent | null> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) return null;

  try {
    const client = new OpenAI({ apiKey, timeout: VISION_TIMEOUT_MS, maxRetries: 0 });
    const response = await client.chat.completions.create({
      model: getOpenAIVisionModel(),
      max_tokens: 400,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: VISION_INTENT_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
            },
            ...(captionText ? [{ type: "text" as const, text: captionText }] : []),
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    return toIntent(JSON.parse(content) as RawIntent);
  } catch (error) {
    console.error("[ImageSearch] OpenAI vision extraction error", error);
    return null;
  }
}

async function extractImageIntentWithClaude(
  image: WhatsAppImage,
  captionText: string,
): Promise<SearchIntent | null> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: getAnthropicModel(),
        max_tokens: 400,
        temperature: 0,
        system: VISION_INTENT_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: image.mimeType,
                  data: image.base64,
                },
              },
              ...(captionText ? [{ type: "text", text: captionText }] : []),
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.warn("[ImageSearch] Claude vision extraction failed", response.status);
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

    return toIntent(JSON.parse(jsonMatch[0]) as RawIntent);
  } catch (error) {
    console.error("[ImageSearch] Claude vision extraction error", error);
    return null;
  }
}
