import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ImagePlus, X } from "lucide-react";
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

export const Route = createFileRoute("/dashboard/products/new")({
  head: () => ({ meta: [{ title: "New product - Botly" }] }),
  component: NewProductPage,
});

function NewProductPage() {
  const navigate = useNavigate();
  const createMerchantProductFn = useServerFn(createMerchantProduct);
  const currencies = useCurrencies().filter((c) => c.active);
  const [currency, setCurrency] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [quantity, setQuantity] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [discountPrice, setDiscountPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currency && currencies[0]) setCurrency(currencies[0].code);
  }, [currencies, currency]);

  const onPickImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("اختار صورة للمنتج فقط");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const merchantSession = readMerchantSession();
    if (!merchantSession?.token) {
      navigate({ to: "/auth" });
      return;
    }

    if (!imagePreview) {
      toast.error("صورة المنتج مطلوبة");
      return;
    }
    const price = Number(currentPrice);
    const salePrice = discountPrice.trim() ? Number(discountPrice) : undefined;
    if (!description.trim() || !Number.isFinite(price)) {
      toast.error("الوصف والسعر الحالي مطلوبة");
      return;
    }

    setSaving(true);
    try {
      await createMerchantProductFn({
        data: {
          token: merchantSession.token,
          description: description.trim(),
          imageUrl: imagePreview,
          currentPrice: price,
          discountPrice: salePrice,
          currency,
          size: size.trim(),
          color: color.trim(),
          quantity: quantity.trim() ? Number(quantity) : undefined,
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
      subtitle="أضف صورة المنتج وسعره ووصفه المختصر. باقي التفاصيل اختيارية."
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
            <Field id="image" label="صورة المنتج">
              <input
                ref={inputRef}
                id="image"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => onPickImage(e.target.files?.[0])}
              />
              {imagePreview ? (
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-secondary">
                  <img src={imagePreview} alt="Product" className="h-full w-full object-cover" />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="absolute end-3 top-3"
                    onClick={() => {
                      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
                      setImagePreview(null);
                      if (inputRef.current) inputRef.current.value = "";
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/40 text-center transition-colors hover:bg-secondary"
                >
                  <span>
                    <ImagePlus className="mx-auto h-8 w-8 text-primary" />
                    <span className="mt-3 block text-sm font-medium">اختر صورة المنتج</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      PNG أو JPG، أقل من 2MB
                    </span>
                  </span>
                </button>
              )}
            </Field>
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-soft">
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
