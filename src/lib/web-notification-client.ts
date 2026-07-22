const STORED_ID_LIMIT = 200;

type BadgingNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

type BadgingServiceWorkerRegistration = ServiceWorkerRegistration & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let notificationAudioContext: AudioContext | undefined;
let bellPrepared = false;
let lastBellAt = 0;
let originalDocumentTitle = "";

export function readNotificationIds(key: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(key);
    const values = raw ? (JSON.parse(raw) as unknown[]) : [];
    return new Set(values.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set<string>();
  }
}

export function saveNotificationIds(key: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids].slice(-STORED_ID_LIMIT)));
  } catch {
    // Notification state is best-effort; the UI still refreshes from the server.
  }
}

export function prepareNotificationBell() {
  if (typeof window === "undefined" || bellPrepared) return;
  bellPrepared = true;
  const context = getNotificationAudioContext();
  if (context?.state === "suspended") {
    context.resume().catch(() => {});
  }

  const unlock = () => {
    const unlockedContext = getNotificationAudioContext();
    if (unlockedContext?.state === "suspended") {
      unlockedContext.resume().catch(() => {});
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("touchstart", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("click", unlock);
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  window.addEventListener("click", unlock);
}

export function ringUnseenNotificationIds(storageKey: string, ids: string[]) {
  if (ids.length === 0) return 0;
  const alreadyRung = readNotificationIds(storageKey);
  const unrung = ids.filter((id) => !alreadyRung.has(id));
  if (unrung.length === 0) return 0;

  saveNotificationIds(storageKey, new Set([...alreadyRung, ...unrung]));
  playNotificationBell();
  return unrung.length;
}

export function updateInstalledAppBadge(count: number) {
  if (typeof navigator === "undefined") return;
  const badging = navigator as BadgingNavigator;
  try {
    if (count > 0 && badging.setAppBadge) {
      void badging.setAppBadge(count);
    } else if (count <= 0 && badging.clearAppBadge) {
      void badging.clearAppBadge();
    }
  } catch {
    // Unsupported on some browsers/PWAs; in-page badges remain the source of truth.
  }

  try {
    if ("serviceWorker" in navigator && navigator.serviceWorker.getRegistration) {
      void navigator.serviceWorker.getRegistration().then((registration) => {
        if (!registration) return undefined;
        const badgingRegistration = registration as BadgingServiceWorkerRegistration;
        if (count > 0 && badgingRegistration.setAppBadge) {
          return badgingRegistration.setAppBadge(count);
        }
        if (count <= 0 && badgingRegistration.clearAppBadge) {
          return badgingRegistration.clearAppBadge();
        }
        return undefined;
      });
    }
  } catch {
    // Some browsers expose badging only on Navigator, some only on the SW registration.
  }

  updateDocumentTitleBadge(count);
}

function playNotificationBell() {
  if (typeof window === "undefined") return;
  prepareNotificationBell();

  const now = Date.now();
  if (now - lastBellAt < 1500) return;
  lastBellAt = now;

  try {
    const context = getNotificationAudioContext();
    if (!context) {
      vibrateNotification();
      return;
    }
    if (context.state === "suspended") {
      vibrateNotification();
      context.resume().then(() => playBellTone(context)).catch(() => {});
      return;
    }
    playBellTone(context);
  } catch {
    vibrateNotification();
  }
}

function playBellTone(context: AudioContext) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
  gain.connect(context.destination);

  [880, 1175].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    const start = context.currentTime + index * 0.16;
    oscillator.start(start);
    oscillator.stop(start + 0.18);
  });
}

function getNotificationAudioContext() {
  if (typeof window === "undefined") return undefined;
  if (notificationAudioContext) return notificationAudioContext;

  const AudioContextClass =
    window.AudioContext || (window as WebkitWindow).webkitAudioContext;
  if (!AudioContextClass) return undefined;

  try {
    notificationAudioContext = new AudioContextClass();
    return notificationAudioContext;
  } catch {
    return undefined;
  }
}

function vibrateNotification() {
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate([90, 50, 90]);
    }
  } catch {
    // Vibration is optional and unsupported on many desktop browsers.
  }
}

function updateDocumentTitleBadge(count: number) {
  if (typeof document === "undefined") return;
  if (!originalDocumentTitle) {
    originalDocumentTitle = document.title.replace(/^\(\d+\)\s+/, "") || "Botly";
  }
  document.title = count > 0 ? `(${count}) ${originalDocumentTitle}` : originalDocumentTitle;
}
