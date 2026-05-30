import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useT } from "@/i18n/LanguageProvider";

export const Route = createFileRoute("/dashboard/orders/")({
  head: () => ({ meta: [{ title: "Orders - Botly" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const t = useT();
  return (
    <DashboardLayout title={t("orders.title")} subtitle={t("orders.subtitle")}>
      <EmptyState />
    </DashboardLayout>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
        <ShoppingBag className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">لا توجد طلبات حقيقية بعد</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        أول ما الزبائن يبدون يطلبون من البوت، راح تظهر الطلبات هنا.
      </p>
    </div>
  );
}
