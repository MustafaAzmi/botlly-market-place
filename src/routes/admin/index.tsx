import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PackageSearch, PhoneCall, ShoppingBag, Store, Users, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import type React from "react";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAdminOverview } from "@/lib/admin.functions";
import { requireAdminClient } from "@/lib/adminGuard";
import { readAdminSession } from "@/lib/adminSession";

export const Route = createFileRoute("/admin/")({
  beforeLoad: () => requireAdminClient(),
  head: () => ({ meta: [{ title: "نظرة عامة - Botly Admin" }] }),
  component: AdminDashboard,
});

function money(value: number) {
  return `${Math.round(value).toLocaleString("ar-IQ")} IQD`;
}

function AdminDashboard() {
  const session = readAdminSession();
  const overviewFn = useServerFn(getAdminOverview);
  const [governorate, setGovernorate] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () =>
      session?.token
        ? overviewFn({ data: { token: session.token } })
        : null,
    enabled: Boolean(session?.token),
    retry: 1,
  });

  const governorates = useMemo(
    () => data?.byGovernorate.map((row) => row.governorate).filter(Boolean) ?? [],
    [data],
  );
  const selectedRows = useMemo(() => {
    if (!data) return [];
    return governorate === "all"
      ? data.byGovernorate
      : data.byGovernorate.filter((row) => row.governorate === governorate);
  }, [data, governorate]);

  const sales = selectedRows.reduce(
    (acc, row) => ({
      orders: acc.orders + row.orders,
      grossSales: acc.grossSales + row.grossSales,
      fitterCommission: acc.fitterCommission + row.fitterCommission,
      netProfit: acc.netProfit + row.netProfit,
    }),
    { orders: 0, grossSales: 0, fitterCommission: 0, netProfit: 0 },
  );

  return (
    <AdminLayout
      title="نظرة عامة"
      subtitle="أرقام حقيقية محدثة من قاعدة البيانات للوسطاء، التجار، الزبائن، المنتجات، الفيتر، والمبيعات."
      actions={
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
            <StatCard icon={Store} label="التجار" value={data.totals.merchants} hint={`${data.totals.visibleMerchants} ظاهر`} />
            <StatCard icon={Users} label="الزبائن" value={data.totals.customers} />
            <StatCard icon={PackageSearch} label="المنتجات" value={data.totals.products} />
            <StatCard icon={Wrench} label="فيتر" value={data.totals.fitters} />
            <StatCard icon={ShoppingBag} label="الطلبات" value={sales.orders} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <MoneyCard title="إجمالي المبيعات" value={money(sales.grossSales)} />
            <MoneyCard title="نسبة الفيتر المدفوعة" value={money(sales.fitterCommission)} />
            <MoneyCard title="صافي الربح" value={money(sales.netProfit)} highlight />
          </div>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">ملخص المبيعات حسب المحافظة</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  صافي الربح = السعر النهائي للمنتج ناقص السعر الحالي وعمولة الفيتر إن وجدت.
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
                    <Th>الطلبات</Th>
                    <Th>إجمالي المبيعات</Th>
                    <Th>عمولة الفيتر</Th>
                    <Th>صافي الربح</Th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.map((row) => (
                    <tr key={row.governorate} className="border-b border-border/60 last:border-0">
                      <Td className="font-medium">{row.governorate}</Td>
                      <Td>{row.orders.toLocaleString("ar-IQ")}</Td>
                      <Td>{money(row.grossSales)}</Td>
                      <Td>{money(row.fitterCommission)}</Td>
                      <Td className="font-semibold text-primary">{money(row.netProfit)}</Td>
                    </tr>
                  ))}
                  {selectedRows.length === 0 ? (
                    <tr>
                      <Td className="py-8 text-center text-muted-foreground" colSpan={5}>
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
                <div key={order.orderId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">{order.productTitle}</div>
                    <div className="text-xs text-muted-foreground">
                      {order.governorate} · {order.source === "fitter_site" ? "فيتر" : "زبون"}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-primary">{money(order.netProfit)}</div>
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

function MoneyCard({ title, value, highlight = false }: { title: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 shadow-soft ${highlight ? "border-primary/30 bg-primary-soft" : "border-border bg-card"}`}>
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-3 text-2xl font-bold">{value}</div>
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
