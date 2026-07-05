// Install / launch page for the MERCHANT PWA (بوتلي تاجر).

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { InstallAppCard } from "@/components/pwa/InstallAppCard";
import { Logo } from "@/components/layout/Logo";
import { pwaHeadLinks, pwaHeadMeta } from "@/lib/pwa";

export const Route = createFileRoute("/merchant-app")({
  head: () => ({
    meta: [{ title: "تطبيق بوتلي تاجر — التنصيب" }, ...pwaHeadMeta("merchant")],
    links: pwaHeadLinks("merchant"),
  }),
  component: MerchantAppPage,
});

function MerchantAppPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary/30 px-4 py-10">
      <Logo />
      <div className="mt-8 w-full max-w-sm">
        <InstallAppCard app="merchant" />
        <Link
          to="/auth"
          search={{ mode: "login" }}
          className="mt-4 flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground"
        >
          فتح حساب التاجر
        </Link>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          نصّب التطبيق على هاتفك أو حاسوبك وأدر متجرك كتطبيق مستقل — يدعم العمل بدون إنترنت
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
