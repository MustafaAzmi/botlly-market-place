// Video → products pipeline (server side).
//
// The merchant records one video talking about several products. The browser
// extracts the audio as small 16kHz WAV chunks and sends them here:
//   1. transcribeVideoAudio  — Whisper speech-to-text, returns timed segments.
//   2. extractProductsFromTranscript — GPT turns the timed transcript into
//      structured product drafts (title/price/quantity/...) with the start
//      time of each product so the browser can grab matching video frames.
// Both steps reuse the existing OPENAI_API_KEY / OPENAI_MODEL configuration
// already used by src/lib/meta/product-analyzer.ts.

import { createServerFn } from "@tanstack/react-start";
import OpenAI, { toFile } from "openai";
import { z } from "zod";

import { getAuthorizedMerchant } from "@/lib/merchant.functions";

const MISSING_KEY_MESSAGE =
  "ميزة الفيديو غير مفعلة بعد: مفتاح OPENAI_API_KEY غير موجود في إعدادات الخادم.";

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(MISSING_KEY_MESSAGE);
  return new OpenAI({ apiKey });
}

function getOpenAIModel() {
  return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
}

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

// One WAV chunk is ≤ 60s of 16kHz mono 16-bit audio (~1.9MB raw, ~2.6MB as
// base64) — safely under serverless request body limits.
const transcribeInput = z.object({
  token: z.string().trim().min(20).max(300),
  audioBase64: z.string().min(100).max(6_000_000),
});

export const transcribeVideoAudio = createServerFn({ method: "POST" })
  .inputValidator((d) => transcribeInput.parse(d))
  .handler(async ({ data }) => {
    await getAuthorizedMerchant(data.token);
    const client = getOpenAIClient();

    let bytes: Buffer;
    try {
      bytes = Buffer.from(data.audioBase64, "base64");
    } catch {
      throw new Error("ملف الصوت غير صالح.");
    }

    try {
      const transcription = await client.audio.transcriptions.create({
        file: await toFile(bytes, "audio.wav", { type: "audio/wav" }),
        model: "whisper-1",
        language: "ar",
        response_format: "verbose_json",
      });

      const verbose = transcription as unknown as {
        text?: string;
        segments?: { start?: number; end?: number; text?: string }[];
      };

      const segments: TranscriptSegment[] = (verbose.segments ?? [])
        .map((segment) => ({
          start: typeof segment.start === "number" ? Math.max(0, segment.start) : 0,
          end: typeof segment.end === "number" ? Math.max(0, segment.end) : 0,
          text: (segment.text ?? "").trim(),
        }))
        .filter((segment) => segment.text.length > 0);

      return { text: (verbose.text ?? "").trim(), segments };
    } catch (error) {
      console.error("[Video Products] transcription failed", error);
      throw new Error("تعذر تفريغ الكلام من الفيديو. حاول مرة ثانية.");
    }
  });

export type VideoProductDraft = {
  title: string;
  description: string;
  price: number | null;
  currency: string;
  quantity: number | null;
  size: string | null;
  color: string | null;
  // Seconds into the video where the merchant starts talking about this
  // product — the browser captures candidate frames around this time.
  startTime: number;
  confidence: number;
};

const extractInput = z.object({
  token: z.string().trim().min(20).max(300),
  segments: z
    .array(
      z.object({
        start: z.number().min(0).max(86_400),
        end: z.number().min(0).max(86_400),
        text: z.string().max(2_000),
      }),
    )
    .min(1)
    .max(500),
});

const EXTRACTION_SYSTEM_PROMPT = `أنت محلل منتجات لمنصة Botly. تاجر سجّل فيديو واحد يعرض فيه عدة منتجات ويحجي عن كل منتج: اسمه، سعره، الكمية، اللون، القياس. الكلام غالباً باللهجة العراقية.
عندك النص المفرّغ من الفيديو مقسوم لمقاطع، وكل مقطع مكتوب قبله وقت بدايته ونهايته بالثواني بصيغة [بداية - نهاية].
مهمتك: استخرج كل المنتجات التي ذكرها التاجر.
قواعد:
- حوّل الأسعار المنطوقة لأرقام: "خمسة وعشرين ألف" تعني 25000، و"الف/ألف" تعني ×1000.
- العملة الافتراضية IQD إذا ما انذكرت عملة.
- startTime = وقت بداية أول مقطع يبدأ فيه الكلام عن هذا المنتج (رقم بالثواني من أوقات المقاطع).
- اكتب وصف مختصر مفيد لكل منتج من كلام التاجر نفسه.
- لا تخترع منتجات أو معلومات غير مذكورة. إذا معلومة ناقصة خليها null.
رجّع JSON فقط بدون أي شرح بالشكل التالي:
{"products":[{"title":string,"description":string,"price":number|null,"currency":string,"quantity":number|null,"size":string|null,"color":string|null,"startTime":number,"confidence":number}]}
confidence من 0 إلى 1: قلله إذا السعر مفقود أو الكلام غير واضح.`;

interface RawDraft {
  title?: string;
  description?: string;
  price?: number | null;
  currency?: string;
  quantity?: number | null;
  size?: string | null;
  color?: string | null;
  startTime?: number;
  confidence?: number;
}

export const extractProductsFromTranscript = createServerFn({ method: "POST" })
  .inputValidator((d) => extractInput.parse(d))
  .handler(async ({ data }) => {
    await getAuthorizedMerchant(data.token);
    const client = getOpenAIClient();

    const transcript = data.segments
      .map(
        (segment) =>
          `[${segment.start.toFixed(1)} - ${segment.end.toFixed(1)}] ${segment.text.trim()}`,
      )
      .join("\n")
      .slice(0, 24_000);

    let raw: { products?: RawDraft[] };
    try {
      const response = await client.chat.completions.create({
        model: getOpenAIModel(),
        max_tokens: 2_500,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: `النص المفرّغ من الفيديو:\n${transcript}` },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("empty response");
      raw = JSON.parse(content) as { products?: RawDraft[] };
    } catch (error) {
      console.error("[Video Products] extraction failed", error);
      throw new Error("تعذر استخراج المنتجات من الكلام. حاول مرة ثانية.");
    }

    const drafts: VideoProductDraft[] = (Array.isArray(raw.products) ? raw.products : [])
      .map((item) => {
        const title = (item.title ?? "").trim().slice(0, 140);
        const description = ((item.description ?? "").trim() || title).slice(0, 280);
        const price =
          typeof item.price === "number" && Number.isFinite(item.price) && item.price > 0
            ? item.price
            : null;
        const quantity =
          typeof item.quantity === "number" && Number.isInteger(item.quantity) && item.quantity >= 0
            ? item.quantity
            : null;
        const startTime =
          typeof item.startTime === "number" &&
          Number.isFinite(item.startTime) &&
          item.startTime >= 0
            ? item.startTime
            : 0;
        const confidence =
          typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : 0.5;

        return {
          title,
          description,
          price,
          currency: ((item.currency ?? "").trim() || "IQD").toUpperCase().slice(0, 8),
          quantity,
          size: (item.size ?? "")?.trim() || null,
          color: (item.color ?? "")?.trim() || null,
          startTime,
          confidence,
        };
      })
      .filter((draft) => draft.title.length > 0)
      .slice(0, 30);

    return drafts;
  });
