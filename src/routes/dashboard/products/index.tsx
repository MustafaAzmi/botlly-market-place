import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Package, Plus, Search, Edit2, Video, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/LanguageProvider";
import { listMerchantProducts, deleteMerchantProduct, type MerchantProduct } from "@/lib/merchant.functions";
import { readMerchantSession } from "@/lib/merchantSession";

export const Route = createFileRoute("/dashboard/products/")({
  head: () => ({ meta: [{ title: "Products - Botly" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const t = useT();
  const navigate = useNavigate();
  const listMerchantProductsFn = useServerFn(listMerchantProducts);
  const deleteProductFn = useServerFn(deleteMerchantProduct);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<MerchantProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const merchantSession = readMerchantSession();

  useEffect(() => {
    if (!merchantSession?.token) {
      navigate({ to: "/auth" });
      return;
    }

    listMerchantProductsFn({ data: { token: merchantSession.token } })
      .then(setProducts)
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "تعذر تحميل المنتجات");
        navigate({ to: "/auth" });
      })
      .finally(() => setLoading(false));
  }, [listMerchantProductsFn, navigate, merchantSession?.token]);

  const filtered = useMemo(
    () =>
      products.filter((product) =>
        [product.title, product.description, product.color, product.size]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [products, query],
  );

  return (
    <DashboardLayout
      title={t("products.title")}
      subtitle={t("products.subtitle")}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg" variant="outline" className="gap-2">
            <Link to="/dashboard/products/from-video">
              <Video className="h-4 w-4" />
              إضافة بالفيديو
            </Link>
          </Button>
          <Button asChild size="lg" className="gap-2 shadow-soft">
            <Link to="/dashboard/products/new">
              <Plus className="h-4 w-4" />
              {t("products.add")}
            </Link>
          </Button>
        </div>
      }
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("common.search")}
            className="h-11 ps-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground shadow-soft">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-3 text-sm">جاري تحميل منتجاتك...</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onDelete={() => setDeleteConfirm({ id: product.id, title: product.title })}
            />
          ))}
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">تأكيد حذف المنتج</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              هل أنت متأكد من حذف "{deleteConfirm.title}"؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1"
              >
                إلغاء
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!merchantSession?.token) return;
                  deleteProductFn({ data: { token: merchantSession.token, productId: deleteConfirm.id } })
                    .then(() => {
                      toast.success("تم حذف المنتج");
                      setDeleteConfirm(null);
                      setProducts((prev) => prev.filter((p) => p.id !== deleteConfirm.id));
                    })
                    .catch((err) => {
                      toast.error(err instanceof Error ? err.message : "فشل حذف المنتج");
                    });
                }}
                className="flex-1"
              >
                حذف نهائياً
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function ProductCard({ product, onDelete }: { product: MerchantProduct; onDelete: () => void }) {
  return (
    <div className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all hover:-translate-y-1 hover:shadow-elevated">
      <div
        className="aspect-square bg-secondary bg-cover bg-center"
        style={{ backgroundImage: `url(${product.imageUrl})` }}
      />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="line-clamp-2 font-semibold">{product.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {[product.description, product.color, product.size].filter(Boolean).join(" - ") ||
                "منتج"}
            </p>
          </div>
          {product.quantity !== undefined && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              {product.quantity}
            </Badge>
          )}
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-lg font-bold">{product.discountPrice ?? product.currentPrice}</span>
          <span className="text-xs text-muted-foreground">{product.currency}</span>
          {product.discountPrice !== undefined && (
            <span className="text-xs text-muted-foreground line-through">
              {product.currentPrice}
            </span>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <Button asChild size="sm" variant="ghost" className="flex-1 gap-2">
            <Link to="/dashboard/products/$id/edit" params={{ id: product.id }}>
              <Edit2 className="h-3.5 w-3.5" />
              تعديل
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
        <Package className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{t("products.empty.title")}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        لا توجد منتجات حقيقية بعد. أضف أول منتج حتى يظهر هنا ويقدر البوت يرشحه للزبائن.
      </p>
      <Button asChild className="mt-6 gap-2">
        <Link to="/dashboard/products/new">
          <Plus className="h-4 w-4" />
          {t("products.add")}
        </Link>
      </Button>
    </div>
  );
}
