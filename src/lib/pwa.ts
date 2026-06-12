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
    startUrl: "/customer/auth?source=pwa",
    themeColor: "#16a34a",
    icon: "/icons/customer-192.png",
  },
  merchant: {
    name: "بوتلي تاجر",
    manifest: "/manifest-merchant.webmanifest",
    startUrl: "/auth?source=pwa",
    themeColor: "#0d7490",
    icon: "/icons/merchant-192.png",
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
  // Register early (not waiting for load) to ensure beforeinstallprompt fires.
  // Modern browsers defer service worker activation until after initial load anyway.
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
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

    setIsIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent));
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (typeof window !== "undefined" && (window as any).__PWA_DEBUG__) {
        console.log("[PWA] beforeinstallprompt captured");
      }
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      if (typeof window !== "undefined" && (window as any).__PWA_DEBUG__) {
        console.log("[PWA] app installed");
      }
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (typeof window !== "undefined" && (window as any).__PWA_DEBUG__) {
      console.log("[PWA] listeners attached, isStandalone:", standalone, "isIos:", /iphone|ipad|ipod/i.test(window.navigator.userAgent));
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
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
