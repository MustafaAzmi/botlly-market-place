import { createFileRoute, Link } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useT } from "@/i18n/LanguageProvider";
import { dashboardStats, demoMerchant, demoProducts } from "@/lib/mockData";
import {
  Package,
  Search,
  ShoppingBag,
  TrendingUp,
  ArrowUpRight,
  CheckCircle2,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({ meta: [{ title: "Dashboard — Botly" }] }),
  component: DashboardHome,
});

function DashboardHome() {
  const t = useT();
  const [deliveryWhatsapp, setDeliveryWhatsapp] = useState(demoMerchant.deliveryPhone);

  const saveDeliveryWhatsapp = () => {
    // TODO(delivery): persist delivery WhatsApp on merchant profile.
    toast.success("تم حفظ رقم واتساب شركة التوصيل");
  };

  return (
    <DashboardLayout
      title={t("dashboard.greeting", { name: demoMerchant.storeName })}
      subtitle={t("dashboard.subtitle")}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Package}
          label={t("dashboard.stat.products")}
          value={dashboardStats.products}
          trend="+12%"
        />
        <StatCard
          icon={Search}
          label={t("dashboard.stat.searches")}
          value={dashboardStats.searches}
          trend="+38%"
        />
        <StatCard
          icon={ShoppingBag}
          label={t("dashboard.stat.leads")}
          value={dashboardStats.leads}
          trend="+7%"
        />
        <StatCard
          icon={TrendingUp}
          label={t("dashboard.stat.completion")}
          value={`${dashboardStats.completion}%`}
          trend=""
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Recent products */}
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
            {demoProducts.slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center gap-4 py-3">
                <div
                  className="h-12 w-12 shrink-0 rounded-lg bg-secondary bg-cover bg-center"
                  style={{ backgroundImage: `url(${p.image})` }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{p.category}</div>
                </div>
                <div className="text-sm font-semibold">
                  {p.discountPrice ?? p.price} {p.currency}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Side widgets */}
        <div className="space-y-6">
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

          {/* Completion */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <div className="font-semibold">{t("dashboard.completion.title")}</div>
            </div>
            <p className="text-sm text-muted-foreground">{t("dashboard.completion.desc")}</p>
            <div className="mt-4">
              <Progress value={dashboardStats.completion} />
              <div className="mt-2 text-xs text-muted-foreground">{dashboardStats.completion}%</div>
            </div>
            <Button asChild size="sm" className="mt-4 w-full">
              <Link to="/dashboard/store">{t("store.title")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  trend?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
          <Icon className="h-5 w-5" />
        </span>
        {trend && <span className="text-xs font-medium text-success">{trend}</span>}
      </div>
      <div className="mt-4 text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
