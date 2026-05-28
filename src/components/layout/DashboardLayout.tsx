import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  Store,
  ShoppingBag,
  Workflow,
  LogOut,
} from "lucide-react";
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useT } from "@/i18n/LanguageProvider";
import { Button } from "@/components/ui/button";

const items = [
  { to: "/dashboard", icon: LayoutDashboard, key: "nav.dashboard" as const },
  { to: "/dashboard/products", icon: Package, key: "nav.products" as const },
  { to: "/dashboard/orders", icon: ShoppingBag, key: "nav.orders" as const },
  { to: "/dashboard/store", icon: Store, key: "nav.store" as const },
  { to: "/dashboard/workflow", icon: Workflow, key: "nav.workflowPage" as const },
];

export function DashboardLayout({ children, title, subtitle, actions }: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const t = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-secondary/40">
      <div className="flex min-h-screen w-full">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 border-e border-border bg-sidebar lg:flex lg:flex-col">
          <div className="p-5 border-b border-sidebar-border">
            <Logo />
          </div>
          <nav className="flex-1 space-y-1 p-3">
            {items.map((item) => {
              const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary-soft text-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>
          <div className="p-3 border-t border-sidebar-border">
            <Button asChild variant="ghost" className="w-full justify-start gap-3 text-muted-foreground">
              <Link to="/">
                <LogOut className="h-4 w-4" />
                {t("nav.logout")}
              </Link>
            </Button>
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md lg:px-8">
            <div className="lg:hidden">
              <Logo />
            </div>
            <div className="hidden lg:block">
              {title && <h1 className="text-xl font-semibold">{title}</h1>}
            </div>
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <div className="hidden sm:block h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/60" />
            </div>
          </header>

          {/* Mobile nav */}
          <nav className="flex gap-1 overflow-x-auto border-b border-border bg-background px-2 py-2 lg:hidden">
            {items.map((item) => {
              const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                    active ? "bg-primary-soft text-primary" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>

          <main className="flex-1 p-4 lg:p-8">
            <div className="mx-auto max-w-6xl">
              {(title || subtitle || actions) && (
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between lg:hidden">
                  <div>
                    {title && <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
                    {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
                  </div>
                  {actions}
                </div>
              )}
              {(title || subtitle || actions) && (
                <div className="mb-8 hidden lg:flex lg:items-end lg:justify-between">
                  <div>
                    {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
                  </div>
                  {actions}
                </div>
              )}
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
