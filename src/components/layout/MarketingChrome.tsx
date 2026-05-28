import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LanguageProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";

export function MarketingHeader() {
  const t = useT();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
          <a href="#features" className="transition-colors hover:text-foreground">{t("nav.features")}</a>
          <a href="#workflow" className="transition-colors hover:text-foreground">{t("nav.workflow")}</a>
          <Link to="/store/$slug" params={{ slug: "noor-store" }} className="transition-colors hover:text-foreground">
            {t("nav.store")}
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/auth">{t("nav.login")}</Link>
          </Button>
          <Button asChild size="sm" className="shadow-soft">
            <Link to="/auth">{t("nav.start")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  const t = useT();
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-2 space-y-3">
            <Logo />
            <p className="max-w-xs text-sm text-muted-foreground">{t("brand.tagline")}</p>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-3">{t("footer.product")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#features" className="hover:text-foreground">{t("nav.features")}</a></li>
              <li><a href="#workflow" className="hover:text-foreground">{t("nav.workflow")}</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-3">{t("footer.legal")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground">Terms</a></li>
              <li><a href="#" className="hover:text-foreground">Privacy</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-border/60 pt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Botly. {t("footer.rights")}.
        </div>
      </div>
    </footer>
  );
}
