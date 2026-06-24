import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CreditCard, LogOut, MapPin, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { InstallAppCard } from "@/components/pwa/InstallAppCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateFitterProfile } from "@/lib/fitter.functions";
import { clearFitterSession, readFitterSession, writeFitterSession } from "@/lib/fitterSession";
import { IRAQI_GOVERNORATES } from "@/lib/governorates";
import { pwaHeadLinks, pwaHeadMeta } from "@/lib/pwa";

export const Route = createFileRoute("/f_/settings")({
  head: () => ({
    meta: [{ title: "إعدادات الفيتر - Botly" }, ...pwaHeadMeta("fitter")],
    links: pwaHeadLinks("fitter"),
  }),
  component: FitterSettingsPage,
});

function FitterSettingsPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => readFitterSession());
  const [name, setName] = useState(session?.fitter.name ?? "");
  const [city, setCity] = useState(session?.fitter.city ?? "");
  const [address, setAddress] = useState(session?.fitter.address ?? "");
  const [visaNumber, setVisaNumber] = useState(session?.fitter.visaNumber ?? "");
  const [latitude, setLatitude] = useState<number | undefined>(session?.fitter.latitude);
  const [longitude, setLongitude] = useState<number | undefined>(session?.fitter.longitude);
  const [saving, setSaving] = useState(false);
  const updateFn = useServerFn(updateFitterProfile);

  useEffect(() => {
    if (!session) navigate({ to: "/f" });
  }, [navigate, session]);

  if (!session) return null;

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("الموقع غير مدعوم بهذا المتصفح");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setAddress(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        toast.success("تم تحديث الموقع الحالي");
      },
      () => toast.error("تعذر تحديد الموقع"),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const result = await updateFn({
        data: { token: session.token, name, city, address, latitude, longitude, visaNumber },
      });
      writeFitterSession(result.fitter, session.token);
      setSession({ fitter: result.fitter, token: session.token });
      toast.success("تم حفظ بيانات الفيتر");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    clearFitterSession();
    navigate({ to: "/f" });
  };

  return (
    <div className="min-h-screen bg-secondary/30 pb-10">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">إعدادات الفيتر</h1>
            <p className="text-xs text-muted-foreground">{session.fitter.whatsapp}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link to="/f">
                <ArrowRight className="h-4 w-4" />
                رجوع
              </Link>
            </Button>
            <Button variant="ghost" className="gap-2" onClick={logout}>
              <LogOut className="h-4 w-4" />
              خروج
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-5 px-4 py-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <CreditCard className="h-4 w-4" />
            بيانات الفيتر
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="الاسم" value={name} onChange={setName} />
            <CitySelect value={city} onChange={setCity} />
            <Field label="العنوان" value={address} onChange={setAddress} />
            <Field label="رقم الفيزا" value={visaNumber} onChange={setVisaNumber} dir="ltr" />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" variant="outline" className="gap-2" onClick={useCurrentLocation}>
              <MapPin className="h-4 w-4" />
              موقعي الحالي
            </Button>
            <Button className="gap-2" onClick={saveProfile} disabled={saving}>
              <Save className="h-4 w-4" />
              حفظ بياناتي
            </Button>
          </div>
        </section>

        <InstallAppCard app="fitter" />
      </main>
    </div>
  );
}

function CitySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>المدينة</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="اختر المحافظة" />
        </SelectTrigger>
        <SelectContent>
          {IRAQI_GOVERNORATES.map((governorate) => (
            <SelectItem key={governorate} value={governorate}>
              {governorate}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  dir,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  dir?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} dir={dir} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
