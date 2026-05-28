import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useT } from "@/i18n/LanguageProvider";
import { demoOrders, type Order } from "@/lib/mockData";
import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, MoreHorizontal, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/dashboard/orders/")({
  head: () => ({ meta: [{ title: "Orders — Botly" }] }),
  component: OrdersPage,
});

const statusStyles: Record<Order["status"], string> = {
  new: "bg-info/15 text-info border-info/30",
  merchant_notified: "bg-warning/15 text-warning border-warning/30",
  delivery_notified: "bg-primary-soft text-primary border-primary/30",
  completed: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

function OrdersPage() {
  const t = useT();
  return (
    <DashboardLayout title={t("orders.title")} subtitle={t("orders.subtitle")}>
      {demoOrders.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <Th>{t("orders.customer")}</Th>
                  <Th>{t("orders.product")}</Th>
                  <Th>{t("orders.qty")}</Th>
                  <Th>{t("orders.delivery")}</Th>
                  <Th>{t("orders.status")}</Th>
                  <Th>{t("orders.date")}</Th>
                  <Th><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {demoOrders.map((o) => (
                  <tr key={o.id} className="transition-colors hover:bg-secondary/30">
                    <Td>
                      <div className="font-medium">{o.customerName}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground" dir="ltr">{o.customerPhone}</div>
                    </Td>
                    <Td>{o.productTitle}</Td>
                    <Td>{o.quantity}</Td>
                    <Td>{o.deliveryCompany}</Td>
                    <Td>
                      <Badge variant="outline" className={statusStyles[o.status]}>
                        {t(`orders.status.${o.status}` as never)}
                      </Badge>
                    </Td>
                    <Td className="text-xs text-muted-foreground">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </Td>
                    <Td>
                      <button className="rounded p-1 text-muted-foreground hover:bg-secondary">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-border md:hidden">
            {demoOrders.map((o) => (
              <div key={o.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{o.customerName}</div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground" dir="ltr">
                      <Phone className="h-3 w-3" /> {o.customerPhone}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {o.customerLocation}
                    </div>
                  </div>
                  <Badge variant="outline" className={statusStyles[o.status]}>
                    {t(`orders.status.${o.status}` as never)}
                  </Badge>
                </div>
                <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="text-sm font-medium">{o.productTitle}</div>
                  <div className="text-xs text-muted-foreground">×{o.quantity} · {o.deliveryCompany}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-start font-medium">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-4 align-middle ${className ?? ""}`}>{children}</td>;
}

function EmptyState() {
  const t = useT();
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
        <ShoppingBag className="h-7 w-7" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{t("orders.empty")}</p>
    </div>
  );
}
