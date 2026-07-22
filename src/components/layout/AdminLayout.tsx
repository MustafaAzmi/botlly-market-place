import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Car,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  PhoneCall,
  ShieldCheck,
  Store,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { ADMIN_SESSION_KEY } from "@/lib/adminMockData";
import { getCurrentAdmin } from "@/lib/admin.functions";
import { clearAdminSession, readAdminSession } from "@/lib/adminSession";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";

const items = [
  { to: "/admin", icon: LayoutDashboard, label: "نظرة عامة" },
  { to: "/admin/stores", icon: Store, label: "المتاجر" },
  { to: "/admin/popular-requests", icon: TrendingUp, label: "الأكثر طلباً" },
  { to: "/admin/fitters", icon: Wrench, label: "فيتر" },
  { to: "/admin/supervisors", icon: ShieldCheck, label: "المشرفون" },
  { to: "/admin/catalog", icon: Car, label: "الكتالوج" },
  { to: "/admin/mediators", icon: PhoneCall, label: "الوسطاء" },
  { to: "/admin/more", icon: MoreHorizontal, label: "المزيد" },
];

export function AdminLayout({
  children,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const currentAdminFn = useServerFn(getCurrentAdmin);

  useEffect(() => {
    const session = readAdminSession();
    if (!session?.token) {
      navigate({ to: "/admin/login" });
      return;
    }
    currentAdminFn({ data: { token: session.token } }).catch(() => {
      clearAdminSession();
      navigate({ to: "/admin/login" });
    });
  }, [currentAdminFn, navigate, pathname]);

  const logout = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    }
    navigate({ to: "/admin/login" });
  };

  return (
    <div className="min-h-screen bg-secondary/40">
      <div className="flex min-h-screen w-full">
        <aside className="hidden w-64 shrink-0 border-e border-border bg-sidebar lg:flex lg:flex-col">
          <div className="border-b border-sidebar-border p-5">
            <Logo />
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <ShieldCheck className="h-3 w-3" />
              لوحة الأدمن
            </div>
          </div>
          <nav className="flex-1 space-y-1 p-3">
            {items.map((item) => {
              const active =
                pathname === item.to || (item.to !== "/admin" && pathname.startsWith(item.to));
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
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-sidebar-border p-3">
            <Button
              onClick={logout}
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
              تسجيل الخروج
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md lg:px-8">
            <div className="lg:hidden">
              <Logo />
            </div>
            <div className="hidden lg:block">
              {title ? <h1 className="text-xl font-semibold">{title}</h1> : null}
            </div>
            <LanguageSwitcher />
          </header>

          <nav className="flex gap-1 overflow-x-auto border-b border-border bg-background px-2 py-2 lg:hidden">
            {items.map((item) => {
              const active =
                pathname === item.to || (item.to !== "/admin" && pathname.startsWith(item.to));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                    active ? "bg-primary-soft text-primary" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <main className="flex-1 p-4 lg:p-8">
            <div className="mx-auto max-w-7xl">
              {(title || subtitle || actions) && (
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    {title ? (
                      <h1 className="text-2xl font-semibold tracking-tight lg:hidden">{title}</h1>
                    ) : null}
                    {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
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
