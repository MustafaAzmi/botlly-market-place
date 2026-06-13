// Install / launch page for the CUSTOMER PWA (بوتلي زبون).
// Lives under /customer/ so it falls inside the customer manifest scope.

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { InstallAppCard } from "@/components/pwa/InstallAppCard";
import { Logo } from "@/components/layout/Logo";
import { pwaHeadLinks, pwaHeadMeta } from "@/lib/pwa";

export const Route = createFileRoute("/customer/app")({
  head: () => ({
    meta: [{ title: "تطبيق بوتلي زبون — التنصيب" }, ...pwaHeadMeta("customer")],
    links: pwaHeadLinks("customer"),
  }),
  component: CustomerAppPage,
});

function CustomerAppPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary/30 px-4 py-10">
      <Logo />
      <div className="mt-8 w-full max-w-sm">
        <InstallAppCard app="customer" />
        <p className="mt-4 text-center text-xs text-muted-foreground">
          نصّب التطبيق على هاتفك أو حاسوبك واستخدمه كتطبيق مستقل — يدعم العمل بدون إنترنت
          والإشعارات.
        </p>
        <div className="mt-6 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            العودة للموقع
          </Link>
        </div>
      </div>
    </div>
  );
}
