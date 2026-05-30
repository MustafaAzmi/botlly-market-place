import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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

export const Route = createFileRoute("/dashboard/products/new")({
  head: () => ({ meta: [{ title: "New product - Botly" }] }),
  component: NewProductPage,
});

function NewProductPage() {
  const navigate = useNavigate();
  const currencies = useCurrencies().filter((c) => c.active);
  const [currency, setCurrency] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currency && currencies[0]) setCurrency(currencies[0].code);
  }, [currencies, currency]);

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const onPickImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("اختار صورة للمنتج فقط");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 5MB");
      return;
    }
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImagePreview(URL.createObjectURL(file));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagePreview) {
      toast.error("صورة المنتج مطلوبة");
      return;
    }

    // TODO(products): upload image to storage and insert product row in Supabase.
    toast.success("تم حفظ المنتج");
    navigate({ to: "/dashboard/products" });
  };

  return (
    <DashboardLayout title="إضافة منتج" subtitle="أضف صورة المنتج وسعره ووصفه المختصر. باقي التفاصيل اختيارية.">
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
                    <span className="mt-1 block text-xs text-muted-foreground">PNG أو JPG، أقل من 5MB</span>
                  </span>
                </button>
              )}
            </Field>
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-soft">
            <Field id="description" label="وصف مختصر">
              <Textarea
                id="description"
                rows={4}
                placeholder="مثال: تيشيرت قطن مريح، مناسب للاستخدام اليومي"
                maxLength={280}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="size" label="المقاس (اختياري)">
                <Input id="size" placeholder="S / M / L أو 42" className="h-11" />
              </Field>
              <Field id="color" label="اللون (اختياري)">
                <Input id="color" placeholder="أسود، أبيض..." className="h-11" />
              </Field>
            </div>

            <Field id="quantity" label="الكمية المتوفرة (اختياري)">
              <Input id="quantity" type="number" min={0} inputMode="numeric" placeholder="مثال: 12" className="h-11" />
            </Field>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-soft">
            <Field id="currentPrice" label="السعر الحالي">
              <Input
                id="currentPrice"
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
            <Button type="submit" size="lg" className="flex-1 shadow-soft">
              حفظ المنتج
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
