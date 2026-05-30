import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, ImagePlus, Store, Truck } from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { demoMerchant } from "@/lib/mockData";

export const Route = createFileRoute("/dashboard/store/")({
  head: () => ({ meta: [{ title: "Store profile - Botly" }] }),
  component: StoreProfilePage,
});

function StoreProfilePage() {
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState(demoMerchant.storeName);
  const [whatsapp, setWhatsapp] = useState(demoMerchant.whatsapp);
  const [bio, setBio] = useState(demoMerchant.bio);
  const [deliveryPhone, setDeliveryPhone] = useState(demoMerchant.deliveryPhone);
  const [logoPreview, setLogoPreview] = useState<string | null>(demoMerchant.logo ?? null);
  const [coverPreview, setCoverPreview] = useState<string | null>(demoMerchant.cover ?? null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
      if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview, logoPreview]);

  const pickImage = (file: File | undefined, setter: (value: string) => void) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("اختار صورة فقط");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 5MB");
      return;
    }
    setter(URL.createObjectURL(file));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || !whatsapp.trim()) {
      toast.error("اسم المحل ورقم واتساب مطلوبة");
      return;
    }

    // TODO(auth): persist merchant profile, logo, cover, bio, and delivery WhatsApp in Supabase.
    toast.success("تم حفظ صفحة المتجر");
    navigate({ to: "/dashboard/products/new" });
  };

  return (
    <DashboardLayout
      title="صفحة التاجر"
      subtitle="أكمل هوية المحل، وبعد الحفظ نبدأ مباشرة بإضافة المنتجات."
      actions={
        <Button asChild variant="outline" size="lg" className="gap-2">
          <Link to="/store/$slug" params={{ slug: "noor-store" }}>
            <ExternalLink className="h-4 w-4" />
            معاينة الصفحة
          </Link>
        </Button>
      }
    >
      <form onSubmit={onSubmit} className="space-y-6">
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
          <div className="relative h-52 bg-secondary">
            {coverPreview ? (
              <img src={coverPreview} alt="Store cover" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/20 via-background to-info/20">
                <div className="text-center text-muted-foreground">
                  <ImagePlus className="mx-auto h-8 w-8" />
                  <p className="mt-2 text-sm">صورة المحل</p>
                </div>
              </div>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => pickImage(e.target.files?.[0], setCoverPreview)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute end-4 top-4 gap-2"
              onClick={() => coverInputRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
              صورة المحل
            </Button>
          </div>

          <div className="relative px-5 pb-5">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => pickImage(e.target.files?.[0], setLogoPreview)}
            />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="-mt-14 grid h-28 w-28 place-items-center overflow-hidden rounded-lg border-4 border-card bg-background text-primary shadow-elevated"
              aria-label="رفع لوكو المحل"
            >
              {logoPreview ? (
                <img src={logoPreview} alt="Store logo" className="h-full w-full object-cover" />
              ) : (
                <div className="text-center">
                  <Store className="mx-auto h-7 w-7" />
                  <span className="mt-1 block text-xs">لوكو</span>
                </div>
              )}
            </button>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-soft">
            <Field id="storeName" label="اسم المحل أو الشركة">
              <Input
                id="storeName"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="مثال: بوتلي ستور"
                className="h-11"
                required
              />
            </Field>
            <Field id="whatsapp" label="رقم واتساب التاجر">
              <Input
                id="whatsapp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="07XX XXX XXXX"
                dir="ltr"
                className="h-11 text-start"
                required
              />
            </Field>
            <Field id="bio" label="بايو المحل (اختياري)">
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="اكتب وصف قصير عن المحل"
                rows={4}
                maxLength={280}
              />
            </Field>
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">شركة التوصيل</h2>
            </div>
            <Field id="deliveryPhone" label="رقم واتساب شركة التوصيل (اختياري)">
              <Input
                id="deliveryPhone"
                value={deliveryPhone}
                onChange={(e) => setDeliveryPhone(e.target.value)}
                placeholder="07XX XXX XXXX"
                dir="ltr"
                className="h-11 text-start"
              />
            </Field>
            <p className="text-sm leading-6 text-muted-foreground">
              هذا الرقم يستخدم لاحقاً لإشعار شركة التوصيل بالطلبات الجديدة.
            </p>
          </div>
        </section>

        <div className="flex justify-end">
          <Button type="submit" size="lg" className="shadow-soft">
            حفظ والمتابعة لإضافة المنتجات
          </Button>
        </div>
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
