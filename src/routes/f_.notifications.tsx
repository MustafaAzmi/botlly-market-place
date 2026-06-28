import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, BellRing, LogOut, Settings } from "lucide-react";
import { useEffect, useState } from "react";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { WebOrderNotifications } from "@/components/orders/WebOrderNotifications";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageProvider";
import { clearFitterSession, readFitterSession } from "@/lib/fitterSession";
import { pwaHeadLinks, pwaHeadMeta } from "@/lib/pwa";

export const Route = createFileRoute("/f_/notifications")({
  head: () => ({
    meta: [{ title: "Fitter Notifications - Botly" }, ...pwaHeadMeta("fitter")],
    links: pwaHeadLinks("fitter"),
  }),
  component: FitterNotificationsPage,
});

function FitterNotificationsPage() {
  const { locale } = useLanguage();
  const text = {
    ar: {
      title: "صفحة الإشعارات",
      loginHint: "سجل دخولك كفيتر حتى ترى إشعارات الطلبات.",
      login: "تسجيل الدخول",
      dashboard: "لوحة الفيتر",
      settings: "الإعدادات",
      logout: "خروج",
    },
    ku: {
      title: "پەڕەی ئاگادارکردنەوەکان",
      loginHint: "وەک فیتەر بچۆ ژوورەوە بۆ بینینی ئاگادارکردنەوەکانی داواکاری.",
      login: "چوونەژوورەوە",
      dashboard: "پانێڵی فیتەر",
      settings: "ڕێکخستنەکان",
      logout: "چوونەدەرەوە",
    },
    en: {
      title: "Notifications",
      loginHint: "Sign in as a fitter to see request notifications.",
      login: "Sign in",
      dashboard: "Fitter dashboard",
      settings: "Settings",
      logout: "Log out",
    },
  }[locale];
  const [session, setSession] = useState(() => readFitterSession());

  useEffect(() => {
    setSession(readFitterSession());
  }, []);

  const logout = () => {
    clearFitterSession();
    setSession(null);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-secondary/30 px-4 py-10">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-soft">
          <BellRing className="mx-auto h-8 w-8 text-primary" />
          <h1 className="mt-3 text-xl font-bold">{text.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{text.loginHint}</p>
          <Button asChild className="mt-5">
            <Link to="/f">{text.login}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30 pb-10">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">{text.title}</h1>
            <p className="text-xs text-muted-foreground">{session.fitter.whatsapp}</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <LanguageSwitcher />
            <Button asChild variant="outline" className="gap-2">
              <Link to="/f">
                <ArrowRight className="h-4 w-4" />
                {text.dashboard}
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/f/settings">
                <Settings className="h-4 w-4" />
                {text.settings}
              </Link>
            </Button>
            <Button variant="ghost" className="gap-2" onClick={logout}>
              <LogOut className="h-4 w-4" />
              {text.logout}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <WebOrderNotifications
          role="requester"
          requesterType="fitter"
          requesterPhone={session.fitter.whatsapp}
        />
      </main>
    </div>
  );
}
