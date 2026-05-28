import { Link } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

export function Logo({ className }: { className?: string }) {
  const t = useT();
  return (
    <Link to="/" className={`flex items-center gap-2 font-display font-bold text-lg ${className ?? ""}`}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-soft">
        <Bot className="h-5 w-5" />
      </span>
      <span className="tracking-tight">{t("brand.name")}</span>
    </Link>
  );
}
