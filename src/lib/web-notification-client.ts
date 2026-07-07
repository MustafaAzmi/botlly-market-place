const STORED_ID_LIMIT = 200;

type BadgingNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

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
}

function playNotificationBell() {
  if (typeof window === "undefined") return;
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const context = new AudioContextClass();
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

    window.setTimeout(() => context.close().catch(() => {}), 800);
  } catch {
    // Browsers can block audio until the user interacts with the page.
  }
}
