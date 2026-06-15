import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Car, CheckCircle2, CreditCard, Loader2, LogOut, MapPin, Search, UserRound, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { InstallAppCard } from "@/components/pwa/InstallAppCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_YEARS, type CarMake } from "@/lib/car-data";
import { browseCarProducts, getEnabledCarCatalogue, type CustomerProduct } from "@/lib/customer.functions";
import {
  cancelFitterOrder,
  confirmFitterReceipt,
  getFitterSummary,
  loginFitter,
  requestFitterProduct,
  signupFitter,
  updateFitterProfile,
  type FitterOrder,
  type FitterSummary,
} from "@/lib/fitter.functions";
import { clearFitterSession, readFitterSession, writeFitterSession } from "@/lib/fitterSession";
import { pwaHeadLinks, pwaHeadMeta } from "@/lib/pwa";

export const Route = createFileRoute("/f")({
  head: () => ({
    meta: [{ title: "Botly Fitter" }, ...pwaHeadMeta("fitter")],
    links: pwaHeadLinks("fitter"),
  }),
  component: FitterPage,
});

type AuthMode = "login" | "signup";

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

function FitterPage() {
  const [session, setSession] = useState(() => readFitterSession());
  const [mode, setMode] = useState<AuthMode>("login");
  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const loginFn = useServerFn(loginFitter);
  const signupFn = useServerFn(signupFitter);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("الموقع غير مدعوم بهذا المتصفح");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setAddress((current) => current || `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        toast.success("تم تحديد موقعك الحالي");
      },
      () => toast.error("تعذر تحديد الموقع"),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const result =
        mode === "login"
          ? await loginFn({ data: { whatsapp, password } })
          : await signupFn({
              data: { whatsapp, password, name, city, address, latitude, longitude },
            });
      writeFitterSession(result.fitter, result.token);
      setSession({ fitter: result.fitter, token: result.token });
      toast.success("تم الدخول بنجاح");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الدخول");
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-secondary/30 px-4 py-8">
        <div className="mx-auto max-w-md">
          <div className="mb-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Wrench className="h-7 w-7" />
            </div>
            <h1 className="mt-4 text-2xl font-bold">حساب الفيتر</h1>
            <p className="mt-1 text-sm text-muted-foreground">سجل دخولك حتى تبحث وتثبت استلام الطلبات وتحسب عمولتك.</p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="grid grid-cols-2 rounded-lg bg-secondary p-1">
              <button className={`rounded-md py-2 text-sm ${mode === "login" ? "bg-background shadow" : ""}`} onClick={() => setMode("login")}>دخول</button>
              <button className={`rounded-md py-2 text-sm ${mode === "signup" ? "bg-background shadow" : ""}`} onClick={() => setMode("signup")}>تسجيل</button>
            </div>
            <form onSubmit={submitAuth} className="mt-5 space-y-4">
              <Field label="رقم الواتساب" value={whatsapp} onChange={setWhatsapp} dir="ltr" placeholder="07XX XXX XXXX" />
              <Field label="كلمة المرور" value={password} onChange={setPassword} type="password" />
              {mode === "signup" && (
                <>
                  <Field label="اسم الفيتر" value={name} onChange={setName} />
                  <CitySelect value={city} onChange={setCity} />
                  <Field label="عنوان الفيتر" value={address} onChange={setAddress} />
                  <Button type="button" variant="outline" className="w-full gap-2" onClick={useCurrentLocation}>
                    <MapPin className="h-4 w-4" />
                    موقعي الحالي
                  </Button>
                </>
              )}
              <Button disabled={loading} className="w-full gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
                {mode === "login" ? "دخول" : "إنشاء حساب"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return <FitterDashboard session={session} onLogout={() => { clearFitterSession(); setSession(null); }} />;
}

function FitterDashboard({ session, onLogout }: { session: NonNullable<ReturnType<typeof readFitterSession>>; onLogout: () => void }) {
  const [summary, setSummary] = useState<FitterSummary | null>(null);
  const [visaNumber, setVisaNumber] = useState(session.fitter.visaNumber);
  const [name, setName] = useState(session.fitter.name);
  const [city, setCity] = useState(session.fitter.city);
  const [address, setAddress] = useState(session.fitter.address);
  const [latitude, setLatitude] = useState(session.fitter.latitude);
  const [longitude, setLongitude] = useState(session.fitter.longitude);
  const summaryFn = useServerFn(getFitterSummary);
  const updateFn = useServerFn(updateFitterProfile);

  const refresh = async () => setSummary(await summaryFn({ data: { token: session.token } }));
  useEffect(() => { refresh().catch(() => {}); }, []);

  const saveProfile = async () => {
    try {
      const result = await updateFn({ data: { token: session.token, name, city, address, latitude, longitude, visaNumber } });
      writeFitterSession(result.fitter, session.token);
      toast.success("تم حفظ بيانات الفيتر");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل الحفظ");
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return toast.error("الموقع غير مدعوم بهذا المتصفح");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setAddress(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        toast.success("تم تحديث الموقع الحالي");
      },
      () => toast.error("تعذر تحديد الموقع"),
    );
  };

  return (
    <div className="min-h-screen bg-secondary/30 pb-10">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">لوحة الفيتر</h1>
            <p className="text-xs text-muted-foreground">{session.fitter.whatsapp}</p>
          </div>
          <Button variant="ghost" className="gap-2" onClick={onLogout}>
            <LogOut className="h-4 w-4" />
            خروج
          </Button>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="text-sm text-muted-foreground">الأرباح بعد آخر تصفير</div>
            <div className="mt-2 text-3xl font-bold">
              {(summary?.totalProfit ?? 0).toLocaleString()} {summary?.currency ?? "IQD"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">عدد الطلبات المؤكدة: {summary?.salesCount ?? 0}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              نسبة العمولة: {summary?.fitter.commissionPercent ?? session.fitter.commissionPercent ?? 0}%
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="mb-4 flex items-center gap-2 font-semibold"><CreditCard className="h-4 w-4" /> بيانات الفيتر</h2>
            <div className="space-y-3">
              <Field label="الاسم" value={name} onChange={setName} />
              <CitySelect value={city} onChange={setCity} />
              <Field label="العنوان" value={address} onChange={setAddress} />
              <Field label="رقم الفيزا" value={visaNumber} onChange={setVisaNumber} dir="ltr" />
              <Button type="button" variant="outline" className="w-full gap-2" onClick={useCurrentLocation}>
                <MapPin className="h-4 w-4" />
                موقعي الحالي
              </Button>
              <Button className="w-full" onClick={saveProfile}>حفظ بياناتي</Button>
            </div>
          </div>
          <InstallAppCard app="fitter" />
        </aside>
        <FitterShop token={session.token} summary={summary} onSale={refresh} />
      </main>
    </div>
  );
}

function FitterShop({
  token,
  summary,
  onSale,
}: {
  token: string;
  summary: FitterSummary | null;
  onSale: () => Promise<void>;
}) {
  const browseFn = useServerFn(browseCarProducts);
  const catalogFn = useServerFn(getEnabledCarCatalogue);
  const requestFn = useServerFn(requestFitterProduct);
  const confirmFn = useServerFn(confirmFitterReceipt);
  const cancelFn = useServerFn(cancelFitterOrder);
  const [makes, setMakes] = useState<CarMake[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [carMake, setCarMake] = useState("");
  const [carModel, setCarModel] = useState("");
  const [carYear, setCarYear] = useState("");
  const [color, setColor] = useState("");
  const [products, setProducts] = useState<CustomerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyOrderKey, setBusyOrderKey] = useState("");
  const selectedMake = makes.find((m) => m.label === carMake || m.key === carMake);

  useEffect(() => {
    catalogFn({}).then((catalog) => {
      setMakes(catalog.makes);
      setYears(catalog.years);
      setColors(catalog.colors);
    }).catch(() => {});
  }, []);

  const search = async () => {
    setLoading(true);
    try {
      setProducts(await browseFn({ data: { carMake, carModel, carYear: carYear === ALL_YEARS ? "" : carYear, color } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر البحث");
    } finally {
      setLoading(false);
    }
  };

  const requestProduct = async (product: CustomerProduct) => {
    try {
      setBusyOrderKey(`request:${product.id}`);
      await requestFn({ data: { token, productId: product.id } });
      toast.success("تم إرسال طلب المنتج للوسيط");
      await onSale();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إرسال الطلب للوسيط");
    } finally {
      setBusyOrderKey("");
    }
  };

  const confirm = async (order: FitterOrder) => {
    try {
      setBusyOrderKey(`confirm:${order.id}`);
      const result = await confirmFn({ data: { token, orderId: order.id } });
      toast.success(`تم تأكيد الاستلام. عمولتك ${result.commissionAmount.toLocaleString()} ${result.currency}`);
      await onSale();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تأكيد الطلبية");
    } finally {
      setBusyOrderKey("");
    }
  };

  const cancel = async (order: FitterOrder) => {
    try {
      setBusyOrderKey(`cancel:${order.id}`);
      await cancelFn({ data: { token, orderId: order.id } });
      toast.success("تم إلغاء الطلبية وإبلاغ الوسيط");
      await onSale();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إلغاء الطلبية");
    } finally {
      setBusyOrderKey("");
    }
  };

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <h2 className="flex items-center gap-2 font-semibold"><Car className="h-5 w-5 text-primary" /> بحث قطع السيارات</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Select value={carMake} onValueChange={(v) => { setCarMake(v); setCarModel(""); }}>
            <SelectTrigger><SelectValue placeholder="نوع السيارة" /></SelectTrigger>
            <SelectContent>{makes.map((m) => <SelectItem key={m.key} value={m.label}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={carModel} onValueChange={setCarModel} disabled={!selectedMake}>
            <SelectTrigger><SelectValue placeholder="الموديل" /></SelectTrigger>
            <SelectContent>{(selectedMake?.models ?? []).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={color} onValueChange={setColor}>
            <SelectTrigger><SelectValue placeholder="اللون" /></SelectTrigger>
            <SelectContent>{colors.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={carYear} onValueChange={setCarYear}>
            <SelectTrigger><SelectValue placeholder="السنة" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL_YEARS}>{ALL_YEARS}</SelectItem>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button onClick={search} className="mt-4 gap-2" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          عرض القطع
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => {
          const order = summary?.orders.find((item) => item.productId === product.id);
          return (
            <FitterProduct
              key={product.id}
              product={product}
              order={order}
              busyOrderKey={busyOrderKey}
              onRequest={requestProduct}
              onConfirm={confirm}
              onCancel={cancel}
            />
          );
        })}
      </div>
    </section>
  );
}

function FitterProduct({
  product,
  order,
  busyOrderKey,
  onRequest,
  onConfirm,
  onCancel,
}: {
  product: CustomerProduct;
  order?: FitterOrder;
  busyOrderKey: string;
  onRequest: (product: CustomerProduct) => void;
  onConfirm: (order: FitterOrder) => void;
  onCancel: (order: FitterOrder) => void;
}) {
  const requesting = busyOrderKey === `request:${product.id}`;
  const confirming = order ? busyOrderKey === `confirm:${order.id}` : false;
  const cancelling = order ? busyOrderKey === `cancel:${order.id}` : false;
  const isConfirmed = order?.status === "confirmed";
  const isCancelled = order?.status === "cancelled";
  const hasOrder = Boolean(order);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      {product.imageUrls[0] && <img src={product.imageUrls[0]} alt={product.title} className="mb-3 aspect-square w-full rounded-xl object-cover" />}
      <h3 className="font-semibold">{product.title}</h3>
      <div className="mt-2 text-lg font-bold">{product.price.toLocaleString()} {product.currency}</div>
      <div className="mt-3 space-y-2">
        <div className="text-xs text-muted-foreground">
          يتم احتساب عمولتك تلقائياً حسب النسبة المحددة من الأدمن.
        </div>
        {!hasOrder && (
          <Button className="w-full gap-2" disabled={requesting} onClick={() => onRequest(product)}>
            {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Car className="h-4 w-4" />}
            طلب المنتج
          </Button>
        )}
        {order && (
          <div className="space-y-2">
            <Button
              className="w-full gap-2"
              disabled={isConfirmed || isCancelled || confirming || cancelling}
              onClick={() => onConfirm(order)}
            >
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {isConfirmed ? "تم تأكيد الاستلام" : "تأكيد استلام الطلبية"}
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
              disabled={isCancelled || confirming || cancelling}
              onClick={() => onCancel(order)}
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isCancelled ? "تم إلغاء الطلبية" : "إلغاء الطلبية"}
            </Button>
            <div className="text-center text-xs text-muted-foreground">
              {isCancelled ? "هذه الطلبية ملغية ولا تحتسب عمولتها." : isConfirmed ? "العمولة محسوبة ضمن أرباحك." : "الطلب مرسل للوسيط بانتظار التسليم."}
            </div>
          </div>
        )}
      </div>
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

function Field({ label, value, onChange, type = "text", dir, placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; dir?: string; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} dir={dir} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
