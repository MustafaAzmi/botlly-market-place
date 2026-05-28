import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useT } from "@/i18n/LanguageProvider";
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
import { ImagePlus, ArrowLeft, X } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { useCurrencies } from "@/lib/currenciesStore";

export const Route = createFileRoute("/dashboard/products/new")({
  head: () => ({ meta: [{ title: "New product — Botly" }] }),
  component: NewProductPage,
});

interface ImageItem {
  id: string;
  url: string;
  file: File;
}

function NewProductPage() {
  const t = useT();
  const navigate = useNavigate();
  const currencies = useCurrencies().filter((c) => c.active);
  const [currency, setCurrency] = useState<string>("");
  const [images, setImages] = useState<ImageItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currency && currencies[0]) setCurrency(currencies[0].code);
  }, [currencies, currency]);

  useEffect(() => {
    return () => {
      images.forEach((i) => URL.revokeObjectURL(i.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    const next: ImageItem[] = [];
    Array.from(files).forEach((f) => {
      if (!f.type.startsWith("image/")) return;
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name} > 5MB`);
        return;
      }
      next.push({
        id: `${f.name}-${f.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        url: URL.createObjectURL(f),
        file: f,
      });
    });
    if (next.length) setImages((prev) => [...prev, ...next]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO(supabase): upload images to storage, then insert product row.
    toast.success(t("products.form.save"));
    navigate({ to: "/dashboard/products" });
  };

  return (
    <DashboardLayout title={t("products.add")} subtitle={t("products.subtitle")}>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link to="/dashboard/products">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t("products.title")}
          </Link>
        </Button>
      </div>

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <Field label={t("products.form.title")}>
              <Input className="h-11" placeholder="AirBuds Pro 2" required maxLength={120} />
            </Field>
            <Field label={t("products.form.description")}>
              <Textarea rows={5} placeholder="…" maxLength={1500} />
            </Field>
            <Field
              label={`${t("products.form.keywords")} (اختياري)`}
              hint={t("products.form.keywords.hint")}
            >
              <Input className="h-11" placeholder="earbuds, wireless, سماعات" maxLength={200} />
            </Field>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <Label className="text-sm font-medium">{t("products.form.images")}</Label>
              <span className="text-xs text-muted-foreground">
                {images.length} صورة
              </span>
            </div>

            {images.length > 0 && (
              <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-secondary"
                  >
                    <img
                      src={img.url}
                      alt={`product ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                    {idx === 0 && (
                      <span className="absolute start-2 top-2 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                        رئيسية
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      className="absolute end-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-background/90 text-foreground opacity-0 shadow-soft transition-opacity group-hover:opacity-100"
                      aria-label="حذف الصورة"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label className="flex aspect-[3/1] cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border bg-secondary/40 text-center transition-colors hover:bg-secondary">
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => onPickFiles(e.target.files)}
              />
              <div>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-card text-primary shadow-soft">
                  <ImagePlus className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-medium">
                  {images.length > 0 ? "إضافة صور أخرى" : t("products.form.images.hint")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">PNG, JPG · ≤ 5MB · يمكن اختيار أكثر من صورة</p>
              </div>
            </label>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("products.form.price")}>
                <Input className="h-11" type="number" inputMode="decimal" placeholder="0" required min={0} />
              </Field>
              <Field label={t("products.form.currency")}>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} — {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label={`${t("products.form.discountPrice")}`}>
              <Input className="h-11" type="number" inputMode="decimal" placeholder="0" min={0} />
            </Field>
          </Card>

          <Card>
            <Field label={t("products.form.category")}>
              <Select defaultValue="Electronics">
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Electronics">Electronics</SelectItem>
                  <SelectItem value="Fashion">Fashion</SelectItem>
                  <SelectItem value="Accessories">Accessories</SelectItem>
                  <SelectItem value="Home">Home</SelectItem>
                  <SelectItem value="Beauty">Beauty</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={`${t("products.form.color")} (اختياري)`}>
              <Input className="h-11" placeholder="Black" maxLength={40} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("products.form.condition")}>
                <Select defaultValue="new">
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">{t("products.condition.new")}</SelectItem>
                    <SelectItem value="used">{t("products.condition.used")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("products.form.availability")}>
                <Select defaultValue="in_stock">
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_stock">{t("products.availability.inStock")}</SelectItem>
                    <SelectItem value="out_of_stock">{t("products.availability.outOfStock")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Card>

          <div className="flex gap-2">
            <Button type="submit" size="lg" className="flex-1 shadow-soft">{t("products.form.save")}</Button>
            <Button asChild type="button" size="lg" variant="outline">
              <Link to="/dashboard/products">{t("products.form.cancel")}</Link>
            </Button>
          </div>
        </div>
      </form>
    </DashboardLayout>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft">{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
