import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BellRing, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";
import { WebOrderNotifications } from "@/components/orders/WebOrderNotifications";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageProvider";
import { clearCustomerSession, readCustomerSession } from "@/lib/customerSession";
import { pwaHeadLinks, pwaHeadMeta } from "@/lib/pwa";

export const Route = createFileRoute("/customer/notifications")({
  head: () => ({
    meta: [{ title: "Customer Notifications - Botly" }, ...pwaHeadMeta("customer")],
    links: pwaHeadLinks("customer"),
  }),
  component: CustomerNotificationsPage,
});

function CustomerNotificationsPage() {
  const { locale } = useLanguage();
  const text = {
    ar: {
      dashboard: "لوحة الزبون",
      logout: "خروج",
      title: "صفحة الإشعارات",
      subtitle: "طلباتك وأزرار تأكيد الشراء أو الإلغاء في مكان واحد.",
    },
    ku: {
      dashboard: "پانێڵی کڕیار",
      logout: "چوونەدەرەوە",
      title: "پەڕەی ئاگادارکردنەوەکان",
      subtitle: "داواکارییەکانت و دوگمەکانی پشتڕاستکردنەوەی کڕین یان هەڵوەشاندنەوە لە یەک شوێن.",
    },
    en: {
      dashboard: "Customer dashboard",
      logout: "Log out",
      title: "Notifications",
      subtitle: "Your requests and purchase or cancellation confirmations in one place.",
    },
  }[locale];
  const navigate = useNavigate();
  const [session, setSession] = useState<ReturnType<typeof readCustomerSession>>(null);

  useEffect(() => {
    const current = readCustomerSession();
    if (!current) {
      navigate({ to: "/customer/auth" });
      return;
    }
    setSession(current);
  }, [navigate]);

  const logout = () => {
    clearCustomerSession();
    navigate({ to: "/customer/auth" });
  };

  if (!session) return null;

  return (
    <div className="min-h-screen bg-secondary/30 pb-10">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="container mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <Logo />
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <LanguageSwitcher />
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link to="/customer/dashboard">
                <ArrowRight className="h-4 w-4" />
                {text.dashboard}
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={logout}>
              <LogOut className="h-4 w-4" />
              {text.logout}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex items-center gap-2">
          <BellRing className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{text.title}</h1>
            <p className="text-sm text-muted-foreground">{text.subtitle}</p>
          </div>
        </div>
        <WebOrderNotifications
          role="requester"
          requesterType="customer"
          requesterPhone={session.customer.whatsapp}
        />
      </main>
    </div>
  );
}
