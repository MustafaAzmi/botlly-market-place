// Client-side PWA helpers shared by both apps (بوتلي زبون / بوتلي تاجر).
//
// One service worker serves both installs; which app gets installed is decided
// by whichever manifest the CURRENT page links (customer pages link the
// customer manifest, merchant pages the merchant one), so the install prompt
// on a customer page installs "بوتلي زبون" and vice versa — both can coexist
// on the same device because the manifests have different ids/scopes.

import { useEffect, useState } from "react";

export type PwaApp = "customer" | "merchant";

export const PWA_APPS: Record<
  PwaApp,
  { name: string; manifest: string; startUrl: string; themeColor: string; icon: string }
> = {
  customer: {
    name: "بوتلي زبون",
    manifest: "/manifest-customer.webmanifest",
    startUrl: "/customer/auth",
    themeColor: "#16a34a",
    icon: "/icons/customer.svg",
  },
  merchant: {
    name: "بوتلي تاجر",
    manifest: "/manifest-merchant.webmanifest",
    startUrl: "/auth",
    themeColor: "#0d7490",
    icon: "/icons/merchant.svg",
  },
};

// TanStack head() links for a given app — spread into a route's head config so
// the page advertises the right manifest + icons.
export function pwaHeadLinks(app: PwaApp) {
  const cfg = PWA_APPS[app];
  return [
    { rel: "manifest", href: cfg.manifest },
    { rel: "apple-touch-icon", href: `/icons/${app}-apple-180.png` },
  ];
}

export function pwaHeadMeta(app: PwaApp) {
  const cfg = PWA_APPS[app];
  return [
    { name: "theme-color", content: cfg.themeColor },
    { name: "mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    { name: "apple-mobile-web-app-title", content: cfg.name },
  ];
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  // Don't specify scope — let the manifest's scope take precedence
  // Register immediately to ensure beforeinstallprompt fires before user interaction
  navigator.serviceWorker.register("/sw.js").then((reg) => {
    if (typeof window !== "undefined" && (window as any).__PWA_DEBUG__) {
      console.log("[PWA] Service Worker registered:", reg.scope);
    }
  }).catch((err) => {
    if (typeof window !== "undefined" && (window as any).__PWA_DEBUG__) {
      console.error("[PWA] Service Worker registration failed:", err);
    }
  });
}

// beforeinstallprompt is Chromium-only; we stash the event so a button can
// re-fire it later. iOS Safari has no prompt — callers show "Add to Home
// Screen" instructions instead (see isIos below).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isIosDevice = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    setIsIos(isIosDevice);

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    if ((window as any).__PWA_DEBUG__) {
      console.log("[PWA] Init:", {
        userAgent: window.navigator.userAgent,
        isIos: isIosDevice,
        isStandalone: standalone,
        hasServiceWorker: !!navigator.serviceWorker,
        protocol: window.location.protocol,
      });
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if ((window as any).__PWA_DEBUG__) {
        console.log("[PWA] beforeinstallprompt fired and captured");
      }
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      if ((window as any).__PWA_DEBUG__) {
        console.log("[PWA] app installed successfully");
      }
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Log when page becomes visible (important for installability)
    const onVisibilityChange = () => {
      if ((window as any).__PWA_DEBUG__ && document.visibilityState === "visible") {
        console.log("[PWA] Page became visible, prompt available:", !!deferredPrompt);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
    return choice.outcome === "accepted";
  };

  return {
    canInstall: deferredPrompt !== null && !installed,
    promptInstall,
    installed,
    isStandalone,
    isIos,
  };
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}
