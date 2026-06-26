import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BellRing,
  Car,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogOut,
  MessageCircle,
  Package,
  Save,
  Search,
  Send,
  User,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";
import { WebNotificationCountBadge } from "@/components/orders/WebNotificationCountBadge";
import { Badge } from "@/components/ui/badge";
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
import { ALL_YEARS, type CarMake } from "@/lib/car-data";
import { useLanguage } from "@/i18n/LanguageProvider";
import {
  browseCarProducts,
  getMediatorPhone,
  getEnabledCarCatalogue,
  updateCustomerProfile,
  submitProductOrder,
  type CustomerProduct,
} from "@/lib/customer.functions";
import { submitMissingProductRequest } from "@/lib/missing-product.functions";
import {
  clearCustomerSession,
  readCustomerSession,
  writeCustomerSession,
} from "@/lib/customerSession";
import { IRAQI_GOVERNORATES } from "@/lib/governorates";
import { pwaHeadLinks, pwaHeadMeta } from "@/lib/pwa";

export const Route = createFileRoute("/customer/dashboard")({
  head: () => ({
    meta: [{ title: "Customer Dashboard - Botly" }, ...pwaHeadMeta("customer")],
    links: pwaHeadLinks("customer"),
  }),
  component: CustomerDashboard,
});

type TabKey = "shop" | "profile";

function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("اختر صورة فقط"));
      return;
    }
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
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// wa.me links need digits only (international format, no +).
function toWhatsAppLink(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^0/, "964");
  return `https://wa.me/${digits}`;
}

function CustomerDashboard() {
  const navigate = useNavigate();
  const { t } = useLanguage();
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
        <div className="container mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <Logo />
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <LanguageSwitcher />
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href="/customer/notifications">
                <BellRing className="h-4 w-4" />
                <WebNotificationCountBadge
                  role="requester"
                  requesterType="customer"
                  requesterPhone={customer.whatsapp}
                />
                الإشعارات
              </a>
            </Button>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              {t("customer.logout")}
            </Button>
          </div>
        </div>
        {/* Tabs */}
        <nav className="container mx-auto flex max-w-6xl gap-1 px-4 pb-2">
          {(
            [
              { key: "shop" as const, icon: Search, label: t("customer.tab.shop") },
              { key: "profile" as const, icon: User, label: t("customer.tab.profile") },
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
        {tab === "shop" && <ShopTab customer={customer} mediatorPhone={mediatorPhone} />}
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
          {t("customer.mediator.contact")}
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shop: car filters → products (specs + final price only, no merchant info)
// ---------------------------------------------------------------------------

function ShopTab({
  customer,
  mediatorPhone,
}: {
  customer: NonNullable<ReturnType<typeof readCustomerSession>>["customer"];
  mediatorPhone: string;
}) {
  const { t } = useLanguage();
  const browseFn = useServerFn(browseCarProducts);
  const missingRequestFn = useServerFn(submitMissingProductRequest);
  const getCatalogFn = useServerFn(getEnabledCarCatalogue);
  const [carMake, setCarMake] = useState("");
  const [carModel, setCarModel] = useState("");
  const [carYear, setCarYear] = useState("");
  const [color, setColor] = useState("");
  const [governorate, setGovernorate] = useState(customer.governorate);
  const [products, setProducts] = useState<CustomerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [makes, setMakes] = useState<CarMake[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [searchScope, setSearchScope] = useState<"governorate" | "all">("governorate");

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
        data: {
          carMake,
          carModel,
          carYear: carYear === ALL_YEARS ? "" : carYear,
          color,
          governorate,
          searchScope,
        },
      });
      setProducts(results);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.loading"));
    } finally {
      setLoading(false);
    }
  }, [browseFn, carMake, carModel, carYear, color, governorate, searchScope, t]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-center gap-2 font-semibold">
          <Car className="h-5 w-5 text-primary" />
          {t("customer.shop.title")}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2">
            <Label>المحافظة</Label>
            <Select value={governorate} onValueChange={setGovernorate}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="اختر المحافظة" />
              </SelectTrigger>
              <SelectContent>
                {IRAQI_GOVERNORATES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("customer.shop.carType")}</Label>
            <Select
              value={carMake}
              onValueChange={(value) => {
                setCarMake(value);
                setCarModel("");
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder={t("customer.shop.carType.placeholder")} />
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
            <Label>{t("customer.shop.model")}</Label>
            <Select value={carModel} onValueChange={setCarModel} disabled={!selectedMake}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder={selectedMake ? t("customer.shop.model.placeholder") : t("customer.shop.model.choose_first")} />
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
            <Label>{t("customer.shop.color")}</Label>
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder={t("customer.shop.color.placeholder")} />
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
            <Label>{t("customer.shop.year")}</Label>
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
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={searchScope === "governorate" ? "default" : "outline"}
            size="sm"
            onClick={() => setSearchScope("governorate")}
          >
            البحث داخل المحافظة
          </Button>
          <Button
            type="button"
            variant={searchScope === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setSearchScope("all")}
          >
            البحث في جميع المحافظات
          </Button>
        </div>
        <Button onClick={search} disabled={loading} size="lg" className="mt-4 w-full gap-2 sm:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t("customer.shop.search")}
        </Button>
      </div>

      {/* Results */}
      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground shadow-soft">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-3 text-sm">{t("customer.shop.loading")}</p>
        </div>
      ) : !searched ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
          <Car className="mx-auto h-10 w-10 text-primary" />
          <p className="mt-3 text-sm">{t("customer.shop.empty.desc")}</p>
        </div>
      ) : products.length === 0 ? (
        <MissingProductRequestPanel
          defaultProductName=""
          carMake={carMake}
          carModel={carModel}
          governorate={governorate}
          requesterName={customer.name}
          requesterPhone={customer.whatsapp}
          searchScope={searchScope}
          requesterType="customer"
          onSubmit={async (data) => missingRequestFn({ data })}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("customer.shop.results", { count: products.length })}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                mediatorPhone={mediatorPhone}
                customerName={customer.name}
                customerPhone={customer.whatsapp}
                customerGovernorate={customer.governorate}
                customerLandmark={customer.landmark}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MissingProductRequestPanel({
  defaultProductName,
  carMake,
  carModel,
  governorate,
  requesterName,
  requesterPhone,
  requesterType,
  searchScope,
  onSubmit,
}: {
  defaultProductName: string;
  carMake: string;
  carModel: string;
  governorate: string;
  requesterName: string;
  requesterPhone: string;
  requesterType: "customer" | "fitter";
  searchScope: "governorate" | "all";
  onSubmit: (data: {
    productName: string;
    requestDetails?: string;
    carMake: string;
    carModel: string;
    governorate: string;
    requesterType: "customer" | "fitter";
    requesterName: string;
    requesterPhone: string;
    searchScope: "governorate" | "all";
    imageDataUrl?: string;
  }) => Promise<{ targetMerchantCount: number; sentCount: number; webNotificationCount?: number }>;
}) {
  const [productName, setProductName] = useState(defaultProductName);
  const [requestDetails, setRequestDetails] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pickImage = async (file?: File) => {
    if (!file) return;
    try {
      setImageDataUrl(await compressImageFile(file));
      toast.success("تم اختيار الصورة");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر اختيار الصورة");
    }
  };

  const submit = async () => {
    const cleanName = productName.trim() || requestDetails.trim().slice(0, 120) || (imageDataUrl ? "طلب قطعة بصورة" : "");
    if (!cleanName) {
      toast.error("اكتب اسم المنتج المطلوب أولاً");
      return;
    }
    if (!carMake || !governorate) {
      toast.error("اختر نوع السيارة والمحافظة قبل إرسال الطلب");
      return;
    }
    setSubmitting(true);
    try {
      const result = await onSubmit({
        productName: cleanName,
        requestDetails: requestDetails.trim(),
        carMake,
        carModel: carModel || "غير محدد",
        governorate,
        requesterType,
        requesterName,
        requesterPhone,
        searchScope,
        imageDataUrl,
      });
      const notifiedCount = result.webNotificationCount ?? result.sentCount ?? result.targetMerchantCount;
      toast.success(
        notifiedCount > 0 || result.targetMerchantCount > 0
          ? `تم إرسال الطلب إلى ${notifiedCount || result.targetMerchantCount} تاجر مختص`
          : "تم حفظ الطلب، لكن لا يوجد تاجر مختص مطابق حالياً",
      );
      setProductName("");
      setRequestDetails("");
      setImageDataUrl("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إرسال الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-6 shadow-soft">
      <div className="text-center text-muted-foreground">
        <Package className="mx-auto h-10 w-10" />
        <p className="mx-auto mt-3 max-w-2xl text-sm">
          لم نعثر على المنتج المطلوب، يمكنك إرسال صورة للقطعة أو كتابة تفاصيل إضافية ليتم إرسال الطلب مباشرة إلى التجار المختصين.
        </p>
      </div>

      <div className="mx-auto mt-5 max-w-2xl space-y-4 text-start">
        <div className="space-y-2">
          <Label htmlFor="missing-product-name">اسم المنتج المطلوب</Label>
          <Input
            id="missing-product-name"
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
            placeholder="مثال: لايت أمامي، بمبر، مراية..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="missing-product-details">وصف إضافي للقطعة</Label>
          <Textarea
            id="missing-product-details"
            value={requestDetails}
            onChange={(event) => setRequestDetails(event.target.value)}
            placeholder="اكتب أي تفاصيل تساعد التاجر مثل الجهة، الرقم، الشكل، أو العطل..."
            rows={4}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary">
            التقاط صورة
            <input
              className="hidden"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => pickImage(event.target.files?.[0])}
            />
          </label>
          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary">
            اختيار من المعرض
            <input
              className="hidden"
              type="file"
              accept="image/*"
              onChange={(event) => pickImage(event.target.files?.[0])}
            />
          </label>
          <Button type="button" variant="outline" onClick={() => setImageDataUrl("")}>
            إرسال بدون صورة
          </Button>
        </div>

        {imageDataUrl && (
          <img src={imageDataUrl} alt="صورة القطعة المطلوبة" className="max-h-56 rounded-lg border object-contain" />
        )}

        <Button onClick={submit} disabled={submitting || !carMake || !governorate} className="w-full gap-2">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          إرسال الطلب للتجار المختصين
        </Button>
      </div>
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
  customerGovernorate,
  customerLandmark,
}: {
  product: CustomerProduct;
  mediatorPhone: string;
  customerName: string;
  customerPhone: string;
  customerGovernorate: string;
  customerLandmark: string;
}) {
  const { t } = useLanguage();
  const submitOrderFn = useServerFn(submitProductOrder);
  const [imageIndex, setImageIndex] = useState(0);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const images = product.imageUrls;
  const specs = [
    product.carYear ? `سنة الصنع: ${product.carYear}` : undefined,
    product.carModel ? `الموديل: ${product.carModel}` : undefined,
    product.color ? `اللون: ${product.color}` : undefined,
  ].filter(Boolean);

  const handleSubmitOrder = async () => {
    setSubmitting(true);
    try {
      // The merchant's phone is resolved on the SERVER from the product id —
      // it is never exposed to the customer's browser.
      const result = await submitOrderFn({
        data: {
          productId: product.id,
          customerName,
          customerPhone,
          customerGovernorate,
          customerLandmark,
        },
      });
      toast.success(result.message);
      setShowOrderForm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.loading"));
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
        {specs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {specs.map((spec) => (
              <Badge key={spec} variant="secondary" className="text-[10px]">
                {spec}
              </Badge>
            ))}
          </div>
        )}
        {(product.merchantGovernorate || product.deliveryEstimate) && (
          <p className="mt-2 text-xs text-muted-foreground">
            {product.merchantGovernorate ? `المحافظة: ${product.merchantGovernorate}` : ""}
            {product.deliveryEstimate ? ` · الوصول: ${product.deliveryEstimate}` : ""}
          </p>
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
          {t("customer.product.request")}
        </Button>

        {showOrderForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg">
              <h2 className="text-lg font-semibold">{t("customer.order.confirm")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t("customer.order.subtitle")}</p>

              <div className="mt-4 space-y-3 rounded-lg bg-secondary/50 p-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">{t("customer.order.product")}</div>
                  <div className="font-medium">{product.title}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("customer.order.price")}</div>
                  <div className="font-medium">
                    {product.price.toLocaleString()} {product.currency}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("customer.order.customer_data")}</div>
                  <div className="font-medium">{customerName}</div>
                  <div className="text-xs text-muted-foreground">{customerPhone}</div>
                  <div className="text-xs text-muted-foreground">{customerGovernorate}</div>
                  <div className="text-xs text-muted-foreground">{customerLandmark}</div>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowOrderForm(false)}
                  className="flex-1"
                >
                  {t("customer.order.cancel")}
                </Button>
                <Button
                  onClick={handleSubmitOrder}
                  disabled={submitting}
                  className="flex-1 gap-2"
                >
                  {submitting ? t("customer.order.submitting") : t("customer.order.submit")}
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
  const { t } = useLanguage();
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
      toast.success(t("customer.profile.save") + " ✅");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.loading"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
      <h2 className="font-semibold">{t("customer.profile.title")}</h2>
      <p className="text-xs text-muted-foreground">
        {t("customer.profile.desc")}
      </p>

      <div className="space-y-2">
        <Label>{t("customer.profile.whatsapp")}</Label>
        <Input dir="ltr" value={customer.whatsapp} disabled className="h-11 bg-secondary" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-name">{t("customer.profile.name")}</Label>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-landmark">{t("customer.profile.landmark")}</Label>
        <Input
          id="profile-landmark"
          value={landmark}
          onChange={(e) => setLandmark(e.target.value)}
          className="h-11"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-governorate">{t("customer.profile.governorate")}</Label>
        <Input
          id="profile-governorate"
          value={governorate}
          onChange={(e) => setGovernorate(e.target.value)}
          className="h-11"
        />
      </div>

      <Button type="submit" disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {t("customer.profile.save")}
      </Button>
    </form>
  );
}
