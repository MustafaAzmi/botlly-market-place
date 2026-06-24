import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, BellRing, LogOut, Settings } from "lucide-react";
import { useEffect, useState } from "react";

import { WebOrderNotifications } from "@/components/orders/WebOrderNotifications";
import { Button } from "@/components/ui/button";
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
          <h1 className="mt-3 text-xl font-bold">صفحة الإشعارات</h1>
          <p className="mt-2 text-sm text-muted-foreground">سجل دخولك كفيتر حتى ترى إشعارات الطلبات.</p>
          <Button asChild className="mt-5">
            <Link to="/f">تسجيل الدخول</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30 pb-10">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">صفحة الإشعارات</h1>
            <p className="text-xs text-muted-foreground">{session.fitter.whatsapp}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link to="/f">
                <ArrowRight className="h-4 w-4" />
                لوحة الفيتر
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/f/settings">
                <Settings className="h-4 w-4" />
                الإعدادات
              </Link>
            </Button>
            <Button variant="ghost" className="gap-2" onClick={logout}>
              <LogOut className="h-4 w-4" />
              خروج
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <WebOrderNotifications
          role="requester"
          requesterType="fitter"
          requesterPhone={session.fitter.whatsapp}
          title="إشعارات الفيتر"
        />
      </main>
    </div>
  );
}
