import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  CheckCircle2,
  Download,
  Loader2,
  Package,
  ReceiptText,
  Search,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useT } from "@/i18n/LanguageProvider";
import { getMerchantDashboard, type MerchantDashboard } from "@/lib/merchant.functions";
import { readMerchantSession, writeMerchantSession } from "@/lib/merchantSession";
import { pwaHeadLinks, pwaHeadMeta } from "@/lib/pwa";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [{ title: "Dashboard - Botly" }, ...pwaHeadMeta("merchant")],
    links: pwaHeadLinks("merchant"),
  }),
  component: DashboardHome,
});

function DashboardHome() {
  const t = useT();
  const navigate = useNavigate();
  const getMerchantDashboardFn = useServerFn(getMerchantDashboard);
  const [dashboard, setDashboard] = useState<MerchantDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const merchantSession = readMerchantSession();
    if (!merchantSession?.token) {
      navigate({ to: "/auth" });
      return;
    }
    getMerchantDashboardFn({ data: { token: merchantSession.token } })
      .then((nextDashboard) => {
        setDashboard(nextDashboard);
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
  }, [getMerchantDashboardFn, navigate]);

  const stats = dashboard?.stats ?? { products: 0, searches: 0, orders: 0, sales: 0, completion: 0 };
  const recentProducts = dashboard?.products.slice(0, 4) ?? [];
  const salesReport = dashboard?.salesReport;

  const downloadSalesExcel = () => {
    if (!dashboard || !salesReport) return;
    const rows = salesReport.sales
      .map(
        (sale) => `
          <tr>
            <td>${excelCell(sale.orderId)}</td>
            <td>${excelCell(sale.productTitle)}</td>
            <td>${excelCell(sale.price)}</td>
            <td>${excelCell(sale.currency)}</td>
            <td>${excelCell(sale.createdAt)}</td>
          </tr>`,
      )
      .join("");
    const totalRows = salesReport.salesTotals
      .map(
        (total) => `
          <tr>
            <td>${excelCell(total.currency)}</td>
            <td>${excelCell(total.amount)}</td>
          </tr>`,
      )
      .join("");
    const html = `
      <html dir="rtl">
        <head><meta charset="utf-8" /></head>
        <body>
          <h2>تقرير مبيعات التاجر: ${excelCell(dashboard.profile.storeName)}</h2>
          <p>عدد المبيعات الكلي: ${excelCell(salesReport.salesCount)}</p>
          <h3>الإجمالي حسب العملة</h3>
          <table border="1">
            <thead><tr><th>العملة</th><th>الإجمالي</th></tr></thead>
            <tbody>${totalRows}</tbody>
          </table>
          <h3>تفاصيل المبيعات</h3>
          <table border="1">
            <thead>
              <tr>
                <th>رقم الطلب</th>
                <th>المنتج</th>
                <th>السعر</th>
                <th>العملة</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `botly-my-sales-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

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
            <StatCard icon={ReceiptText} label="المبيعات" value={stats.sales} />
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
              {/* Delivery company linking hidden from merchants for now —
                  delivery companies are managed by the admin (/admin/delivery). */}
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

          <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">سجل المبيعات</h3>
                <p className="text-sm text-muted-foreground">
                  عدد المبيعات: {salesReport?.salesCount ?? 0}
                  {salesReport?.salesTotals.length
                    ? ` - الإجمالي: ${salesReport.salesTotals
                        .map((total) => `${total.amount.toLocaleString()} ${total.currency}`)
                        .join(" / ")}`
                    : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={downloadSalesExcel}
                disabled={!salesReport || salesReport.salesCount === 0}
              >
                <Download className="h-4 w-4" />
                تنزيل Excel
              </Button>
            </div>
            {!salesReport || salesReport.sales.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                لا توجد مبيعات مؤكدة بعد. تظهر هنا فقط الطلبات التي يؤكد الزبون أنها تم شراؤها.
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-secondary/60">
                    <tr>
                      <th className="px-3 py-2 text-right">المنتج</th>
                      <th className="px-3 py-2 text-right">السعر</th>
                      <th className="px-3 py-2 text-right">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesReport.sales.map((sale) => (
                      <tr key={sale.orderId} className="border-b">
                        <td className="px-3 py-2 font-medium">{sale.productTitle}</td>
                        <td className="px-3 py-2" dir="ltr">
                          {sale.price.toLocaleString()} {sale.currency}
                        </td>
                        <td className="px-3 py-2" dir="ltr">
                          {sale.createdAt ? new Date(sale.createdAt).toLocaleString("ar-IQ") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

function excelCell(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
