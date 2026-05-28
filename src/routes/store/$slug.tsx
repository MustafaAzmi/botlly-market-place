import { createFileRoute, useParams } from "@tanstack/react-router";
import { useT } from "@/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { demoMerchant, demoProducts, type Product } from "@/lib/mockData";
import { MapPin, MessageCircle, Share2, BadgeCheck, Store } from "lucide-react";

export const Route = createFileRoute("/store/$slug")({
  head: () => ({
    meta: [
      { title: `${demoMerchant.storeName} — Botly` },
      { name: "description", content: demoMerchant.bio },
      { property: "og:title", content: demoMerchant.storeName },
      { property: "og:description", content: demoMerchant.bio },
    ],
  }),
  component: PublicStorePage,
});

function PublicStorePage() {
  const t = useT();
  const { slug: _slug } = useParams({ from: "/store/$slug" });
  // TODO(supabase): fetch merchant by slug.

  const waLink = `https://wa.me/${demoMerchant.whatsapp.replace(/[^\d]/g, "")}`;

  return (
    <div className="min-h-screen bg-secondary/30">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button size="sm" variant="outline" className="gap-2">
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">{t("public.share")}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-5xl px-4 pb-16">
        {/* Cover */}
        <div className="relative mt-4 h-48 overflow-hidden rounded-3xl bg-gradient-to-br from-primary/40 via-primary/20 to-info/20 sm:h-60" />

        {/* Profile */}
        <div className="-mt-12 rounded-3xl border border-border bg-card p-6 shadow-elevated sm:p-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
              <div className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl border-4 border-card bg-gradient-to-br from-primary to-primary/60 text-3xl font-bold text-primary-foreground shadow-soft">
                {demoMerchant.storeName.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{demoMerchant.storeName}</h1>
                  <BadgeCheck className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Store className="h-3.5 w-3.5" /> {demoMerchant.category}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {demoMerchant.city}
                  </span>
                  <Badge variant="outline" className="border-success/30 bg-success/15 text-success">
                    {t("store.status.active")}
                  </Badge>
                </div>
              </div>
            </div>
            <Button asChild size="lg" className="gap-2 shadow-soft">
              <a href={waLink} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" />
                {t("public.contact")}
              </a>
            </Button>
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {demoMerchant.bio}
          </p>
        </div>

        {/* Products */}
        <div className="mt-10">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-xl font-semibold">{t("public.products")}</h2>
            <span className="text-sm text-muted-foreground">{demoProducts.length}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {demoProducts.map((p) => (
              <PublicProductCard key={p.id} product={p} waLink={waLink} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PublicProductCard({ product, waLink }: { product: Product; waLink: string }) {
  const t = useT();
  return (
    <div className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all hover:-translate-y-1 hover:shadow-elevated">
      <div
        className="aspect-square bg-secondary bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{ backgroundImage: `url(${product.image})` }}
      />
      <div className="p-4">
        <h3 className="truncate font-semibold">{product.title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{product.category}</p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-lg font-bold">{product.discountPrice ?? product.price}</span>
          <span className="text-xs text-muted-foreground">{product.currency}</span>
          {product.discountPrice && (
            <span className="text-xs text-muted-foreground line-through">{product.price}</span>
          )}
        </div>
        <Button asChild size="sm" className="mt-4 w-full gap-2">
          <a href={`${waLink}?text=${encodeURIComponent(`I'm interested in ${product.title}`)}`} target="_blank" rel="noreferrer">
            <MessageCircle className="h-3.5 w-3.5" />
            {t("public.contact")}
          </a>
        </Button>
      </div>
    </div>
  );
}
