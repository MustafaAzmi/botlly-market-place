import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";
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

export const Route = createFileRoute("/dashboard/products/new")({
  head: () => ({ meta: [{ title: "New product - Botly" }] }),
  component: NewProductPage,
});

function NewProductPage() {
  const navigate = useNavigate();
  const createMerchantProductFn = useServerFn(createMerchantProduct);
  const currencies = useCurrencies().filter((c) => c.active);
  const [currency, setCurrency] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [quantity, setQuantity] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [discountPrice, setDiscountPrice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currency && currencies[0]) setCurrency(currencies[0].code);
  }, [currencies, currency]);

  // Resize + recompress the uploaded image to a small JPEG data URL. Raw
  // camera photos are megabytes; the server caps the stored image, and big
  // base64 blobs bloat the database — so we shrink client-side first.
  const compressImageFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("تعذر قراءة الصورة"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("تعذر فتح الصورة"));
        img.onload = () => {
          const maxDim = 1000;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("تعذر معالجة الصورة"));
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });

  // Handle file upload: compress then keep as data URL for preview + storage.
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setImageFile(null);
      setImagePreview("");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن لا يزيد على 8MB");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("اختر صورة فقط");
      return;
    }

    try {
      const dataUrl = await compressImageFile(file);
      setImageFile(file);
      setImagePreview(dataUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر معالجة الصورة");
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const merchantSession = readMerchantSession();
    if (!merchantSession?.token) {
      navigate({ to: "/auth" });
      return;
    }

    // Validation: must have EITHER imageFile OR imageUrl (not both required, at least one).
    let finalImageUrl = "";
    if (imageFile && imagePreview) {
      finalImageUrl = imagePreview;
    } else if (imageUrl.trim()) {
      try {
        new URL(imageUrl.trim());
        finalImageUrl = imageUrl.trim();
      } catch {
        toast.error("رابط الصورة غير صحيح");
        return;
      }
    } else {
      toast.error("أضف صورة: إما رابط أو ارفع صورة من جهازك");
      return;
    }

    const price = Number(currentPrice);
    const salePrice = discountPrice.trim() ? Number(discountPrice) : undefined;
    const availableQuantity = quantity.trim() ? Number(quantity) : undefined;
    if (!title.trim() || !description.trim() || !Number.isFinite(price)) {
      toast.error("اسم المنتج والوصف والسعر الحالي مطلوبة");
      return;
    }
    if (salePrice !== undefined && !Number.isFinite(salePrice)) {
      toast.error("سعر الخصم غير صحيح");
      return;
    }
    if (availableQuantity !== undefined && !Number.isInteger(availableQuantity)) {
      toast.error("الكمية يجب أن تكون رقم صحيح");
      return;
    }

    setSaving(true);
    try {
      await createMerchantProductFn({
        data: {
          token: merchantSession.token,
          title: title.trim(),
          description: description.trim(),
          imageUrl: finalImageUrl,
          currentPrice: price,
          discountPrice: salePrice,
          currency,
          size: size.trim(),
          color: color.trim(),
          quantity: availableQuantity,
        },
      });
      toast.success("تم حفظ المنتج");
      navigate({ to: "/dashboard/products" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ المنتج");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      title="إضافة منتج"
      subtitle="أضف اسم المنتج والسعر والوصف. الصورة اختيارية: إما ارفع من جهازك أو ضع رابط."
    >
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link to="/dashboard/products">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            المنتجات
          </Link>
        </Button>
      </div>

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-5 shadow-soft">
            <div className="space-y-4">
              <div>
                <Label htmlFor="imageFile" className="text-sm font-medium">ارفع صورة من جهازك</Label>
                <Input
                  id="imageFile"
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="mt-2 h-11"
                />
                <p className="mt-1 text-xs text-muted-foreground">PNG, JPG، إلخ (حد أقصى 2MB)</p>
              </div>

              <div className="relative flex items-center gap-3">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground">أو</span>
                <div className="flex-1 border-t border-border" />
              </div>

              <div>
                <Label htmlFor="imageUrl" className="text-sm font-medium">أو ضع رابط الصورة</Label>
                <Input
                  id="imageUrl"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/product.jpg"
                  dir="ltr"
                  className="mt-2 h-11 text-start"
                />
              </div>
            </div>

            <div className="mt-4 aspect-[4/3] overflow-hidden rounded-lg border border-border bg-secondary">
              {imagePreview || (imageUrl.trim()) ? (
                <img
                  src={imagePreview || imageUrl.trim()}
                  alt="Product preview"
                  className="h-full w-full object-cover"
                  onError={() => imageUrl && toast.error("خطأ بتحميل الصورة من الرابط")}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-center text-muted-foreground">
                  <span>
                    <ImagePlus className="mx-auto h-8 w-8 text-primary" />
                    <span className="mt-3 block text-sm font-medium">معاينة الصورة</span>
                    <span className="mt-1 block text-xs">ارفع صورة أو ضع رابط</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-soft">
            <Field id="title" label="اسم المنتج">
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: تيشيرت قطن أسود"
                className="h-11"
                maxLength={140}
                required
              />
            </Field>

            <Field id="description" label="وصف مختصر">
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="مثال: تيشيرت قطن مريح، مناسب للاستخدام اليومي"
                maxLength={280}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="size" label="المقاس (اختياري)">
                <Input
                  id="size"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder="S / M / L أو 42"
                  className="h-11"
                />
              </Field>
              <Field id="color" label="اللون (اختياري)">
                <Input
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="أسود، أبيض..."
                  className="h-11"
                />
              </Field>
            </div>

            <Field id="quantity" label="الكمية المتوفرة (اختياري)">
              <Input
                id="quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="مثال: 12"
                className="h-11"
              />
            </Field>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-soft">
            <Field id="currentPrice" label="السعر الحالي">
              <Input
                id="currentPrice"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(e.target.value)}
                type="number"
                min={0}
                inputMode="decimal"
                placeholder="0"
                className="h-11"
                required
              />
            </Field>
            <Field id="discountPrice" label="السعر بعد الخصم (اختياري)">
              <Input
                id="discountPrice"
                value={discountPrice}
                onChange={(e) => setDiscountPrice(e.target.value)}
                type="number"
                min={0}
                inputMode="decimal"
                placeholder="0"
                className="h-11"
              />
            </Field>
            <Field id="currency" label="العملة">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency" className="h-11">
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
            </Field>
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="lg" className="flex-1 shadow-soft" disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ المنتج"}
            </Button>
            <Button asChild type="button" size="lg" variant="outline">
              <Link to="/dashboard/products">إلغاء</Link>
            </Button>
          </div>
        </aside>
      </form>
    </DashboardLayout>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      {children}
    </div>
  );
}
