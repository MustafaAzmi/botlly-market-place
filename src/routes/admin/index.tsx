import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  PackageSearch,
  PhoneCall,
  RotateCcw,
  ShoppingBag,
  Store,
  Users,
  Wrench,
  Download,
} from "lucide-react";
import { useMemo, useState } from "react";
import type React from "react";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAdminOverview, resetAdminOrderCounter } from "@/lib/admin.functions";
import { requireAdminClient } from "@/lib/adminGuard";
import { readAdminSession } from "@/lib/adminSession";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "نظرة عامة - Botly Admin" }] }),
  component: AdminDashboard,
});

type CurrencySales = {
  currency: string;
  orders: number;
  grossSales: number;
  currentPrice: number;
  fitterCommission: number;
  netProfit: number;
};

function money(value: number, currency: string) {
  return `${Math.round(value).toLocaleString("ar-IQ")} ${currency}`;
}

function excelCell(value: string | number) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function AdminDashboard() {
  const session = readAdminSession();
  const overviewFn = useServerFn(getAdminOverview);
  const resetOrderCounterFn = useServerFn(resetAdminOrderCounter);
  const queryClient = useQueryClient();
  const [governorate, setGovernorate] = useState("all");
  const [resetting, setResetting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () =>
      session?.token ? overviewFn({ data: { token: session.token } }) : null,
    enabled: Boolean(session?.token),
    retry: 1,
  });

  const governorates = useMemo(() => {
    const names = data?.byGovernorate.map((row) => row.governorate).filter(Boolean) ?? [];
    return [...new Set(names)];
  }, [data]);

  const selectedRows = useMemo(() => {
    if (!data) return [];
    return governorate === "all"
      ? data.byGovernorate
      : data.byGovernorate.filter((row) => row.governorate === governorate);
  }, [data, governorate]);

  const selectedCurrencySales = useMemo(() => {
    const byCurrency = new Map<string, CurrencySales>();
    for (const row of selectedRows) {
      const current = byCurrency.get(row.currency) ?? {
        currency: row.currency,
        orders: 0,
        grossSales: 0,
        currentPrice: 0,
        fitterCommission: 0,
        netProfit: 0,
      };
      current.orders += row.orders;
      current.grossSales += row.grossSales;
      current.currentPrice += row.currentPrice;
      current.fitterCommission += row.fitterCommission;
      current.netProfit += row.netProfit;
      byCurrency.set(row.currency, current);
    }
    return [...byCurrency.values()].sort((a, b) => b.netProfit - a.netProfit);
  }, [selectedRows]);

  const totalOrders = selectedRows.reduce((sum, row) => sum + row.orders, 0);

  const resetOrderCounter = async () => {
    if (!session?.token) {
      toast.error("انتهت جلسة الأدمن. سجل الدخول مرة ثانية.");
      return;
    }
    setResetting(true);
    try {
      await resetOrderCounterFn({ data: { token: session.token } });
      await queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      toast.success("تم تصفير عداد الطلبات");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تصفير عداد الطلبات");
    } finally {
      setResetting(false);
    }
  };

  const downloadSalesExcel = () => {
    const currencyRows = selectedCurrencySales
      .map(
        (row) => `
          <tr>
            <td>${excelCell(row.currency)}</td>
            <td>${excelCell(row.orders)}</td>
            <td>${excelCell(row.grossSales)}</td>
            <td>${excelCell(row.currentPrice)}</td>
            <td>${excelCell(row.fitterCommission)}</td>
            <td>${excelCell(row.netProfit)}</td>
          </tr>`,
      )
      .join("");
    const governorateRows = selectedRows
      .map(
        (row) => `
          <tr>
            <td>${excelCell(row.governorate)}</td>
            <td>${excelCell(row.currency)}</td>
            <td>${excelCell(row.orders)}</td>
            <td>${excelCell(row.grossSales)}</td>
            <td>${excelCell(row.currentPrice)}</td>
            <td>${excelCell(row.fitterCommission)}</td>
            <td>${excelCell(row.netProfit)}</td>
          </tr>`,
      )
      .join("");
    const html = `
      <html dir="rtl">
        <head><meta charset="utf-8" /></head>
        <body>
          <h2>ملخص المبيعات حسب العملة</h2>
          <table border="1">
            <thead>
              <tr>
                <th>العملة</th>
                <th>الطلبات بعد التصفير</th>
                <th>إجمالي المبيعات</th>
                <th>السعر الحالي</th>
                <th>عمولة الفيتر</th>
                <th>صافي الربح</th>
              </tr>
            </thead>
            <tbody>${currencyRows}</tbody>
          </table>
          <h2>ملخص المبيعات حسب المحافظة والعملة</h2>
          <table border="1">
            <thead>
              <tr>
                <th>المحافظة</th>
                <th>العملة</th>
                <th>الطلبات بعد التصفير</th>
                <th>إجمالي المبيعات</th>
                <th>السعر الحالي</th>
                <th>عمولة الفيتر</th>
                <th>صافي الربح</th>
              </tr>
            </thead>
            <tbody>${governorateRows}</tbody>
          </table>
        </body>
      </html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `botly-sales-summary-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout
      title="نظرة عامة"
      subtitle="أرقام حقيقية محدثة من قاعدة البيانات للوسطاء، التجار، الزبائن، المنتجات، الفيتر، والمبيعات."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={downloadSalesExcel}
            disabled={!data}
          >
            <Download className="h-4 w-4" />
            تنزيل Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 text-destructive"
            onClick={resetOrderCounter}
            disabled={resetting || !data}
          >
            <RotateCcw className="h-4 w-4" />
            تصفير الطلبات
          </Button>
          <Select value={governorate} onValueChange={setGovernorate}>
            <SelectTrigger className="h-10 w-56">
              <SelectValue placeholder="فلترة حسب المحافظة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المحافظات</SelectItem>
              {governorates.map((city) => (
                <SelectItem key={city} value={city}>
                  {city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      {isLoading || !data ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground shadow-soft">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-3 text-sm">جاري تحميل بيانات النظرة العامة...</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <StatCard icon={PhoneCall} label="الوسطاء" value={data.totals.mediators} />
            <StatCard
              icon={Store}
              label="التجار"
              value={data.totals.merchants}
              hint={`${data.totals.visibleMerchants} ظاهر`}
            />
            <StatCard icon={Users} label="الزبائن" value={data.totals.customers} />
            <StatCard icon={PackageSearch} label="المنتجات" value={data.totals.products} />
            <StatCard icon={Wrench} label="فيتر" value={data.totals.fitters} />
            <StatCard icon={ShoppingBag} label="الطلبات" value={totalOrders} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {selectedCurrencySales.map((row) => (
              <CurrencyProfitCard key={row.currency} row={row} />
            ))}
            {selectedCurrencySales.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-soft">
                لا توجد مبيعات محتسبة لهذه الفلترة.
              </div>
            ) : null}
          </div>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">ملخص المبيعات حسب المحافظة والعملة</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  صافي الربح = السعر النهائي للمنتج ناقص السعر الحالي وعمولة الفيتر.
                  كل عملة محسوبة لوحدها، لذلك الدولار لا يختلط مع الدينار.
                </p>
              </div>
              <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
                {governorate === "all" ? "كل المحافظات" : governorate}
              </span>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-right text-muted-foreground">
                  <tr>
                    <Th>المحافظة</Th>
                    <Th>العملة</Th>
                    <Th>الطلبات</Th>
                    <Th>إجمالي المبيعات</Th>
                    <Th>السعر الحالي</Th>
                    <Th>عمولة الفيتر</Th>
                    <Th>صافي الربح</Th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.map((row) => (
                    <tr
                      key={`${row.governorate}-${row.currency}`}
                      className="border-b border-border/60 last:border-0"
                    >
                      <Td className="font-medium">{row.governorate}</Td>
                      <Td>{row.currency}</Td>
                      <Td>{row.orders.toLocaleString("ar-IQ")}</Td>
                      <Td>{money(row.grossSales, row.currency)}</Td>
                      <Td>{money(row.currentPrice, row.currency)}</Td>
                      <Td>{money(row.fitterCommission, row.currency)}</Td>
                      <Td className="font-semibold text-primary">
                        {money(row.netProfit, row.currency)}
                      </Td>
                    </tr>
                  ))}
                  {selectedRows.length === 0 ? (
                    <tr>
                      <Td className="py-8 text-center text-muted-foreground" colSpan={7}>
                        لا توجد مبيعات لهذه المحافظة حالياً.
                      </Td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="text-lg font-semibold">آخر الطلبات المحتسبة</h2>
            <div className="mt-4 divide-y divide-border">
              {data.recentOrders.map((order) => (
                <div
                  key={order.orderId}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-medium">{order.productTitle}</div>
                    <div className="text-xs text-muted-foreground">
                      {order.governorate} · {order.source === "fitter_site" ? "فيتر" : "زبون"} ·{" "}
                      {order.currency}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-primary">
                    {money(order.netProfit, order.currency)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <Icon className="h-5 w-5 text-primary" />
      <div className="mt-4 text-2xl font-bold">{value.toLocaleString("ar-IQ")}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      {hint ? <div className="mt-1 text-[11px] text-primary">{hint}</div> : null}
    </div>
  );
}

function CurrencyProfitCard({ row }: { row: CurrencySales }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">ملخص الربح حسب العملة</div>
          <div className="mt-1 text-xl font-semibold">{row.currency}</div>
        </div>
        <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
          {row.orders.toLocaleString("ar-IQ")} طلب
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MiniMoney label="إجمالي المبيعات" value={money(row.grossSales, row.currency)} />
        <MiniMoney label="السعر الحالي" value={money(row.currentPrice, row.currency)} />
        <MiniMoney label="عمولة الفيتر" value={money(row.fitterCommission, row.currency)} />
        <MiniMoney label="صافي الربح" value={money(row.netProfit, row.currency)} strong />
      </div>
    </div>
  );
}

function MiniMoney({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={strong ? "rounded-xl bg-primary-soft p-3" : "rounded-xl bg-secondary/60 p-3"}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={strong ? "mt-1 text-lg font-bold text-primary" : "mt-1 font-semibold"}>
        {value}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 text-xs font-medium">{children}</th>;
}

function Td({
  children,
  className = "",
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`whitespace-nowrap px-4 py-3 ${className}`}>
      {children}
    </td>
  );
}
