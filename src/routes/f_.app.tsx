// Install / launch page for the FITTER PWA.

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Logo } from "@/components/layout/Logo";
import { InstallAppCard } from "@/components/pwa/InstallAppCard";
import { pwaHeadLinks, pwaHeadMeta } from "@/lib/pwa";

export const Route = createFileRoute("/f_/app")({
  head: () => ({
    meta: [{ title: "تطبيق بوتلي فيتر - التنصيب" }, ...pwaHeadMeta("fitter")],
    links: pwaHeadLinks("fitter"),
  }),
  component: FitterAppPage,
});

function FitterAppPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary/30 px-4 py-10">
      <Logo />
      <div className="mt-8 w-full max-w-sm">
        <InstallAppCard app="fitter" />
        <p className="mt-4 text-center text-xs text-muted-foreground">
          نصب التطبيق على هاتفك واستخدم لوحة الفيتر كتطبيق مستقل مع الإشعارات.
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
