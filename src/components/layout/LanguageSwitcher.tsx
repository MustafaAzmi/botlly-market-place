import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageProvider";
import { Languages } from "lucide-react";

export function LanguageSwitcher({ variant = "ghost" }: { variant?: "ghost" | "outline" }) {
  const { locale, setLocale } = useLanguage();
  return (
    <Button
      variant={variant}
      size="sm"
      onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
      className="gap-2 font-medium"
      aria-label="Toggle language"
    >
      <Languages className="h-4 w-4" />
      {locale === "ar" ? "EN" : "العربية"}
    </Button>
  );
}
