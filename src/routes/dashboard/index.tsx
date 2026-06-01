import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  CheckCircle2,
  Instagram,
  Loader2,
  Package,
  Search,
  ShoppingBag,
  TrendingUp,
  Truck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useT } from "@/i18n/LanguageProvider";
import {
  getMerchantDashboard,
  updateMerchantProfile,
  type MerchantDashboard,
} from "@/lib/merchant.functions";
import {
  getMetaConnectUrl,
  getMetaStatus,
  listMetaConnections,
  type MetaConnectionView,
} from "@/lib/meta.functions";
import { readMerchantSession, writeMerchantSession } from "@/lib/merchantSession";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({ meta: [{ title: "Dashboard - Botly" }] }),
  component: DashboardHome,
});

function DashboardHome() {
  const t = useT();
  const navigate = useNavigate();
  const getMerchantDashboardFn = useServerFn(getMerchantDashboard);
  const updateMerchantProfileFn = useServerFn(updateMerchantProfile);
  const getMetaConnectUrlFn = useServerFn(getMetaConnectUrl);
  const getMetaStatusFn = useServerFn(getMetaStatus);
  const listMetaConnectionsFn = useServerFn(listMetaConnections);
  const [dashboard, setDashboard] = useState<MerchantDashboard | null>(null);
  const [deliveryWhatsapp, setDeliveryWhatsapp] = useState("");
  const [loading, setLoading] = useState(true);
  const [metaConfigured, setMetaConfigured] = useState(false);
  const [metaConnections, setMetaConnections] = useState<MetaConnectionView[]>([]);
  const [connectingMeta, setConnectingMeta] = useState(false);

  useEffect(() => {
    const merchantSession = readMerchantSession();
    if (!merchantSession?.token) {
      navigate({ to: "/auth" });
      return;
    }

    getMerchantDashboardFn({ data: { token: merchantSession.token } })
      .then((nextDashboard) => {
        setDashboard(nextDashboard);
        setDeliveryWhatsapp(nextDashboard.profile.deliveryPhone ?? "");
        writeMerchantSession({
          merchantId: nextDashboard.profile.id,
          storeName: nextDashboard.profile.storeName,
          whatsapp: nextDashboard.profile.whatsapp,
          email: nextDashboard.profile.email,
          bio: nextDashboard.profile.bio,
          deliveryPhone: nextDashboard.profile.deliveryPhone,
        });
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "سجل دخول مرة ثانية");
        navigate({ to: "/auth" });
      })
      .finally(() => setLoading(false));

    // Load Meta (Instagram/Facebook) connection status.
    getMetaStatusFn()
      .then((status) => setMetaConfigured(status.configured))
      .catch(() => setMetaConfigured(false));

    listMetaConnectionsFn({ data: { token: merchantSession.token } })
      .then((connections) => setMetaConnections(connections))
      .catch(() => setMetaConnections([]));

    // Surface the OAuth callback result (?meta=connected|error).
    const params = new URLSearchParams(window.location.search);
    const metaResult = params.get("meta");
    if (metaResult === "connected") {
      toast.success("تم ربط حساب انستغرام/فيسبوك بنجاح. جاري استيراد منشوراتك.");
    } else if (metaResult === "error") {
      toast.error("تعذر ربط الحساب. حاول مرة ثانية.");
    }
  }, [getMerchantDashboardFn, getMetaStatusFn, listMetaConnectionsFn, navigate]);

  const connectMeta = async () => {
    const merchantSession = readMerchantSession();
    if (!merchantSession?.token) {
      navigate({ to: "/auth" });
      return;
    }
    setConnectingMeta(true);
    try {
      const { url } = await getMetaConnectUrlFn({ data: { token: merchantSession.token } });
      window.location.href = url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر بدء ربط الحساب");
      setConnectingMeta(false);
    }
  };

  const saveDeliveryWhatsapp = async () => {
    const merchantSession = readMerchantSession();
    if (!merchantSession?.token || !dashboard) {
      navigate({ to: "/auth" });
      return;
    }

    try {
      const profile = await updateMerchantProfileFn({
        data: {
          token: merchantSession.token,
          storeName: dashboard.profile.storeName,
          whatsapp: dashboard.profile.whatsapp,
          bio: dashboard.profile.bio ?? "",
          deliveryPhone: deliveryWhatsapp.trim(),
          logoUrl: dashboard.profile.logoUrl ?? "",
          coverUrl: dashboard.profile.coverUrl ?? "",
        },
      });
      setDashboard({ ...dashboard, profile });
      writeMerchantSession({ deliveryPhone: profile.deliveryPhone });
      toast.success("تم حفظ رقم واتساب شركة التوصيل");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ رقم التوصيل");
    }
  };

  const stats = dashboard?.stats ?? { products: 0, searches: 0, orders: 0, completion: 0 };
  const recentProducts = dashboard?.products.slice(0, 4) ?? [];

  return (
    <DashboardLayout
      title={t("dashboard.greeting", { name: dashboard?.profile.storeName ?? "" })}
      subtitle={t("dashboard.subtitle")}
    >
      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground shadow-soft">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-3 text-sm">جاري تحميل بيانات متجرك...</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Package} label={t("dashboard.stat.products")} value={stats.products} />
            <StatCard icon={Search} label={t("dashboard.stat.searches")} value={stats.searches} />
            <StatCard icon={ShoppingBag} label={t("dashboard.stat.leads")} value={stats.orders} />
            <StatCard
              icon={TrendingUp}
              label={t("dashboard.stat.completion")}
              value={`${stats.completion}%`}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">{t("dashboard.recent.title")}</h3>
                <Button asChild variant="ghost" size="sm" className="gap-1">
                  <Link to="/dashboard/products">
                    {t("common.view")}
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="divide-y divide-border">
                {recentProducts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    لا توجد منتجات بعد. أضف أول منتج حتى يظهر هنا.
                  </div>
                ) : (
                  recentProducts.map((product) => (
                    <div key={product.id} className="flex items-center gap-4 py-3">
                      <div
                        className="h-12 w-12 shrink-0 rounded-lg bg-secondary bg-cover bg-center"
                        style={{ backgroundImage: `url(${product.imageUrl})` }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{product.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {product.color || product.size || "منتج"}
                        </div>
                      </div>
                      <div className="text-sm font-semibold">
                        {product.discountPrice ?? product.currentPrice} {product.currency}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                <div className="mb-3 flex items-center gap-2">
                  <Instagram className="h-5 w-5 text-primary" />
                  <div className="font-semibold">ربط انستغرام / فيسبوك</div>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                  اربط حسابك التجاري وخلّي Botly يحوّل منشوراتك تلقائياً لمنتجات قابلة للبحث. استمر
                  بالنشر الطبيعي على حساباتك.
                </p>

                {metaConnections.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {metaConnections.map((conn, index) => (
                      <div
                        key={`${conn.platform}-${index}`}
                        className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          {conn.instagramUsername || conn.facebookPageName || conn.platform}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {conn.status === "active" ? "مفعّل" : conn.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  type="button"
                  className="w-full gap-2"
                  onClick={connectMeta}
                  disabled={!metaConfigured || connectingMeta}
                >
                  {connectingMeta ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Instagram className="h-4 w-4" />
                  )}
                  {metaConnections.length > 0 ? "ربط حساب إضافي" : "ربط انستغرام / فيسبوك"}
                </Button>
                {!metaConfigured && (
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    الميزة قيد التفعيل حالياً.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                <div className="mb-3 flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  <div className="font-semibold">واتساب شركة التوصيل</div>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                  اختياري، ويستخدم لاحقاً لإرسال الطلبات لشركة التوصيل.
                </p>
                <div className="space-y-3">
                  <Input
                    value={deliveryWhatsapp}
                    onChange={(e) => setDeliveryWhatsapp(e.target.value)}
                    placeholder="07XX XXX XXXX"
                    dir="ltr"
                    className="h-11 text-start"
                  />
                  <Button type="button" className="w-full" onClick={saveDeliveryWhatsapp}>
                    ربط رقم التوصيل
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <div className="font-semibold">{t("dashboard.completion.title")}</div>
                </div>
                <p className="text-sm text-muted-foreground">{t("dashboard.completion.desc")}</p>
                <div className="mt-4">
                  <Progress value={stats.completion} />
                  <div className="mt-2 text-xs text-muted-foreground">{stats.completion}%</div>
                </div>
                <Button asChild size="sm" className="mt-4 w-full">
                  <Link to="/dashboard/store">{t("store.title")}</Link>
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-4 text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
