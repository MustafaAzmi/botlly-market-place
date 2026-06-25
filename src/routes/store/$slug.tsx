import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, MessageCircle, Package, Store } from "lucide-react";
import { useEffect, useState } from "react";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPublicStore, type PublicStore } from "@/lib/storefront.functions";

export const Route = createFileRoute("/store/$slug")({
  head: () => ({
    meta: [
      { title: "Botly Store" },
      { name: "description", content: "Real merchant storefront on Botly." },
    ],
  }),
  component: PublicStorePage,
});

// wa.me links need the number as digits only (international format, no +).
function toWhatsAppLink(whatsapp: string) {
  const digits = whatsapp.replace(/\D/g, "").replace(/^0/, "964");
  return `https://wa.me/${digits}`;
}

function PublicStorePage() {
  const { slug } = Route.useParams();
  const getPublicStoreFn = useServerFn(getPublicStore);
  const [store, setStore] = useState<PublicStore | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getPublicStoreFn({ data: { slug } })
      .then(setStore)
      .catch(() => setStore(null))
      .finally(() => setLoading(false));
  }, [getPublicStoreFn, slug]);

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Logo />
          <LanguageSwitcher />
        </div>
      </header>

      {loading ? (
        <main className="container mx-auto flex min-h-[calc(100vh-56px)] max-w-3xl items-center justify-center px-4">
          <div className="text-center text-muted-foreground">
            <Loader2 className="mx-auto h-7 w-7 animate-spin" />
            <p className="mt-3 text-sm">جاري تحميل المتجر...</p>
          </div>
        </main>
      ) : !store ? (
        <NotFoundState />
      ) : (
        <main className="container mx-auto max-w-5xl px-4 pb-16">
          {/* Cover */}
          <div
            className="mt-4 h-40 rounded-2xl bg-secondary bg-cover bg-center sm:h-56"
            style={store.coverUrl ? { backgroundImage: `url(${store.coverUrl})` } : undefined}
          />

          {/* Store header */}
          <div className="-mt-10 flex flex-col items-center gap-3 px-4 text-center sm:flex-row sm:items-end sm:text-start">
            <div
              className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl border-4 border-background bg-card shadow-soft"
              style={store.logoUrl ? { backgroundImage: `url(${store.logoUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
            >
              {!store.logoUrl && <Store className="h-10 w-10 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1 sm:pb-1">
              <h1 className="text-2xl font-bold">{store.storeName}</h1>
              {store.bio && <p className="mt-1 text-sm text-muted-foreground">{store.bio}</p>}
              {store.address && (
                <p className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground sm:justify-start">
                  <MapPin className="h-3.5 w-3.5" />
                  {store.address}
                </p>
              )}
            </div>
            {store.whatsapp && (
              <Button asChild className="gap-2 shadow-soft">
                <a href={toWhatsAppLink(store.whatsapp)} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  تواصل واتساب
                </a>
              </Button>
            )}
          </div>

          {/* Products */}
          <h2 className="mt-10 text-lg font-semibold">المنتجات ({store.products.length})</h2>
          {store.products.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
              <Package className="mx-auto h-8 w-8" />
              <p className="mt-3 text-sm">لا توجد منتجات معروضة حالياً.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {store.products.map((product) => {
                const specs = [
                  product.carYear ? `سنة الصنع: ${product.carYear}` : "",
                  product.carModel ? `الموديل: ${product.carModel}` : "",
                  product.color ? `اللون: ${product.color}` : "",
                ]
                  .filter(Boolean)
                  .join(" - ");

                return (
                <div
                  key={product.id}
                  className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all hover:-translate-y-1 hover:shadow-elevated"
                >
                  <div
                    className="aspect-square bg-secondary bg-cover bg-center"
                    style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : undefined}
                  />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 font-semibold">{product.title}</h3>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {specs || "منتج"}
                        </p>
                      </div>
                      {product.quantity !== undefined && product.quantity > 0 && (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {product.quantity}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-lg font-bold">
                        {(product.discountPrice ?? product.price).toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground">{product.currency}</span>
                      {product.discountPrice !== undefined && (
                        <span className="text-xs text-muted-foreground line-through">
                          {product.price.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function NotFoundState() {
  return (
    <main className="container mx-auto flex min-h-[calc(100vh-56px)] max-w-3xl items-center px-4 py-12">
      <div className="w-full rounded-2xl border border-dashed border-border bg-card p-10 text-center shadow-soft">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Store className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">المتجر غير موجود</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          الرابط غير صحيح أو المتجر لم يعد متاحاً.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">العودة للرئيسية</Link>
        </Button>
      </div>
    </main>
  );
}
