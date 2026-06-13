import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Download, Store, User } from "lucide-react";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageProvider";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Botly — وسيط بين التاجر والزبون" },
      {
        name: "description",
        content: "بوتلي وسيط بين التاجر والزبون. يدورلك عن أي منتج تريده ويوصله إلك لغاية عندك.",
      },
      { property: "og:title", content: "Botly — وسيط بين التاجر والزبون" },
      {
        property: "og:description",
        content: "خلي راسك مرتاح واستخدم بوتلي.",
      },
    ],
  }),
  component: LandingPage,
});

const copy = {
  ar: {
    title: "بوتلي وسيط بين التاجر والزبون",
    subtitle: "يدورلك عن أي منتج إنت تريده ويوصله إلك لغاية عندك.",
    tagline: "خلي راسك مرتاح واستخدم بوتلي.",
    customer: "دخول الزبون",
    merchantLogin: "تسجيل الدخول للتاجر",
    createStore: "أنشئ متجر جديد",
    customerApp: "حمّل تطبيق بوتلي زبون",
    merchantApp: "حمّل تطبيق بوتلي تاجر",
    rights: "جميع الحقوق محفوظة",
  },
  en: {
    title: "Botly connects merchants and customers",
    subtitle: "We find any product you want and deliver it right to your door.",
    tagline: "Sit back, relax, and use Botly.",
    customer: "Customer entrance",
    merchantLogin: "Merchant sign in",
    createStore: "Create a new store",
    customerApp: "Get the Botly Customer app",
    merchantApp: "Get the Botly Merchant app",
    rights: "All rights reserved",
  },
} as const;

function LandingPage() {
  const { locale } = useLanguage();
  const text = copy[locale];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <LanguageSwitcher />
        </div>
      </header>

      <main className="relative flex flex-1 items-center overflow-hidden">
        <div className="absolute inset-0 -z-10" style={{ background: "var(--gradient-hero)" }} />
        <div className="absolute -top-32 start-1/2 -z-10 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

        <div className="container mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl">
              {text.title}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
              {text.subtitle}
            </p>
            <p className="mx-auto mt-3 max-w-2xl text-balance text-lg font-semibold text-primary sm:text-xl">
              {text.tagline}
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="gap-2 shadow-elevated">
                <Link to="/customer/auth">
                  <User className="h-4 w-4" />
                  {text.customer}
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="gap-2 border-primary/40 text-primary hover:bg-primary-soft"
              >
                <Link to="/auth">
                  {text.merchantLogin}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2">
                <Link to="/auth" search={{ mode: "signup" }}>
                  <Store className="h-4 w-4" />
                  {text.createStore}
                </Link>
              </Button>
            </div>

            {/* PWA install pages */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm">
              <Link
                to="/customer/app"
                className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary"
              >
                <Download className="h-4 w-4" />
                {text.customerApp}
              </Link>
              <Link
                to="/merchant-app"
                className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary"
              >
                <Download className="h-4 w-4" />
                {text.merchantApp}
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/60 bg-background">
        <div className="container mx-auto max-w-6xl px-4 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Botly. {text.rights}.
        </div>
      </footer>
    </div>
  );
}
