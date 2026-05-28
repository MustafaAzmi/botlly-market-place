// Shared currencies store. Admin manages this list; merchants read it when
// adding products. Persisted in localStorage so admin edits propagate to the
// merchant dashboard within the same browser.
// TODO(supabase): replace with a `platform_currencies` table + realtime sync.
import { useSyncExternalStore } from "react";

export interface Currency {
  code: string; // e.g. "IQD", "USD"
  label: string; // display name e.g. "دينار عراقي"
  active: boolean;
}

const STORAGE_KEY = "botly.currencies.v1";
const EVENT = "botly:currencies-changed";

const DEFAULTS: Currency[] = [
  { code: "IQD", label: "دينار عراقي", active: true },
  { code: "USD", label: "دولار أمريكي", active: true },
  { code: "SAR", label: "ريال سعودي", active: true },
  { code: "AED", label: "درهم إماراتي", active: true },
];

function read(): Currency[] {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Currency[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function write(next: Currency[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useCurrencies(): Currency[] {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}

export function getCurrencies(): Currency[] {
  return read();
}

export function addCurrency(c: Currency) {
  const list = read();
  if (list.some((x) => x.code.toUpperCase() === c.code.toUpperCase())) return false;
  write([...list, { ...c, code: c.code.toUpperCase() }]);
  return true;
}

export function updateCurrency(code: string, patch: Partial<Currency>) {
  write(read().map((c) => (c.code === code ? { ...c, ...patch } : c)));
}

export function removeCurrency(code: string) {
  write(read().filter((c) => c.code !== code));
}
