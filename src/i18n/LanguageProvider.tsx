import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translations, type Locale, type TranslationKey } from "./translations";

interface LanguageContextValue {
  locale: Locale;
  dir: "rtl" | "ltr";
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = "botly.locale";

function applyDocumentLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ar");

  // Hydrate from storage once on client
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored === "ar" || stored === "en") {
      setLocaleState(stored);
      applyDocumentLocale(stored);
    } else {
      applyDocumentLocale("ar");
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, l);
    applyDocumentLocale(l);
  }, []);

  const t = useCallback<LanguageContextValue["t"]>(
    (key, vars) => {
      const dict = translations[locale] as Record<string, string>;
      const fallback = translations.en as Record<string, string>;
      const raw: string = dict[key] ?? fallback[key] ?? (key as string);
      if (!vars) return raw;
      return Object.entries(vars).reduce<string>(
        (acc, [k, v]) => acc.replace(new RegExp(`{{${k}}}`, "g"), String(v)),
        raw,
      );
    },
    [locale],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ locale, dir: locale === "ar" ? "rtl" : "ltr", setLocale, t }),
    [locale, setLocale, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

export function useT() {
  return useLanguage().t;
}
