import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Clapperboard, Film, Loader2, Trash2, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrencies } from "@/lib/currenciesStore";
import { createMerchantProduct } from "@/lib/merchant.functions";
import { readMerchantSession } from "@/lib/merchantSession";
import {
  extractProductsFromTranscript,
  transcribeVideoAudio,
  type TranscriptSegment,
  type VideoProductDraft,
} from "@/lib/video-products.functions";

export const Route = createFileRoute("/dashboard/products/from-video")({
  head: () => ({ meta: [{ title: "Products from video - Botly" }] }),
  component: ProductsFromVideoPage,
});

// Whisper works best on 16kHz mono audio; chunking keeps each request small
// enough for serverless body limits (60s ≈ 1.9MB WAV ≈ 2.6MB base64).
const TARGET_SAMPLE_RATE = 16_000;
const CHUNK_SECONDS = 60;
const MAX_VIDEO_SECONDS = 300;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

type Step = "pick" | "processing" | "review";

type DraftProduct = {
  key: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  quantity: string;
  size: string;
  color: string;
  // Candidate frames captured from the video around the moment the merchant
  // talked about this product — the merchant picks the best one.
  frames: string[];
  selectedFrame: number;
  startTime: number;
  confidence: number;
};

// ---------------------------------------------------------------------------
// Audio helpers: decode the video's audio track, downmix/resample to 16kHz
// mono, then encode 16-bit PCM WAV chunks as base64 for the server.
// ---------------------------------------------------------------------------

async function decodeVideoAudio(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error("المتصفح لا يدعم معالجة الصوت");
  const ctx = new AudioContextCtor();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error("تعذر استخراج الصوت من الفيديو. جرّب فيديو بصيغة أخرى (MP4).");
  } finally {
    void ctx.close();
  }
}

async function toMono16k(buffer: AudioBuffer): Promise<Float32Array> {
  const length = Math.max(1, Math.ceil(buffer.duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function encodeWavBase64(samples: Float32Array): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Frame helpers: seek a detached <video> element and snapshot frames to small
// JPEG data URLs (same sizing/quality as the manual photo upload flow).
// ---------------------------------------------------------------------------

function loadVideoElement(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error("تعذر فتح الفيديو"));
    video.src = url;
  });
}

function drawVideoFrame(video: HTMLVideoElement): string {
  const maxDim = 1000;
  const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذر معالجة الفيديو");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

function captureFrameAt(video: HTMLVideoElement, time: number): Promise<string> {
  const target = Math.min(Math.max(time, 0), Math.max(0, video.duration - 0.1));
  // Seeking to the current position never fires "seeked" — snapshot directly.
  if (Math.abs(video.currentTime - target) < 0.05 && video.readyState >= 2) {
    return Promise.resolve(drawVideoFrame(video));
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      reject(new Error("انتهت مهلة قراءة الفيديو"));
    }, 10_000);
    const onSeeked = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      try {
        resolve(drawVideoFrame(video));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("تعذر معالجة الفيديو"));
      }
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = target;
  });
}

function ProductsFromVideoPage() {
  const navigate = useNavigate();
  const createMerchantProductFn = useServerFn(createMerchantProduct);
  const transcribeFn = useServerFn(transcribeVideoAudio);
  const extractFn = useServerFn(extractProductsFromTranscript);
  const currencies = useCurrencies().filter((c) => c.active);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("pick");
  const [progress, setProgress] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [drafts, setDrafts] = useState<DraftProduct[]>([]);
  const [saving, setSaving] = useState(false);

  // Revoke the object URL when leaving the page so the video memory is freed.
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const fallbackCurrency = currencies[0]?.code ?? "IQD";

  const toDraft = (product: VideoProductDraft, frames: string[]): DraftProduct => ({
    key: crypto.randomUUID(),
    title: product.title,
    description: product.description,
    price: product.price !== null ? String(product.price) : "",
    currency: currencies.some((c) => c.code === product.currency)
      ? product.currency
      : fallbackCurrency,
    quantity: product.quantity !== null ? String(product.quantity) : "",
    size: product.size ?? "",
    color: product.color ?? "",
    frames,
    selectedFrame: 0,
    startTime: product.startTime,
    confidence: product.confidence,
  });

  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const merchantSession = readMerchantSession();
    if (!merchantSession?.token) {
      navigate({ to: "/auth" });
      return;
    }
    const token = merchantSession.token;

    if (!file.type.startsWith("video/")) {
      toast.error("اختر ملف فيديو فقط");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error("حجم الفيديو يجب أن لا يزيد على 200MB");
      return;
    }

    setStep("processing");
    setProgress("جاري قراءة الفيديو...");
    const url = URL.createObjectURL(file);

    try {
      const video = await loadVideoElement(url);
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        throw new Error("تعذر قراءة مدة الفيديو");
      }
      if (video.duration > MAX_VIDEO_SECONDS) {
        throw new Error("مدة الفيديو يجب أن لا تزيد على 5 دقائق");
      }

      setProgress("جاري استخراج الصوت من الفيديو...");
      const decoded = await decodeVideoAudio(file);
      const samples = await toMono16k(decoded);

      const chunkSamples = TARGET_SAMPLE_RATE * CHUNK_SECONDS;
      const chunkCount = Math.ceil(samples.length / chunkSamples);
      const segments: TranscriptSegment[] = [];
      for (let i = 0; i < chunkCount; i += 1) {
        setProgress(`جاري تفريغ الكلام (${i + 1} من ${chunkCount})...`);
        const slice = samples.subarray(i * chunkSamples, (i + 1) * chunkSamples);
        const audioBase64 = encodeWavBase64(slice);
        const result = await transcribeFn({ data: { token, audioBase64 } });
        const offsetSeconds = i * CHUNK_SECONDS;
        for (const segment of result.segments) {
          segments.push({
            start: segment.start + offsetSeconds,
            end: segment.end + offsetSeconds,
            text: segment.text,
          });
        }
      }

      if (segments.length === 0) {
        throw new Error("لم يتم العثور على كلام واضح في الفيديو. تأكد من وضوح الصوت.");
      }

      setProgress("جاري استخراج المنتجات من الكلام...");
      const extracted = await extractFn({ data: { token, segments } });
      if (extracted.length === 0) {
        throw new Error(
          "لم يتم التعرف على منتجات في الفيديو. اذكر اسم وسعر كل منتج بوضوح وحاول مرة ثانية.",
        );
      }

      setProgress("جاري التقاط صور المنتجات من الفيديو...");
      const nextDrafts: DraftProduct[] = [];
      for (const product of extracted) {
        // Three candidates shortly after the merchant starts talking about the
        // product — usually when it's being held up to the camera.
        const times = [product.startTime + 0.5, product.startTime + 2.5, product.startTime + 4.5];
        const frames: string[] = [];
        for (const time of times) {
          try {
            const frame = await captureFrameAt(video, time);
            if (!frames.includes(frame)) frames.push(frame);
          } catch {
            // Skip frames that fail to capture; the merchant can still save
            // the product as long as at least one frame succeeded.
          }
        }
        nextDrafts.push(toDraft(product, frames));
      }

      setVideoUrl(url);
      setDrafts(nextDrafts);
      setStep("review");
    } catch (error) {
      URL.revokeObjectURL(url);
      toast.error(error instanceof Error ? error.message : "تعذرت معالجة الفيديو");
      setStep("pick");
    }
  };

  const updateDraft = (key: string, patch: Partial<DraftProduct>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const removeDraft = (key: string) => {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  };

  const saveAll = async () => {
    const merchantSession = readMerchantSession();
    if (!merchantSession?.token) {
      navigate({ to: "/auth" });
      return;
    }

    for (let i = 0; i < drafts.length; i += 1) {
      const draft = drafts[i];
      const price = Number(draft.price);
      if (!draft.title.trim() || !draft.description.trim()) {
        toast.error(`المنتج ${i + 1}: اسم المنتج والوصف مطلوبان`);
        return;
      }
      if (!draft.price.trim() || !Number.isFinite(price) || price < 0) {
        toast.error(`المنتج ${i + 1} (${draft.title}): السعر غير صحيح`);
        return;
      }
      if (draft.quantity.trim() && !Number.isInteger(Number(draft.quantity))) {
        toast.error(`المنتج ${i + 1} (${draft.title}): الكمية يجب أن تكون رقم صحيح`);
        return;
      }
      if (!draft.frames[draft.selectedFrame]) {
        toast.error(`المنتج ${i + 1} (${draft.title}): اختر صورة للمنتج`);
        return;
      }
    }

    setSaving(true);
    let savedCount = 0;
    try {
      for (const draft of drafts) {
        await createMerchantProductFn({
          data: {
            token: merchantSession.token,
            title: draft.title.trim(),
            description: draft.description.trim(),
            imageUrl: draft.frames[draft.selectedFrame],
            currentPrice: Number(draft.price),
            currency: draft.currency,
            size: draft.size.trim(),
            color: draft.color.trim(),
            quantity: draft.quantity.trim() ? Number(draft.quantity) : undefined,
          },
        });
        savedCount += 1;
      }
      toast.success(`تم حفظ ${savedCount} منتج بنجاح`);
      navigate({ to: "/dashboard/products" });
    } catch (error) {
      // Drop the drafts that were already saved so a retry doesn't duplicate them.
      setDrafts((prev) => prev.slice(savedCount));
      toast.error(
        `تم حفظ ${savedCount} من ${drafts.length}. ${
          error instanceof Error ? error.message : "تعذر حفظ باقي المنتجات"
        }`,
      );
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      title="إضافة منتجات بالفيديو"
      subtitle="سجّل فيديو واحد تعرض فيه منتجاتك وتحجي عن كل منتج، والبوت يستخرج المنتجات تلقائياً."
    >
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link to="/dashboard/products">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            المنتجات
          </Link>
        </Button>
      </div>

      {step === "pick" && (
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <h3 className="font-semibold">طريقة التسجيل الصحيحة</h3>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-muted-foreground">
              <li>صوّر كل منتج وانت تحجي عنه حتى تنلتقط صورته من الفيديو.</li>
              <li>اذكر بوضوح: اسم المنتج، سعره، الكمية المتوفرة، واللون أو القياس إن وجد.</li>
              <li>مثال: "هذا تيشيرت قطن أسود، سعره خمسة وعشرين ألف، عندي منه عشرة".</li>
              <li>الحد الأقصى لمدة الفيديو: 5 دقائق.</li>
              <li>بعد المعالجة راح تراجع المنتجات وتعدلها قبل الحفظ.</li>
            </ul>
          </div>

          {/* Hidden inputs: capture="environment" opens the camera to record a
              new video; the plain one opens the gallery / file picker. */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="video/*"
            capture="environment"
            onChange={handleVideoFileChange}
            className="hidden"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="video/*"
            onChange={handleVideoFileChange}
            className="hidden"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              size="lg"
              className="h-14 gap-2 shadow-soft"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Video className="h-5 w-5" />
              سجّل فيديو بالكاميرا
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="h-14 gap-2"
              onClick={() => galleryInputRef.current?.click()}
            >
              <Film className="h-5 w-5" />
              اختر فيديو من الاستديو
            </Button>
          </div>
        </div>
      )}

      {step === "processing" && (
        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-10 text-center shadow-soft">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
            <Clapperboard className="h-7 w-7" />
          </div>
          <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-primary" />
          <p className="mt-4 font-medium">{progress}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            لا تغلق الصفحة — المعالجة قد تأخذ دقيقة حسب طول الفيديو.
          </p>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">تم استخراج {drafts.length} منتج من الفيديو</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  راجع كل منتج، عدّل المعلومات، واختر أفضل صورة قبل الحفظ.
                </p>
              </div>
              {videoUrl && (
                <video
                  src={videoUrl}
                  controls
                  playsInline
                  className="h-28 rounded-lg border border-border bg-secondary"
                />
              )}
            </div>
          </div>

          {drafts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
              لا توجد منتجات للمراجعة. ارجع وسجّل فيديو جديد.
            </div>
          ) : (
            drafts.map((draft, index) => (
              <DraftCard
                key={draft.key}
                draft={draft}
                index={index}
                currencies={currencies}
                onChange={(patch) => updateDraft(draft.key, patch)}
                onRemove={() => removeDraft(draft.key)}
              />
            ))
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="lg"
              className="gap-2 shadow-soft"
              disabled={saving || drafts.length === 0}
              onClick={saveAll}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                `حفظ ${drafts.length} منتج`
              )}
            </Button>
            <Button asChild type="button" size="lg" variant="outline" disabled={saving}>
              <Link to="/dashboard/products">إلغاء</Link>
            </Button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function DraftCard({
  draft,
  index,
  currencies,
  onChange,
  onRemove,
}: {
  draft: DraftProduct;
  index: number;
  currencies: { code: string; label: string }[];
  onChange: (patch: Partial<DraftProduct>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-semibold">
          المنتج {index + 1}
          {draft.confidence < 0.5 && (
            <span className="ms-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              يحتاج مراجعة دقيقة
            </span>
          )}
        </h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1 text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
          حذف
        </Button>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div>
          <Label className="text-sm font-medium">اختر أفضل صورة من الفيديو</Label>
          {draft.frames.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              تعذر التقاط صور لهذا المنتج من الفيديو.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {draft.frames.map((frame, frameIndex) => (
                <button
                  key={frameIndex}
                  type="button"
                  onClick={() => onChange({ selectedFrame: frameIndex })}
                  className={`overflow-hidden rounded-lg border-2 transition-all ${
                    draft.selectedFrame === frameIndex
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border opacity-70 hover:opacity-100"
                  }`}
                >
                  <img
                    src={frame}
                    alt={`خيار صورة ${frameIndex + 1}`}
                    className="aspect-square w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
          {draft.frames[draft.selectedFrame] && (
            <div className="mt-3 overflow-hidden rounded-lg border border-border">
              <img
                src={draft.frames[draft.selectedFrame]}
                alt="الصورة المختارة"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">اسم المنتج</Label>
              <Input
                value={draft.title}
                onChange={(e) => onChange({ title: e.target.value })}
                maxLength={140}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">الكمية (اختياري)</Label>
              <Input
                value={draft.quantity}
                onChange={(e) => onChange({ quantity: e.target.value })}
                type="number"
                min={0}
                inputMode="numeric"
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">الوصف</Label>
            <Textarea
              value={draft.description}
              onChange={(e) => onChange({ description: e.target.value })}
              rows={3}
              maxLength={280}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">السعر</Label>
              <Input
                value={draft.price}
                onChange={(e) => onChange({ price: e.target.value })}
                type="number"
                min={0}
                inputMode="decimal"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">العملة</Label>
              <Select
                value={draft.currency}
                onValueChange={(value) => onChange({ currency: value })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="اختر العملة" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} - {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">اللون (اختياري)</Label>
              <Input
                value={draft.color}
                onChange={(e) => onChange({ color: e.target.value })}
                className="h-11"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">المقاس (اختياري)</Label>
              <Input
                value={draft.size}
                onChange={(e) => onChange({ size: e.target.value })}
                className="h-11"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
