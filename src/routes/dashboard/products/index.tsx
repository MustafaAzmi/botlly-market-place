import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useT } from "@/i18n/LanguageProvider";
import { demoProducts, type Product } from "@/lib/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit, Trash2, Package } from "lucide-react";

export const Route = createFileRoute("/dashboard/products/")({
  head: () => ({ meta: [{ title: "Products — Botly" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const t = useT();
  const [query, setQuery] = useState("");
  const filtered = demoProducts.filter((p) =>
    p.title.toLowerCase().includes(query.toLowerCase()),
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
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("common.search")}
            className="h-11 ps-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

function ProductCard({ product }: { product: Product }) {
  const t = useT();
  return (
    <div className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all hover:-translate-y-1 hover:shadow-elevated">
      <div
        className="aspect-square bg-secondary bg-cover bg-center"
        style={{ backgroundImage: `url(${product.image})` }}
      />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{product.title}</h3>
            <p className="text-xs text-muted-foreground">{product.category}</p>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {product.availability === "in_stock"
              ? t("products.availability.inStock")
              : t("products.availability.outOfStock")}
          </Badge>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-lg font-bold">{product.discountPrice ?? product.price}</span>
          <span className="text-xs text-muted-foreground">{product.currency}</span>
          {product.discountPrice && (
            <span className="text-xs text-muted-foreground line-through">
              {product.price}
            </span>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 gap-1">
            <Edit className="h-3.5 w-3.5" />
            {t("common.edit")}
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
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
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{t("products.empty.desc")}</p>
      <Button asChild className="mt-6 gap-2">
        <Link to="/dashboard/products/new">
          <Plus className="h-4 w-4" />
          {t("products.add")}
        </Link>
      </Button>
    </div>
  );
}
