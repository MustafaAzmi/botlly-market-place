import { Bell, CheckCircle2, Copy, Download, ExternalLink, Menu, Share, SquarePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LanguageProvider";
import {
  PWA_APPS,
  registerServiceWorker,
  requestNotificationPermission,
  usePwaInstall,
  type BrowserFamily,
  type PwaApp,
} from "@/lib/pwa";

export function InstallAppCard({ app }: { app: PwaApp }) {
  const t = useT();
  const cfg = PWA_APPS[app];
  const { canInstall, promptInstall, installed, isStandalone, isIos, isInAppBrowser, browserFamily } = usePwaInstall();
  const [enablingNotifications, setEnablingNotifications] = useState(false);
  const [showManualInstall, setShowManualInstall] = useState(false);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  const handleInstall = async () => {
    if (!canInstall) {
      setShowManualInstall(true);
      toast.info("إذا لم تظهر نافذة التنصيب تلقائياً، اتبع الخطوات التي ظهرت حسب نوع المتصفح.");
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
      setShowManualInstall(true);
      toast.error(t("pwa.install.error"));
    }
  };

  const copyInstallLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("تم نسخ رابط التنصيب");
    } catch {
      toast.error("تعذر نسخ الرابط");
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
      <img src={cfg.icon} alt={cfg.name} className="mx-auto h-20 w-20 rounded-2xl shadow-soft" />
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
            {canInstall ? t("pwa.install.button") : "عرض طريقة التنصيب"}
          </Button>

          {installed ? (
            <p className="flex items-center justify-center gap-2 text-sm font-medium text-primary">
              <CheckCircle2 className="h-4 w-4" />
              {t("pwa.install.success")}
            </p>
          ) : null}

          <Button asChild size="lg" variant="outline" className="w-full gap-2">
            <a href={cfg.startUrl}>
              <ExternalLink className="h-4 w-4" />
              {t("pwa.open.button")}
            </a>
          </Button>

          {isInAppBrowser ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-start text-xs leading-6 text-amber-900">
              افتح هذه الصفحة من Chrome أو Firefox أو Opera أو Samsung Internet، لأن متصفح واتساب/فيسبوك لا يضيف التطبيق للشاشة الرئيسية غالباً.
              <Button type="button" variant="outline" size="sm" className="mt-3 w-full gap-2" onClick={copyInstallLink}>
                <Copy className="h-3.5 w-3.5" />
                نسخ رابط التنصيب
              </Button>
            </div>
          ) : null}

          {(isIos || showManualInstall || (!canInstall && !installed)) ? (
            <div className="rounded-xl bg-secondary/60 p-4 text-start text-xs leading-6 text-muted-foreground">
              {isIos ? <IosInstallInstructions /> : <ManualInstallInstructions browser={browserFamily} appName={cfg.name} />}
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-4 flex flex-col items-center space-y-2">
        <button
          type="button"
          onClick={enableNotifications}
          disabled={enablingNotifications}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <Bell className="h-3.5 w-3.5" />
          {t("pwa.notifications.enable")}
        </button>
      </div>
    </div>
  );
}

function IosInstallInstructions() {
  const t = useT();
  return (
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
  );
}

function ManualInstallInstructions({ browser, appName }: { browser: BrowserFamily; appName: string }) {
  const steps = installStepsForBrowser(browser, appName);
  return (
    <>
      <p className="font-semibold text-foreground">{steps.title}</p>
      <div className="mt-1 space-y-1">
        {steps.lines.map((line) => (
          <p key={line} className="flex items-start gap-1.5">
            <Menu className="mt-1 h-3.5 w-3.5 shrink-0" />
            <span>{line}</span>
          </p>
        ))}
      </div>
      <p className="mt-2 text-[11px]">
        إذا لم يظهر خيار التنصيب، افتح الصفحة من المتصفح نفسه وليس من داخل واتساب أو فيسبوك، ثم حدّث الصفحة.
      </p>
    </>
  );
}

function installStepsForBrowser(browser: BrowserFamily, appName: string) {
  if (browser === "firefox") {
    return {
      title: `تنصيب ${appName} من Firefox`,
      lines: ["اضغط قائمة Firefox.", "اختر إضافة إلى الشاشة الرئيسية أو Install إن ظهر الخيار."],
    };
  }

  if (browser === "opera") {
    return {
      title: `تنصيب ${appName} من Opera`,
      lines: ["اضغط شعار Opera أو قائمة المتصفح.", "اختر إضافة إلى الشاشة الرئيسية أو Install app."],
    };
  }

  if (browser === "samsung") {
    return {
      title: `تنصيب ${appName} من Samsung Internet`,
      lines: ["اضغط القائمة في أسفل المتصفح.", "اختر إضافة الصفحة إلى ثم الشاشة الرئيسية."],
    };
  }

  if (browser === "edge") {
    return {
      title: `تنصيب ${appName} من Edge`,
      lines: ["اضغط قائمة Edge.", "اختر التطبيقات ثم Install this site أو إضافة إلى الشاشة الرئيسية."],
    };
  }

  return {
    title: `تنصيب ${appName}`,
    lines: ["اضغط قائمة المتصفح.", "اختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية.", "في Chrome اضغط ⋮ ثم تثبيت التطبيق."],
  };
}
