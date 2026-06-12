// Install / open card for one of the two Botly PWAs.
//
// - "تنصيب التطبيق" appears ONLY when the browser fired beforeinstallprompt
//   (Chromium on Android/Desktop). On iOS we show Add-to-Home-Screen steps
//   instead, because Safari has no install prompt API.
// - "فتح التطبيق" simply navigates to the app start URL: if the PWA is
//   installed the OS opens the standalone app for in-scope URLs; if not,
//   the website opens directly — exactly the required fallback.

import { Bell, CheckCircle2, Download, ExternalLink, Share, SquarePlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PWA_APPS, requestNotificationPermission, usePwaInstall, type PwaApp } from "@/lib/pwa";

export function InstallAppCard({ app }: { app: PwaApp }) {
  const cfg = PWA_APPS[app];
  const { canInstall, promptInstall, installed, isStandalone, isIos } = usePwaInstall();
  const [enablingNotifications, setEnablingNotifications] = useState(false);

  const enableNotifications = async () => {
    setEnablingNotifications(true);
    try {
      const permission = await requestNotificationPermission();
      if (permission === "granted") toast.success("تم تفعيل الإشعارات ✅");
      else if (permission === "denied") toast.error("الإشعارات مرفوضة من إعدادات المتصفح");
    } finally {
      setEnablingNotifications(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-soft">
      <img
        src={cfg.icon}
        alt={cfg.name}
        className="mx-auto h-20 w-20 rounded-2xl shadow-soft"
      />
      <h2 className="mt-4 text-xl font-bold">{cfg.name}</h2>

      {isStandalone ? (
        <p className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-primary">
          <CheckCircle2 className="h-4 w-4" />
          أنت تستخدم التطبيق الآن
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {canInstall && (
            <Button size="lg" className="w-full gap-2" onClick={promptInstall}>
              <Download className="h-4 w-4" />
              تنصيب التطبيق
            </Button>
          )}
          {installed && (
            <p className="flex items-center justify-center gap-2 text-sm font-medium text-primary">
              <CheckCircle2 className="h-4 w-4" />
              تم تنصيب التطبيق على جهازك
            </p>
          )}

          <Button asChild size="lg" variant={canInstall ? "outline" : "default"} className="w-full gap-2">
            <a href={cfg.startUrl}>
              <ExternalLink className="h-4 w-4" />
              فتح التطبيق
            </a>
          </Button>

          {isIos && !canInstall && (
            <div className="rounded-xl bg-secondary/60 p-4 text-start text-xs leading-6 text-muted-foreground">
              <p className="font-semibold text-foreground">للتنصيب على iPhone / iPad:</p>
              <p className="mt-1 flex items-center gap-1.5">
                1. اضغط زر المشاركة
                <Share className="inline h-3.5 w-3.5" />
                في شريط Safari
              </p>
              <p className="flex items-center gap-1.5">
                2. اختر «إضافة إلى الشاشة الرئيسية»
                <SquarePlus className="inline h-3.5 w-3.5" />
              </p>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={enableNotifications}
        disabled={enablingNotifications}
        className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
      >
        <Bell className="h-3.5 w-3.5" />
        تفعيل الإشعارات
      </button>
    </div>
  );
}
