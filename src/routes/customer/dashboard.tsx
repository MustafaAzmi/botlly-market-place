import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Car,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogOut,
  MessageCircle,
  Package,
  Save,
  Search,
  User,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_YEARS, type CarMake } from "@/lib/car-data";
import {
  browseCarProducts,
  getMediatorPhone,
  getEnabledCarCatalogue,
  updateCustomerProfile,
  submitProductOrder,
  type CustomerProduct,
} from "@/lib/customer.functions";
import {
  clearCustomerSession,
  readCustomerSession,
  writeCustomerSession,
} from "@/lib/customerSession";

export const Route = createFileRoute("/customer/dashboard")({
  head: () => ({ meta: [{ title: "لوحة الزبون - Botly" }] }),
  component: CustomerDashboard,
});

type TabKey = "shop" | "profile";

// wa.me links need digits only (international format, no +).
function toWhatsAppLink(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^0/, "964");
  return `https://wa.me/${digits}`;
}

function CustomerDashboard() {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => readCustomerSession());
  const [tab, setTab] = useState<TabKey>("shop");
  const [mediatorPhone, setMediatorPhone] = useState("");
  const getMediatorFn = useServerFn(getMediatorPhone);

  useEffect(() => {
    if (!session) {
      navigate({ to: "/customer/auth" });
      return;
    }
    getMediatorFn({})
      .then((result) => setMediatorPhone(result.phone))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    clearCustomerSession();
    navigate({ to: "/customer/auth" });
  };

  if (!session) return null;
  const { customer } = session;

  return (
    <div className="min-h-screen bg-secondary/30 pb-24">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              خروج
            </Button>
          </div>
        </div>
        {/* Tabs */}
        <nav className="container mx-auto flex max-w-6xl gap-1 px-4 pb-2">
          {(
            [
              { key: "shop", icon: Search, label: "تسوق القطع" },
              { key: "profile", icon: User, label: "حسابي" },
            ] as Array<{ key: TabKey; icon: typeof Search; label: string }>
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === item.key
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="container mx-auto max-w-6xl px-4 py-6">
        {tab === "shop" && <ShopTab customerWhatsapp={customer.whatsapp} mediatorPhone={mediatorPhone} />}
        {tab === "profile" && (
          <ProfileTab
            session={session}
            onUpdated={(updated) => setSession(readCustomerSession() ?? updated)}
          />
        )}
      </main>

      {/* Mediator contact: ALWAYS visible, before or after choosing a product */}
      {mediatorPhone && (
        <a
          href={toWhatsAppLink(mediatorPhone)}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-medium text-primary-foreground shadow-elevated transition hover:scale-105"
        >
          <MessageCircle className="h-5 w-5" />
          التواصل مع الوسيط
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shop: car filters → products (specs + final price only, no merchant info)
// ---------------------------------------------------------------------------

function ShopTab({ customerWhatsapp, mediatorPhone }: { customerWhatsapp: string; mediatorPhone: string }) {
  const browseFn = useServerFn(browseCarProducts);
  const getCatalogFn = useServerFn(getEnabledCarCatalogue);
  const [carMake, setCarMake] = useState("");
  const [carModel, setCarModel] = useState("");
  const [carYear, setCarYear] = useState("");
  const [color, setColor] = useState("");
  const [products, setProducts] = useState<CustomerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [makes, setMakes] = useState<CarMake[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [years, setYears] = useState<string[]>([]);

  useEffect(() => {
    getCatalogFn({})
      .then((catalog) => {
        setMakes(catalog.makes);
        setColors(catalog.colors);
        setYears(catalog.years);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedMake = makes.find((m) => m.label === carMake || m.key === carMake);

  const search = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const results = await browseFn({
        data: { carMake, carModel, carYear: carYear === ALL_YEARS ? "" : carYear, color },
      });
      setProducts(results);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل المنتجات");
    } finally {
      setLoading(false);
    }
  }, [browseFn, carMake, carModel, carYear, color]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-center gap-2 font-semibold">
          <Car className="h-5 w-5 text-primary" />
          دور على قطع سيارتك
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>نوع السيارة</Label>
            <Select
              value={carMake}
              onValueChange={(value) => {
                setCarMake(value);
                setCarModel("");
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="اختر النوع" />
              </SelectTrigger>
              <SelectContent>
                {makes.map((make) => (
                  <SelectItem key={make.key} value={make.label}>
                    {make.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>الموديل</Label>
            <Select value={carModel} onValueChange={setCarModel} disabled={!selectedMake}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder={selectedMake ? "اختر الموديل" : "اختر النوع أولاً"} />
              </SelectTrigger>
              <SelectContent>
                {(selectedMake?.models ?? []).map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>اللون</Label>
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="كل الألوان" />
              </SelectTrigger>
              <SelectContent>
                {colors.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>سنة الصنع (الموديل)</Label>
            <Select value={carYear} onValueChange={setCarYear}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder={ALL_YEARS} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_YEARS}>{ALL_YEARS}</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={search} disabled={loading} size="lg" className="mt-4 w-full gap-2 sm:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          عرض القطع
        </Button>
      </div>

      {/* Results */}
      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground shadow-soft">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-3 text-sm">جاري البحث عن القطع...</p>
        </div>
      ) : !searched ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
          <Car className="mx-auto h-10 w-10 text-primary" />
          <p className="mt-3 text-sm">اختر نوع سيارتك والموديل واللون، وراح نعرضلك كل القطع المتوفرة لها.</p>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
          <Package className="mx-auto h-10 w-10" />
          <p className="mt-3 text-sm">
            ما لكينا قطع مطابقة حالياً. جرب فلاتر أوسع، أو اضغط «التواصل مع الوسيط» ونساعدك ندورها.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">النتائج: {products.length} قطعة</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                mediatorPhone={mediatorPhone}
                customerName={customerWhatsapp}
                customerPhone={customerWhatsapp}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Product card with a multi-image gallery. Shows specs + the FINAL price only —
// deliberately no merchant name, address or phone.
function ProductCard({
  product,
  mediatorPhone,
  customerName,
  customerPhone,
}: {
  product: CustomerProduct;
  mediatorPhone: string;
  customerName: string;
  customerPhone: string;
}) {
  const submitOrderFn = useServerFn(submitProductOrder);
  const [imageIndex, setImageIndex] = useState(0);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const images = product.imageUrls;
  const specs = [
    product.carMake,
    product.carModel,
    product.carYear ? `موديل ${product.carYear}` : undefined,
    product.color,
    product.size,
  ].filter(Boolean);

  const handleSubmitOrder = async () => {
    if (!product.merchantWhatsapp) {
      toast.error("معلومات التاجر غير متوفرة");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitOrderFn({
        data: {
          productTitle: product.title,
          price: product.price,
          currency: product.currency,
          merchantWhatsapp: product.merchantWhatsapp,
          customerName,
          customerPhone,
        },
      });
      toast.success(result.message);
      setShowOrderForm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل إرسال الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all hover:-translate-y-1 hover:shadow-elevated">
      <div className="relative aspect-square bg-secondary">
        {images.length > 0 && (
          <img src={images[imageIndex]} alt={product.title} className="h-full w-full object-cover" />
        )}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setImageIndex((imageIndex - 1 + images.length) % images.length)}
              className="absolute start-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white"
              aria-label="الصورة السابقة"
            >
              <ChevronRight className="h-4 w-4 rtl:hidden" />
              <ChevronLeft className="hidden h-4 w-4 rtl:block" />
            </button>
            <button
              type="button"
              onClick={() => setImageIndex((imageIndex + 1) % images.length)}
              className="absolute end-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white"
              aria-label="الصورة التالية"
            >
              <ChevronLeft className="h-4 w-4 rtl:hidden" />
              <ChevronRight className="hidden h-4 w-4 rtl:block" />
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${i === imageIndex ? "bg-white" : "bg-white/40"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 font-semibold">{product.title}</h3>
        {product.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
        )}
        {specs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {specs.map((spec) => (
              <Badge key={spec} variant="secondary" className="text-[10px]">
                {spec}
              </Badge>
            ))}
          </div>
        )}
        <div className="mt-3 space-y-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold">{product.price.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">{product.currency}</span>
          </div>
        </div>
        <Button
          onClick={() => setShowOrderForm(true)}
          size="sm"
          className="mt-3 w-full gap-2"
        >
          <MessageCircle className="h-4 w-4" />
          طلب المنتج
        </Button>

        {showOrderForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg">
              <h2 className="text-lg font-semibold">تأكيد الطلب</h2>
              <p className="mt-2 text-sm text-muted-foreground">سيتم إرسال طلبك للوسيط</p>

              <div className="mt-4 space-y-3 rounded-lg bg-secondary/50 p-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">المنتج</div>
                  <div className="font-medium">{product.title}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">السعر</div>
                  <div className="font-medium">
                    {product.price.toLocaleString()} {product.currency}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">بيانات الزبون</div>
                  <div className="font-medium">{customerName}</div>
                  <div className="text-xs text-muted-foreground">{customerPhone}</div>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowOrderForm(false)}
                  className="flex-1"
                >
                  إلغاء
                </Button>
                <Button
                  onClick={handleSubmitOrder}
                  disabled={submitting}
                  className="flex-1 gap-2"
                >
                  {submitting ? "جاري الإرسال..." : "تأكيد الطلب"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile: saved once, editable any time
// ---------------------------------------------------------------------------

function ProfileTab({
  session,
  onUpdated,
}: {
  session: NonNullable<ReturnType<typeof readCustomerSession>>;
  onUpdated: (session: NonNullable<ReturnType<typeof readCustomerSession>>) => void;
}) {
  const updateFn = useServerFn(updateCustomerProfile);
  const { customer } = session;
  const [name, setName] = useState(customer.name);
  const [landmark, setLandmark] = useState(customer.landmark);
  const [governorate, setGovernorate] = useState(customer.governorate);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await updateFn({
        data: {
          whatsapp: customer.whatsapp,
          name: name.trim(),
          landmark: landmark.trim(),
          governorate: governorate.trim(),
        },
      });
      writeCustomerSession(result.customer, session.token);
      onUpdated({ customer: result.customer, token: session.token });
      toast.success("تم حفظ بياناتك ✅");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
      <h2 className="font-semibold">بيانات حسابك</h2>
      <p className="text-xs text-muted-foreground">
        محفوظة دائمياً — تنطلب منك مرة وحدة فقط، وتكدر تعدلها هنا بأي وقت.
      </p>

      <div className="space-y-2">
        <Label>رقم الواتساب</Label>
        <Input dir="ltr" value={customer.whatsapp} disabled className="h-11 bg-secondary" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-name">الاسم الكامل</Label>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-landmark">أقرب نقطة دالة</Label>
        <Input
          id="profile-landmark"
          value={landmark}
          onChange={(e) => setLandmark(e.target.value)}
          className="h-11"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-governorate">المحافظة / المدينة</Label>
        <Input
          id="profile-governorate"
          value={governorate}
          onChange={(e) => setGovernorate(e.target.value)}
          className="h-11"
        />
      </div>

      <Button type="submit" disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        حفظ التعديلات
      </Button>
    </form>
  );
}
