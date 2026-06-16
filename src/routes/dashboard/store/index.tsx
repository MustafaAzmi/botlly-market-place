import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, ImagePlus, Loader2, MapPin, Store } from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentMerchant, updateMerchantProfile } from "@/lib/merchant.functions";
import { readMerchantSession, writeMerchantSession } from "@/lib/merchantSession";

export const Route = createFileRoute("/dashboard/store/")({
  head: () => ({ meta: [{ title: "Store profile - Botly" }] }),
  component: StoreProfilePage,
});

const IRAQI_GOVERNORATES = [
  "بغداد",
  "نينوى",
  "البصرة",
  "أربيل",
  "السليمانية",
  "دهوك",
  "كركوك",
  "الأنبار",
  "صلاح الدين",
  "ديالى",
  "واسط",
  "بابل",
  "كربلاء",
  "النجف",
  "الديوانية",
  "المثنى",
  "ذي قار",
  "ميسان",
  "حلبجة",
];

function StoreProfilePage() {
  const navigate = useNavigate();
  const getCurrentMerchantFn = useServerFn(getCurrentMerchant);
  const updateMerchantProfileFn = useServerFn(updateMerchantProfile);
  const [storeName, setStoreName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const mapUrl =
    latitude.trim() && longitude.trim()
      ? `https://www.google.com/maps?q=${encodeURIComponent(`${latitude.trim()},${longitude.trim()}`)}`
      : "";

  useEffect(() => {
    const merchantSession = readMerchantSession();
    if (!merchantSession?.token) {
      navigate({ to: "/auth" });
      return;
    }

    setStoreName(merchantSession.storeName ?? "");
    setWhatsapp(merchantSession.whatsapp ?? "");
    setCity(merchantSession.city ?? "");
    setBio(merchantSession.bio ?? "");
    setAddress(merchantSession.address ?? "");
    setLatitude(
      typeof merchantSession.latitude === "number" ? String(merchantSession.latitude) : "",
    );
    setLongitude(
      typeof merchantSession.longitude === "number" ? String(merchantSession.longitude) : "",
    );
    setDeliveryPhone(merchantSession.deliveryPhone ?? "");
    setStoreSlug(merchantSession.storeSlug ?? "");

    getCurrentMerchantFn({ data: { token: merchantSession.token } })
      .then((profile) => {
        setStoreName(profile.storeName);
        setWhatsapp(profile.whatsapp);
        setCity(profile.city ?? "");
        setBio(profile.bio ?? "");
        setAddress(profile.address ?? "");
        setLatitude(typeof profile.latitude === "number" ? String(profile.latitude) : "");
        setLongitude(typeof profile.longitude === "number" ? String(profile.longitude) : "");
        setDeliveryPhone(profile.deliveryPhone ?? "");
        if (profile.storeSlug) setStoreSlug(profile.storeSlug);
        setLogoPreview(profile.logoUrl ?? null);
        setCoverPreview(profile.coverUrl ?? null);
        writeMerchantSession({
          merchantId: profile.id,
          storeSlug: profile.storeSlug,
          storeName: profile.storeName,
          whatsapp: profile.whatsapp,
          city: profile.city,
          email: profile.email,
          bio: profile.bio,
          address: profile.address,
          latitude: profile.latitude,
          longitude: profile.longitude,
          deliveryPhone: profile.deliveryPhone,
        });
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "سجل دخول مرة ثانية");
        navigate({ to: "/auth" });
      })
      .finally(() => setLoading(false));
  }, [getCurrentMerchantFn, navigate]);

  const pickImage = (file: File | undefined, setter: (value: string) => void) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("اختار صورة فقط");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setter(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const useCurrentLocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error("متصفحك ما يدعم تحديد الموقع. افتح الصفحة من Chrome وجرب مرة ثانية.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = position.coords.latitude.toFixed(6);
        const nextLongitude = position.coords.longitude.toFixed(6);
        const nextMapUrl = `https://www.google.com/maps?q=${nextLatitude},${nextLongitude}`;
        setLatitude(nextLatitude);
        setLongitude(nextLongitude);
        setAddress((current) => current.trim() || nextMapUrl);
        toast.success("تم تحديد موقع المتجر من Google Maps");
        setLocating(false);
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "اسمح للموقع من المتصفح حتى نحدد مكان المتجر."
            : "ما قدرنا نحدد موقعك حالياً، جرب مرة ثانية.";
        toast.error(message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const merchantSession = readMerchantSession();
    if (!merchantSession?.token) {
      navigate({ to: "/auth" });
      return;
    }

    if (!storeName.trim() || !whatsapp.trim() || !city) {
      toast.error("اسم المحل ورقم واتساب والمحافظة مطلوبة");
      return;
    }
    const latValue = latitude.trim() ? Number(latitude) : undefined;
    const lngValue = longitude.trim() ? Number(longitude) : undefined;
    if (
      (latValue !== undefined && !Number.isFinite(latValue)) ||
      (lngValue !== undefined && !Number.isFinite(lngValue))
    ) {
      toast.error("إحداثيات المتجر غير صحيحة");
      return;
    }

    setSaving(true);
    try {
      const profile = await updateMerchantProfileFn({
        data: {
          token: merchantSession.token,
          storeName: storeName.trim(),
          whatsapp: whatsapp.trim(),
          city,
          bio: bio.trim(),
          address: address.trim(),
          latitude: latValue,
          longitude: lngValue,
          deliveryPhone: deliveryPhone.trim(),
          logoUrl: logoPreview ?? "",
          coverUrl: coverPreview ?? "",
        },
      });
      writeMerchantSession({
        merchantId: profile.id,
        storeName: profile.storeName,
        whatsapp: profile.whatsapp,
        city: profile.city,
        bio: profile.bio,
        address: profile.address,
        latitude: profile.latitude,
        longitude: profile.longitude,
        deliveryPhone: profile.deliveryPhone,
      });
      toast.success("تم حفظ صفحة المتجر");
      navigate({ to: "/dashboard/products/new" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ صفحة المتجر");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      title="صفحة التاجر"
      subtitle="بيانات المتجر محفوظة بقاعدة البيانات، تقدر تعدلها وتكمل باقي الصفحة."
      actions={
        <Button asChild variant="outline" size="lg" className="gap-2">
          <Link to="/store/$slug" params={{ slug: storeSlug || "store" }}>
            <ExternalLink className="h-4 w-4" />
            معاينة الصفحة
          </Link>
        </Button>
      }
    >
      {loading ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground shadow-soft">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-3 text-sm">جاري تحميل بيانات متجرك...</p>
        </div>
      ) : (
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
              <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">
                الاسم والرقم محفوظين من التسجيل، غيّرهم فقط إذا تحتاج.
              </div>
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
              <Field id="city" label="المحافظة">
                <Select value={city} onValueChange={setCity} required>
                  <SelectTrigger id="city" className="h-11">
                    <SelectValue placeholder="اختار محافظة المتجر" />
                  </SelectTrigger>
                  <SelectContent>
                    {IRAQI_GOVERNORATES.map((governorate) => (
                      <SelectItem key={governorate} value={governorate}>
                        {governorate}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <Field id="address" label="عنوان المتجر أو رابط الموقع (اختياري)">
                <Textarea
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="مثال: بغداد - المنصور، أو رابط موقع المتجر"
                  rows={3}
                  maxLength={500}
                />
              </Field>
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">موقع المتجر على Google Maps</Label>
                    <p className="text-sm leading-6 text-muted-foreground">
                      اضغط الزر وخلي المتصفح يحدد موقعك الحالي حتى نستخدمه بالبحث القريب للزبائن.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="gap-2"
                    onClick={useCurrentLocation}
                    disabled={locating}
                  >
                    {locating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MapPin className="h-4 w-4" />
                    )}
                    موقعي الآن
                  </Button>
                </div>
                {mapUrl ? (
                  <div className="mt-3 flex flex-col gap-2 rounded-md bg-primary-soft px-3 py-2 text-sm text-primary sm:flex-row sm:items-center sm:justify-between">
                    <span>تم حفظ موقع المتجر للبحث القريب.</span>
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                    >
                      فتح بالخريطة
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Delivery company section hidden from merchants for now —
                delivery companies are managed by the admin (/admin/delivery).
                The saved deliveryPhone value is preserved through profile saves. */}
          </section>

          <div className="flex justify-end">
            <Button type="submit" size="lg" className="shadow-soft">
              {saving ? "جاري الحفظ..." : "حفظ والمتابعة لإضافة المنتجات"}
            </Button>
          </div>
        </form>
      )}
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
