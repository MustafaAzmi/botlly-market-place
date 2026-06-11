import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, Settings } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { readCustomerSession, clearCustomerSession } from "@/lib/customerSession";

export const Route = createFileRoute("/customer/dashboard")({
  head: () => ({ meta: [{ title: "لوحة الزبون - Botly" }] }),
  component: CustomerDashboard,
});

function CustomerDashboard() {
  const navigate = useNavigate();
  const session = readCustomerSession();

  useEffect(() => {
    if (!session) {
      navigate({ to: "/customer/auth" });
    }
  }, [navigate, session]);

  const handleLogout = () => {
    clearCustomerSession();
    navigate({ to: "/customer/auth" });
  };

  if (!session) return null;

  const { customer } = session;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card shadow-soft">
        <div className="container mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold">لوحة الزبون</h1>
            <p className="text-sm text-muted-foreground">أهلاً {customer.name} 👋</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="gap-2">
              <Settings className="h-4 w-4" />
              الإعدادات
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              تسجيل خروج
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto max-w-6xl px-4 py-8">
        {/* Coming Soon */}
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary-soft text-primary text-2xl">
            🚗
          </div>
          <h2 className="mt-4 text-xl font-semibold">قريباً...</h2>
          <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
            نحن نعمل على إضافة فلاتر البحث بأنواع السيارات والموديلات واللون.
            قريباً ستتمكن من البحث بسهولة والعثور على قطع السيارة التي تريدها! 🔧
          </p>
          <div className="mt-6 space-y-2">
            <p className="text-sm">في الوقت الحالي، استخدم الواتس اب:</p>
            <Button className="mx-auto gap-2" asChild>
              <a
                href={`https://wa.me/botly`}
                target="_blank"
                rel="noreferrer"
              >
                💬 تواصل على الواتس اب
              </a>
            </Button>
          </div>
        </div>

        {/* User Info Card */}
        <div className="mt-8 rounded-2xl border border-border bg-card p-6">
          <h3 className="font-semibold">بيانات حسابك</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">الاسم</p>
              <p className="font-medium">{customer.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">رقم الواتس اب</p>
              <p className="font-medium">{customer.whatsapp}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">أقرب نقطة دالة</p>
              <p className="font-medium">{customer.landmark}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">المحافظة</p>
              <p className="font-medium">{customer.governorate}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-4 gap-2">
            <Settings className="h-3.5 w-3.5" />
            تعديل البيانات
          </Button>
        </div>
      </main>
    </div>
  );
}
