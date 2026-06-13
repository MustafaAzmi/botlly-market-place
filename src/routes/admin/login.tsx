import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAdmin } from "@/lib/admin.functions";
import { writeAdminSession } from "@/lib/adminSession";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Admin Login - Botly" },
      { name: "description", content: "Admin panel for Botly market place." },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const loginAdminFn = useServerFn(loginAdmin);

  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!whatsapp.trim() || !password.trim()) {
      toast.error("أكمل جميع الحقول");
      return;
    }

    setLoading(true);
    try {
      const result = await loginAdminFn({ data: { whatsapp, password } });
      writeAdminSession({
        token: result.token,
        adminId: result.admin.id,
        whatsapp: result.admin.whatsapp,
        signedInAt: new Date().toISOString(),
      });
      toast.success("تم الدخول بنجاح");
      navigate({ to: "/admin" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطأ من الخادم");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold">دخول الأدمن</h1>
            <p className="mt-2 text-sm text-muted-foreground">Botly Market Place</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="whatsapp">رقم الهاتف</Label>
              <Input
                id="whatsapp"
                type="tel"
                inputMode="tel"
                dir="ltr"
                placeholder="07XX XXX XXXX"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                disabled={loading}
                className="mt-2 text-start"
              />
            </div>

            <div>
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                placeholder="أدخل كلمة المرور"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="mt-2"
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full gap-2">
              {loading ? "جارٍ..." : "دخول"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-primary to-primary-dark p-12 text-white lg:flex">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" />
          <span className="text-lg font-bold">Botly Admin</span>
        </div>
        <div>
          <h2 className="text-4xl font-bold leading-tight">لوحة التحكم الإدارية</h2>
          <p className="mt-4 text-lg text-white/80">
            تحكّم بظهور المتاجر، طلبات الزبائن، وأرقام الوسطاء من مكان واحد.
          </p>
        </div>
        <div className="text-sm text-white/60">© 2026 Botly Market Place</div>
      </div>
    </div>
  );
}
