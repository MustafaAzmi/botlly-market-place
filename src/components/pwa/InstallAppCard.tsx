// Install / open card for one of the two Botly PWAs.
//
// - "تنصيب التطبيق" appears ONLY when the browser fired beforeinstallprompt
//   (Chromium on Android/Desktop). On iOS we show Add-to-Home-Screen steps
//   instead, because Safari has no install prompt API.
// - "فتح التطبيق" simply navigates to the app start URL: if the PWA is
//   installed the OS opens the standalone app for in-scope URLs; if not,
//   the website opens directly — exactly the required fallback.

import { Bell, CheckCircle2, Download, ExternalLink, Share, SquarePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LanguageProvider";
import {
  PWA_APPS,
  registerServiceWorker,
  requestNotificationPermission,
  usePwaInstall,
  type PwaApp,
} from "@/lib/pwa";

export function InstallAppCard({ app }: { app: PwaApp }) {
  const t = useT();
  const cfg = PWA_APPS[app];
  const { canInstall, promptInstall, installed, isStandalone, isIos } = usePwaInstall();
  const [enablingNotifications, setEnablingNotifications] = useState(false);
  const [showManualInstall, setShowManualInstall] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  const enableDebug = () => {
    (window as any).__PWA_DEBUG__ = true;
    setShowDebug(true);
    console.log("[PWA] Debug mode enabled");
    toast.success("تم تفعيل وضع التشخيص — افتح console (F12)");
  };

  const handleInstall = async () => {
    if (!canInstall) {
      setShowManualInstall(true);
      toast.info("إذا ما ظهرت نافذة التنصيب، استخدم قائمة المتصفح ثم اختر تثبيت التطبيق.");
      registerServiceWorker();
      return;
    }

    try {
      const success = await promptInstall();
      if (!success) {
        setShowManualInstall(true);
        toast.error(t("pwa.install.cancelled"));
      }
    } catch (error) {
      console.error("[PWA Install Error]", error);
      toast.error(t("pwa.install.error"));
    }
  };

  const enableNotifications = async () => {
    setEnablingNotifications(true);
    try {
      const permission = await requestNotificationPermission();
      if (permission === "granted") toast.success(t("pwa.notifications.enabled"));
      else if (permission === "denied") toast.error(t("pwa.notifications.denied"));
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
          {t("pwa.install.using_app")}
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          <Button size="lg" className="w-full gap-2" onClick={handleInstall}>
            <Download className="h-4 w-4" />
            {t("pwa.install.button")}
          </Button>
          {installed && (
            <p className="flex items-center justify-center gap-2 text-sm font-medium text-primary">
              <CheckCircle2 className="h-4 w-4" />
              {t("pwa.install.success")}
            </p>
          )}

          <Button asChild size="lg" variant="outline" className="w-full gap-2">
            <a href={cfg.startUrl}>
              <ExternalLink className="h-4 w-4" />
              {t("pwa.open.button")}
            </a>
          </Button>

          {(isIos || showManualInstall) && (
            <div className="rounded-xl bg-secondary/60 p-4 text-start text-xs leading-6 text-muted-foreground">
              {isIos ? (
                <>
                  <p className="font-semibold text-foreground">{t("pwa.install.instructions_ios")}</p>
                  <p className="mt-1 flex items-center gap-1.5">
                    {t("pwa.install.instructions_ios_1")}
                    <Share className="inline h-3.5 w-3.5" />
                  </p>
                  <p className="flex items-center gap-1.5">
                    {t("pwa.install.instructions_ios_2")}
                    <SquarePlus className="inline h-3.5 w-3.5" />
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-foreground">طريقة التنصيب اليدوي</p>
                  <p className="mt-1">من Chrome اضغط ⋮ ثم اختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية.</p>
                  <p>إذا ما ظهر الخيار، انتظر اكتمال النشر ثم حدّث الصفحة مرتين.</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 space-y-2 flex flex-col items-center">
        <button
          type="button"
          onClick={enableNotifications}
          disabled={enablingNotifications}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <Bell className="h-3.5 w-3.5" />
          {t("pwa.notifications.enable")}
        </button>

        <button
          type="button"
          onClick={enableDebug}
          className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          {showDebug ? "✓ Debug ON" : "🔧 Debug"}
        </button>
      </div>
    </div>
  );
}
