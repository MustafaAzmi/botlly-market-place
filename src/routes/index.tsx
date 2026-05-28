import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LanguageProvider";
import { MarketingHeader, MarketingFooter } from "@/components/layout/MarketingChrome";
import {
  Sparkles,
  Store,
  Bot,
  Inbox,
  BarChart3,
  ArrowRight,
  MessageCircle,
  Search,
  Package,
  CheckCircle2,
  Truck,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Botly — AI WhatsApp Commerce for Merchants" },
      { name: "description", content: "Botly turns WhatsApp into a smart AI store. Create your storefront, connect a bot, and convert chats into orders." },
      { property: "og:title", content: "Botly — AI WhatsApp Commerce" },
      { property: "og:description", content: "Turn WhatsApp into a smart store that sells for you." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const t = useT();
  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{ background: "var(--gradient-hero)" }}
        />
        <div className="absolute -top-32 start-1/2 -z-10 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

        <div className="container mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-4 py-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {t("hero.badge")}
            </div>
            <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl">
              {t("hero.title")}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
              {t("hero.subtitle")}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="gap-2 shadow-elevated">
                <Link to="/auth">
                  {t("hero.cta.primary")}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#workflow">{t("hero.cta.secondary")}</a>
              </Button>
            </div>

            <div className="mx-auto mt-14 grid max-w-2xl grid-cols-3 gap-4 border-t border-border/60 pt-8">
              {[
                { v: "2,400+", l: t("hero.stats.merchants") },
                { v: "180K+", l: t("hero.stats.products") },
                { v: "65K+", l: t("hero.stats.orders") },
              ].map((s) => (
                <div key={s.l}>
                  <div className="text-2xl font-bold text-foreground sm:text-3xl">{s.v}</div>
                  <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview card */}
          <div className="mx-auto mt-16 max-w-4xl">
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
              <div className="flex items-center gap-1.5 border-b border-border bg-secondary/50 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/50" />
                <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
              </div>
              <div className="grid gap-0 md:grid-cols-2">
                <div className="space-y-4 p-6">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MessageCircle className="h-4 w-4 text-success" />
                    WhatsApp
                  </div>
                  <ChatBubble side="in">أبحث عن سماعة لاسلكية بسعر مناسب</ChatBubble>
                  <ChatBubble side="out">وجدت لك ٣ منتجات مناسبة 👇</ChatBubble>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="aspect-video rounded-lg bg-secondary" />
                    <div className="mt-2 text-sm font-medium">AirBuds Pro 2</div>
                    <div className="text-xs text-muted-foreground">399 SAR</div>
                  </div>
                </div>
                <div className="border-s border-border bg-secondary/30 p-6">
                  <div className="mb-4 text-sm font-semibold">Botly Dashboard</div>
                  <div className="space-y-3">
                    <MiniStat label={t("dashboard.stat.products")} value="24" />
                    <MiniStat label={t("dashboard.stat.leads")} value="18" />
                    <MiniStat label={t("dashboard.stat.searches")} value="312" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/60 bg-background py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("features.title")}</h2>
            <p className="mt-4 text-muted-foreground">{t("features.subtitle")}</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { i: Store, k: "store" },
              { i: Bot, k: "bot" },
              { i: Inbox, k: "leads" },
              { i: BarChart3, k: "analytics" },
            ].map(({ i: Icon, k }) => (
              <div key={k} className="group rounded-2xl border border-border bg-card p-6 shadow-soft transition-all hover:-translate-y-1 hover:shadow-elevated">
                <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold">{t(`features.${k}.title` as never)}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t(`features.${k}.desc` as never)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="border-t border-border/60 bg-secondary/40 py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("workflow.title")}</h2>
            <p className="mt-4 text-muted-foreground">{t("workflow.subtitle")}</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { i: MessageCircle, k: "step1" },
              { i: Sparkles, k: "step2" },
              { i: Search, k: "step3" },
              { i: Package, k: "step4" },
              { i: CheckCircle2, k: "step5" },
              { i: Truck, k: "step6" },
            ].map(({ i: Icon, k }, idx) => (
              <div key={k} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">0{idx + 1}</span>
                </div>
                <h3 className="font-semibold">{t(`workflow.${k}.title` as never)}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t(`workflow.${k}.desc` as never)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto max-w-4xl px-4">
          <div
            className="overflow-hidden rounded-3xl p-10 text-center shadow-glow sm:p-14"
            style={{ background: "var(--gradient-primary)" }}
          >
            <h2 className="text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl">{t("cta.title")}</h2>
            <p className="mx-auto mt-4 max-w-xl text-primary-foreground/85">{t("cta.subtitle")}</p>
            <div className="mt-8">
              <Button asChild size="lg" variant="secondary" className="gap-2 shadow-elevated">
                <Link to="/auth">
                  {t("hero.cta.primary")}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

function ChatBubble({ side, children }: { side: "in" | "out"; children: React.ReactNode }) {
  const inbound = side === "in";
  return (
    <div className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
          inbound
            ? "bg-secondary text-foreground rounded-bl-sm rtl:rounded-bl-2xl rtl:rounded-br-sm"
            : "bg-primary text-primary-foreground rounded-br-sm rtl:rounded-br-2xl rtl:rounded-bl-sm"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  );
}
