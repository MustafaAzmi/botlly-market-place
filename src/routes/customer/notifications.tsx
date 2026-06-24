import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BellRing, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";
import { WebOrderNotifications } from "@/components/orders/WebOrderNotifications";
import { Button } from "@/components/ui/button";
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
  const navigate = useNavigate();
  const [session] = useState(() => readCustomerSession());

  useEffect(() => {
    if (!session) navigate({ to: "/customer/auth" });
  }, [navigate, session]);

  const logout = () => {
    clearCustomerSession();
    navigate({ to: "/customer/auth" });
  };

  if (!session) return null;

  return (
    <div className="min-h-screen bg-secondary/30 pb-10">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link to="/customer/dashboard">
                <ArrowRight className="h-4 w-4" />
                لوحة الزبون
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={logout}>
              <LogOut className="h-4 w-4" />
              خروج
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex items-center gap-2">
          <BellRing className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">صفحة الإشعارات</h1>
            <p className="text-sm text-muted-foreground">طلباتك وأزرار تأكيد الشراء أو الإلغاء في مكان واحد.</p>
          </div>
        </div>
        <WebOrderNotifications
          role="requester"
          requesterType="customer"
          requesterPhone={session.customer.whatsapp}
          title="إشعارات الزبون"
        />
      </main>
    </div>
  );
}
