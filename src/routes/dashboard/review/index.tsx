import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, MessageSquare, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  approveProduct,
  listMerchantLeads,
  listReviewProducts,
  rejectProduct,
  type ManagedProduct,
  type MerchantLead,
} from "@/lib/products.functions";
import { readMerchantSession } from "@/lib/merchantSession";

export const Route = createFileRoute("/dashboard/review/")({
  head: () => ({ meta: [{ title: "مراجعة المنتجات - Botly" }] }),
  component: ReviewPage,
});

function ReviewPage() {
  const navigate = useNavigate();
  const listReviewFn = useServerFn(listReviewProducts);
  const listLeadsFn = useServerFn(listMerchantLeads);
  const approveFn = useServerFn(approveProduct);
  const rejectFn = useServerFn(rejectProduct);

  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [leads, setLeads] = useState<MerchantLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const token = () => readMerchantSession()?.token ?? null;

  useEffect(() => {
    const t = token();
    if (!t) {
      navigate({ to: "/auth" });
      return;
    }
    Promise.all([listReviewFn({ data: { token: t } }), listLeadsFn({ data: { token: t } })])
      .then(([reviewProducts, merchantLeads]) => {
        setProducts(reviewProducts);
        setLeads(merchantLeads);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "تعذر تحميل البيانات");
      })
      .finally(() => setLoading(false));
  }, [listReviewFn, listLeadsFn, navigate]);

  const act = async (productId: string, action: "approve" | "reject") => {
    const t = token();
    if (!t) return;
    setBusyId(productId);
    try {
      if (action === "approve") await approveFn({ data: { token: t, productId } });
      else await rejectFn({ data: { token: t, productId } });
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      toast.success(action === "approve" ? "تمت الموافقة على المنتج" : "تم رفض المنتج");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تنفيذ العملية");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout
      title="مراجعة المنتجات والعملاء"
      subtitle="راجع المنتجات المستوردة وتابع طلبات الزبائن"
    >
      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground shadow-soft">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-3 text-sm">جاري التحميل...</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Pending review products */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">منتجات بحاجة لمراجعة ({products.length})</h3>
            </div>
            {products.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                لا توجد منتجات بحاجة لمراجعة. كل المنتجات المستوردة واضحة.
              </div>
            ) : (
              <div className="space-y-3">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center gap-4 rounded-lg border border-border p-3"
                  >
                    {product.imageUrl ? (
                      <div
                        className="h-14 w-14 shrink-0 rounded-lg bg-secondary bg-cover bg-center"
                        style={{ backgroundImage: `url(${product.imageUrl})` }}
                      />
                    ) : (
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-secondary text-xs text-muted-foreground">
                        لا صورة
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{product.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {product.price ? `${product.price} ${product.currency}` : "بدون سعر"}
                        {product.confidenceScore !== null && (
                          <span className="ms-2">
                            • الثقة {Math.round(product.confidenceScore * 100)}%
                          </span>
                        )}
                        <span className="ms-2">• {product.source}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="gap-1"
                        disabled={busyId === product.id}
                        onClick={() => act(product.id, "approve")}
                      >
                        {busyId === product.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        موافقة
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={busyId === product.id}
                        onClick={() => act(product.id, "reject")}
                      >
                        <X className="h-4 w-4" />
                        رفض
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Leads */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">طلبات الزبائن ({leads.length})</h3>
            </div>
            {leads.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                لا توجد طلبات بعد.
              </div>
            ) : (
              <div className="space-y-3">
                {leads.slice(0, 20).map((lead) => (
                  <div key={lead.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="font-medium">{lead.matchedTitle || "منتج"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      طلب: {lead.customerQuery}
                    </div>
                    {lead.customerNumber && (
                      <div className="mt-1 text-xs" dir="ltr">
                        {lead.customerNumber}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
