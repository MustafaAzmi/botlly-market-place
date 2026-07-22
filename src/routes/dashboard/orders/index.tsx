import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShoppingBag, Truck, Store, BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { WebOrderNotifications } from "@/components/orders/WebOrderNotifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LanguageProvider";
import { listMerchantOrders, type MerchantOrder } from "@/lib/merchant.functions";
import { readMerchantSession } from "@/lib/merchantSession";

export const Route = createFileRoute("/dashboard/orders/")({
  head: () => ({ meta: [{ title: "Orders - Botly" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const t = useT();
  const navigate = useNavigate();
  const listMerchantOrdersFn = useServerFn(listMerchantOrders);
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [merchantToken, setMerchantToken] = useState("");

  useEffect(() => {
    const merchantSession = readMerchantSession();
    if (!merchantSession?.token) {
      navigate({ to: "/auth" });
      return;
    }
    setMerchantToken(merchantSession.token);

    listMerchantOrdersFn({ data: { token: merchantSession.token, page, limit: 20 } })
      .then((result) => {
        setOrders(result.items);
        setHasMore(result.hasMore);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "تعذر تحميل الطلبات");
      })
      .finally(() => setLoading(false));
  }, [listMerchantOrdersFn, navigate, page]);

  return (
    <DashboardLayout title={t("orders.title")} subtitle={t("orders.subtitle")}>
      {merchantToken ? (
        <div className="mb-6">
          <WebOrderNotifications
            role="merchant"
            token={merchantToken}
          />
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground shadow-soft">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-3 text-sm">جاري تحميل الطلبات...</p>
        </div>
      ) : orders.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
      <div className="mt-5 flex items-center justify-center gap-3">
        <Button type="button" variant="outline" disabled={loading || page <= 1} onClick={() => { setLoading(true); setPage((value) => value - 1); }}>
          السابق
        </Button>
        <span className="text-sm text-muted-foreground">{page}</span>
        <Button type="button" variant="outline" disabled={loading || !hasMore} onClick={() => { setLoading(true); setPage((value) => value + 1); }}>
          التالي
        </Button>
      </div>
    </DashboardLayout>
  );
}

function formatOrderDate(iso: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ar-IQ", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function statusBadge(order: MerchantOrder) {
  if (order.status === "sent_to_delivery") {
    return (
      <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <Truck className="h-3.5 w-3.5" />
        تم التحويل لشركة التوصيل
      </Badge>
    );
  }
  if (order.status === "sent_to_merchant") {
    return (
      <Badge className="gap-1 bg-sky-100 text-sky-700 hover:bg-sky-100">
        <Store className="h-3.5 w-3.5" />
        أُرسل لك مباشرة
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <BellRing className="h-3.5 w-3.5" />
      تعذر إرسال الإشعار
    </Badge>
  );
}

function OrderCard({ order }: { order: MerchantOrder }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{order.productTitle}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.productPrice ? `${order.productPrice} ${order.currency}` : "بدون سعر معلن"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {statusBadge(order)}
          <span className="text-xs text-muted-foreground">{formatOrderDate(order.createdAt)}</span>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-secondary/60 p-4 text-sm text-muted-foreground">
        Customer details are held by the mediator only. Follow this order through mediator messages.
      </div>
    </div>
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
