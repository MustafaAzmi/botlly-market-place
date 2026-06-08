import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Package, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/LanguageProvider";
import { listMerchantProducts, type MerchantProduct } from "@/lib/merchant.functions";
import { readMerchantSession } from "@/lib/merchantSession";

export const Route = createFileRoute("/dashboard/products/")({
  head: () => ({ meta: [{ title: "Products - Botly" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const t = useT();
  const navigate = useNavigate();
  const listMerchantProductsFn = useServerFn(listMerchantProducts);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<MerchantProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const merchantSession = readMerchantSession();
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
  }, [listMerchantProductsFn, navigate]);

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
        <Button asChild size="lg" className="gap-2 shadow-soft">
          <Link to="/dashboard/products/new">
            <Plus className="h-4 w-4" />
            {t("products.add")}
          </Link>
        </Button>
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
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

function ProductCard({ product }: { product: MerchantProduct }) {
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
