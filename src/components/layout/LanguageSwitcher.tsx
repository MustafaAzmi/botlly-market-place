import { Languages } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { Locale } from "@/i18n/translations";

const LANGUAGE_LABELS = {
  ar: "العربية",
  ku: "کوردی",
  en: "English",
} as const;

export function LanguageSwitcher({ variant = "ghost" }: { variant?: "ghost" | "outline" }) {
  const { locale, setLocale } = useLanguage();
  return (
    <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
      <SelectTrigger
        aria-label="Choose language"
        className={`h-9 w-[8.5rem] gap-2 ${
          variant === "outline" ? "" : "border-transparent bg-transparent shadow-none"
        }`}
      >
        <Languages className="h-4 w-4" />
        <SelectValue>{LANGUAGE_LABELS[locale]}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="ar">العربية</SelectItem>
        <SelectItem value="ku">کوردی سورانی</SelectItem>
        <SelectItem value="en">English</SelectItem>
      </SelectContent>
    </Select>
  );
}
