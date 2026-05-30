import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/layout/Logo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { toast } from "sonner";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { ADMIN_CREDENTIALS, ADMIN_SESSION_KEY } from "@/lib/adminMockData";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "تسجيل دخول الأدمن — Botly" }] }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = identifier.trim().toLowerCase();
    const isAdmin = id === ADMIN_CREDENTIALS.email.toLowerCase() || id === ADMIN_CREDENTIALS.phone;

    if (!isAdmin) {
      toast.error("بيانات غير صحيحة. هذه الصفحة للأدمن فقط.");
      return;
    }
    if (password.length < 4) {
      toast.error("الرجاء إدخال كلمة المرور");
      return;
    }
    setLoading(true);

    Promise.resolve()
      .then(() => {
        sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ id, at: Date.now() }));
        toast.success("تم تسجيل الدخول كأدمن");
        navigate({ to: "/admin" });
      })
      .catch((err) => {
        console.error(err);
        toast.error("حدث خطأ أثناء تسجيل الدخول");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col">
        <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <Logo />
          <LanguageSwitcher />
        </header>
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <ShieldCheck className="h-3 w-3" /> دخول مقيد
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight">لوحة تحكم الأدمن</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              ادخل بريدك الإلكتروني أو رقم هاتفك المسجل كأدمن.
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="identifier">البريد الإلكتروني أو رقم الهاتف</Label>
                <Input
                  id="identifier"
                  dir="ltr"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="admin@example.com أو 07XXXXXXXXX"
                  className="h-11 text-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full gap-2 shadow-soft"
                disabled={loading}
              >
                {loading ? "جارٍ التحقق…" : "دخول"}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                صفحة خاصة بفريق إدارة بوتلي. سيتم لاحقاً ربطها بـ Lovable Cloud وجدول الأدوار.
              </p>
            </form>

            <div className="mt-8 text-center text-sm text-muted-foreground">
              <Link to="/" className="hover:text-foreground">
                ← العودة للرئيسية
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div
        className="relative hidden flex-col justify-between p-12 text-primary-foreground lg:flex"
        style={{ background: "var(--gradient-primary)" }}
      >
        <div className="flex items-center gap-2 text-sm font-medium opacity-90">
          <ShieldCheck className="h-4 w-4" /> Botly Admin Console
        </div>
        <div>
          <h2 className="text-balance text-4xl font-bold leading-tight">تحكم كامل بمنصة بوتلي</h2>
          <p className="mt-4 max-w-md text-primary-foreground/85">
            راقب المتاجر، أدِر باقات الدفع، شركات التوصيل، وأرسل تنبيهات جماعية عبر البوت — كل ذلك
            من مكان واحد.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            { v: "0", l: "متجر مسجل" },
            { v: "0", l: "شركة توصيل" },
            { v: "0", l: "رسالة شهرياً" },
          ].map((s) => (
            <div key={s.l} className="rounded-xl bg-primary-foreground/10 p-3 backdrop-blur-sm">
              <div className="text-xl font-bold">{s.v}</div>
              <div className="mt-1 text-xs opacity-80">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
