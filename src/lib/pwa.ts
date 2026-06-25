// Client-side PWA helpers shared by both apps (بوتلي زبون / بوتلي تاجر).
//
// One service worker serves both installs; which app gets installed is decided
// by whichever manifest the CURRENT page links (customer pages link the
// customer manifest, merchant pages the merchant one), so the install prompt
// on a customer page installs "بوتلي زبون" and vice versa — both can coexist
// on the same device because the manifests have different ids/scopes.

import { useEffect, useState } from "react";

export type PwaApp = "customer" | "merchant" | "fitter";
export type BrowserFamily = "chrome" | "firefox" | "opera" | "edge" | "samsung" | "ios" | "in-app" | "other";

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
    themeColor: "#22c55e",
    icon: "/icons/merchant.svg",
  },
  fitter: {
    name: "بوتلي فيتر",
    manifest: "/manifest-fitter.webmanifest",
    startUrl: "/f",
    themeColor: "#2563eb",
    icon: "/icons/fitter.svg",
  },
};

// TanStack head() links for a given app — spread into a route's head config so
// the page advertises the right manifest + icons.
export function pwaHeadLinks(app: PwaApp) {
  const cfg = PWA_APPS[app];
  return [
    { rel: "manifest", href: cfg.manifest },
    { rel: "icon", href: cfg.icon, type: "image/svg+xml" },
    { rel: "apple-touch-icon", href: `/icons/${app}-apple-180.png` },
  ];
}

export function pwaHeadMeta(app: PwaApp) {
  const cfg = PWA_APPS[app];
  return [
    { name: "theme-color", content: cfg.themeColor },
    { name: "application-name", content: cfg.name },
    { name: "mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    { name: "apple-mobile-web-app-title", content: cfg.name },
  ];
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  ensureInstallPromptCapture();

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

let savedInstallPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(event: BeforeInstallPromptEvent | null) => void>();

function publishInstallPrompt(event: BeforeInstallPromptEvent | null) {
  savedInstallPrompt = event;
  promptListeners.forEach((listener) => listener(event));
}

function ensureInstallPromptCapture() {
  if (typeof window === "undefined") return;
  const w = window as typeof window & { __BOTLY_PWA_PROMPT_CAPTURED__?: boolean };
  if (w.__BOTLY_PWA_PROMPT_CAPTURED__) return;
  w.__BOTLY_PWA_PROMPT_CAPTURED__ = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    publishInstallPrompt(event as BeforeInstallPromptEvent);
    if ((window as any).__PWA_DEBUG__) {
      console.log("[PWA] beforeinstallprompt captured globally");
    }
  });

  window.addEventListener("appinstalled", () => {
    publishInstallPrompt(null);
    if ((window as any).__PWA_DEBUG__) {
      console.log("[PWA] app installed successfully");
    }
  });
}

ensureInstallPromptCapture();

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    savedInstallPrompt,
  );
  const [installed, setInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [browserFamily, setBrowserFamily] = useState<BrowserFamily>("other");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isIosDevice = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isAndroidDevice = /android/i.test(window.navigator.userAgent);
    const inAppBrowser = detectInAppBrowser(window.navigator.userAgent);
    setIsIos(isIosDevice);
    setIsAndroid(isAndroidDevice);
    setIsInAppBrowser(inAppBrowser);
    setBrowserFamily(inAppBrowser ? "in-app" : detectBrowserFamily(window.navigator.userAgent));

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    if ((window as any).__PWA_DEBUG__) {
      console.log("[PWA] Init:", {
        userAgent: window.navigator.userAgent,
        isIos: isIosDevice,
        isAndroid: isAndroidDevice,
        isInAppBrowser: inAppBrowser,
        isStandalone: standalone,
        hasServiceWorker: !!navigator.serviceWorker,
        protocol: window.location.protocol,
      });
    }

    ensureInstallPromptCapture();
    setDeferredPrompt(savedInstallPrompt);
    const onPromptChange = (event: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(event);
    };
    const onInstalled = () => setInstalled(true);

    promptListeners.add(onPromptChange);
    window.addEventListener("appinstalled", onInstalled);

    // Log when page becomes visible (important for installability)
    const onVisibilityChange = () => {
      if ((window as any).__PWA_DEBUG__ && document.visibilityState === "visible") {
        console.log("[PWA] Page became visible, prompt available:", !!deferredPrompt);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      promptListeners.delete(onPromptChange);
      window.removeEventListener("appinstalled", onInstalled);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    publishInstallPrompt(null);
    return choice.outcome === "accepted";
  };

  return {
    canInstall: deferredPrompt !== null && !installed,
    promptInstall,
    installed,
    isStandalone,
    isIos,
    isAndroid,
    isInAppBrowser,
    browserFamily,
  };
}

export function detectBrowserFamily(userAgent: string): BrowserFamily {
  const ua = userAgent.toLowerCase();
  if (detectInAppBrowser(userAgent)) return "in-app";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (ua.includes("samsungbrowser")) return "samsung";
  if (ua.includes("opr/") || ua.includes("opera")) return "opera";
  if (ua.includes("edg/")) return "edge";
  if (ua.includes("firefox") || ua.includes("fxios")) return "firefox";
  if (ua.includes("chrome") || ua.includes("crios")) return "chrome";
  return "other";
}

export function detectInAppBrowser(userAgent: string) {
  const ua = userAgent.toLowerCase();
  return (
    ua.includes("fbav") ||
    ua.includes("fban") ||
    ua.includes("instagram") ||
    ua.includes("line/") ||
    ua.includes("wv") ||
    ua.includes("whatsapp")
  );
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}
