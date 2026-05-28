import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/layout/Logo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useT } from "@/i18n/LanguageProvider";
import { toast } from "sonner";
import { ArrowRight, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Botly" },
      { name: "description", content: "Create your Botly merchant account in 2 minutes." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const t = useT();
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || !whatsapp.trim()) {
      toast.error("Please fill all fields");
      return;
    }
    setLoading(true);
    // TODO(supabase): create merchant row, send WhatsApp OTP, sign in.
    setTimeout(() => {
      setLoading(false);
      navigate({ to: "/dashboard" });
    }, 600);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Form */}
      <div className="flex flex-col">
        <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <Logo />
          <LanguageSwitcher />
        </header>
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">
            <h1 className="text-3xl font-bold tracking-tight">{t("auth.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("auth.subtitle")}</p>

            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="storeName">{t("auth.storeName")}</Label>
                <Input
                  id="storeName"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder={t("auth.storeName.placeholder")}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">{t("auth.whatsapp")}</Label>
                <Input
                  id="whatsapp"
                  type="tel"
                  dir="ltr"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder={t("auth.whatsapp.placeholder")}
                  className="h-11 text-start"
                />
              </div>
              <Button type="submit" size="lg" className="w-full gap-2 shadow-soft" disabled={loading}>
                {loading ? t("common.loading") : t("auth.submit")}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Button>
              <p className="text-center text-xs text-muted-foreground">{t("auth.terms")}</p>
            </form>

            <div className="mt-8 text-center text-sm text-muted-foreground">
              <Link to="/" className="hover:text-foreground">← {t("brand.name")}</Link>
            </div>
          </div>
        </div>
      </div>

      {/* Decorative panel */}
      <div
        className="relative hidden flex-col justify-between p-12 text-primary-foreground lg:flex"
        style={{ background: "var(--gradient-primary)" }}
      >
        <div className="flex items-center gap-2 text-sm font-medium opacity-90">
          <ShieldCheck className="h-4 w-4" />
          {t("public.verified")}
        </div>
        <div>
          <h2 className="text-balance text-4xl font-bold leading-tight">{t("hero.title")}</h2>
          <p className="mt-4 max-w-md text-primary-foreground/85">{t("hero.subtitle")}</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            { v: "2,400+", l: t("hero.stats.merchants") },
            { v: "180K+", l: t("hero.stats.products") },
            { v: "65K+", l: t("hero.stats.orders") },
          ].map((s) => (
            <div key={s.l} className="rounded-xl bg-primary-foreground/10 p-3 backdrop-blur-sm">
              <div className="text-xl font-bold">{s.v}</div>
              <div className="mt-1 text-xs opacity-80">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
