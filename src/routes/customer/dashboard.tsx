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
  ShoppingCart,
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
import { CAR_MAKES, CAR_COLORS, findMakeByLabel } from "@/lib/car-data";
import {
  browseCarProducts,
  createWebOrder,
  getMediatorPhone,
  listCustomerOrders,
  markOrderReceived,
  updateCustomerProfile,
  type CustomerOrder,
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

type TabKey = "shop" | "orders" | "profile";

// wa.me links need digits only (international format, no +).
function toWhatsAppLink(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^0/, "964");
  return `https://wa.me/${digits}`;
}

function orderStatusLabel(status: string) {
  switch (status) {
    case "received_by_customer":
      return { text: "تم الاستلام ✅", variant: "success" as const };
    case "confirmed_by_merchant":
      return { text: "تم تأكيد الطلب", variant: "primary" as const };
    case "out_of_stock":
      return { text: "المنتج منتهي", variant: "destructive" as const };
    default:
      return { text: "قيد المعالجة", variant: "secondary" as const };
  }
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
              { key: "orders", icon: Package, label: "طلباتي" },
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
        {tab === "shop" && <ShopTab customerWhatsapp={customer.whatsapp} />}
        {tab === "orders" && <OrdersTab customerWhatsapp={customer.whatsapp} />}
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

function ShopTab({ customerWhatsapp }: { customerWhatsapp: string }) {
  const browseFn = useServerFn(browseCarProducts);
  const orderFn = useServerFn(createWebOrder);
  const [carMake, setCarMake] = useState("");
  const [carModel, setCarModel] = useState("");
  const [color, setColor] = useState("");
  const [products, setProducts] = useState<CustomerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [orderingId, setOrderingId] = useState<string | null>(null);
  const [orderConfirm, setOrderConfirm] = useState<CustomerProduct | null>(null);

  const selectedMake = findMakeByLabel(carMake);

  const search = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const results = await browseFn({
        data: { carMake, carModel, color },
      });
      setProducts(results);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل المنتجات");
    } finally {
      setLoading(false);
    }
  }, [browseFn, carMake, carModel, color]);

  const placeOrder = async (product: CustomerProduct) => {
    setOrderingId(product.id);
    try {
      await orderFn({ data: { whatsapp: customerWhatsapp, productId: product.id } });
      toast.success("تم إرسال طلبك ✅ راح يوصلك على عنوانك المحفوظ، وتكدر تتابع حالته من «طلباتي».");
      setOrderConfirm(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إرسال الطلب");
    } finally {
      setOrderingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-center gap-2 font-semibold">
          <Car className="h-5 w-5 text-primary" />
          دور على قطع سيارتك
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
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
                {CAR_MAKES.map((make) => (
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
                {CAR_COLORS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
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
                ordering={orderingId === product.id}
                onOrder={() => setOrderConfirm(product)}
              />
            ))}
          </div>
        </>
      )}

      {/* Order confirmation dialog */}
      {orderConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-elevated">
            <h2 className="text-lg font-semibold">تأكيد الطلب</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              تريد تطلب «{orderConfirm.title}» بسعر{" "}
              <span className="font-bold text-foreground">
                {orderConfirm.price.toLocaleString()} {orderConfirm.currency}
              </span>
              ؟ الطلب راح يرتبط بعنوانك المحفوظ.
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setOrderConfirm(null)}>
                إلغاء
              </Button>
              <Button
                className="flex-1 gap-2"
                disabled={orderingId === orderConfirm.id}
                onClick={() => placeOrder(orderConfirm)}
              >
                {orderingId === orderConfirm.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShoppingCart className="h-4 w-4" />
                )}
                اطلب الآن
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Product card with a multi-image gallery. Shows specs + the FINAL price only —
// deliberately no merchant name, address or phone.
function ProductCard({
  product,
  ordering,
  onOrder,
}: {
  product: CustomerProduct;
  ordering: boolean;
  onOrder: () => void;
}) {
  const [imageIndex, setImageIndex] = useState(0);
  const images = product.imageUrls;
  const specs = [product.carMake, product.carModel, product.color, product.size].filter(Boolean);

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
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="text-lg font-bold">{product.price.toLocaleString()}</span>
          <span className="text-xs text-muted-foreground">{product.currency}</span>
        </div>
        <Button className="mt-3 w-full gap-2" size="sm" disabled={ordering} onClick={onOrder}>
          {ordering ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
          اطلب الآن
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orders: track status + confirm receipt ("تم")
// ---------------------------------------------------------------------------

function OrdersTab({ customerWhatsapp }: { customerWhatsapp: string }) {
  const listOrdersFn = useServerFn(listCustomerOrders);
  const markReceivedFn = useServerFn(markOrderReceived);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listOrdersFn({ data: { whatsapp: customerWhatsapp } })
      .then(setOrders)
      .catch(() => toast.error("تعذر تحميل الطلبات"))
      .finally(() => setLoading(false));
  }, [listOrdersFn, customerWhatsapp]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmReceived = async (orderId: string) => {
    setConfirmingId(orderId);
    try {
      await markReceivedFn({ data: { whatsapp: customerWhatsapp, orderId } });
      toast.success("تم تأكيد الاستلام ✅ شكراً إلك!");
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر التأكيد");
    } finally {
      setConfirmingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground shadow-soft">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        <p className="mt-3 text-sm">جاري تحميل طلباتك...</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
        <Package className="mx-auto h-10 w-10" />
        <p className="mt-3 text-sm">ما عندك طلبات بعد. دور على قطع سيارتك من «تسوق القطع».</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const status = orderStatusLabel(order.status);
        const received = order.status === "received_by_customer";
        return (
          <div
            key={order.orderId}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <h3 className="font-semibold">{order.productTitle}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {order.productPrice ? `${order.productPrice.toLocaleString()} ${order.currency} · ` : ""}
                {new Date(order.createdAt).toLocaleDateString("ar-IQ")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant={status.variant === "destructive" ? "destructive" : "secondary"}
                className={
                  status.variant === "success"
                    ? "border-success/30 bg-success/15 text-success"
                    : status.variant === "primary"
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : undefined
                }
              >
                {status.text}
              </Badge>
              {!received && order.status !== "out_of_stock" && (
                <Button
                  size="sm"
                  className="gap-2"
                  disabled={confirmingId === order.orderId}
                  onClick={() => confirmReceived(order.orderId)}
                >
                  {confirmingId === order.orderId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "✅"
                  )}
                  تم الاستلام
                </Button>
              )}
            </div>
          </div>
        );
      })}
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
