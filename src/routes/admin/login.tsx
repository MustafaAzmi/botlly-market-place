import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loginAdmin,
  requestAdminPasswordReset,
  resetAdminPassword,
} from "@/lib/admin.functions";
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

type LoginMode = "login" | "forgot" | "reset";

function AdminLoginPage() {
  const navigate = useNavigate();
  const loginAdminFn = useServerFn(loginAdmin);
  const requestResetFn = useServerFn(requestAdminPasswordReset);
  const resetPasswordFn = useServerFn(resetAdminPassword);

  const [mode, setMode] = useState<LoginMode>("login");
  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
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

  const sendResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsapp.trim()) {
      toast.error("اكتب رقم الهاتف المسجل للأدمن");
      return;
    }

    setLoading(true);
    try {
      await requestResetFn({ data: { whatsapp } });
      toast.success("تم إرسال رمز الاسترجاع إلى واتساب الأدمن");
      setMode("reset");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إرسال رمز الاسترجاع");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsapp.trim() || !resetCode.trim() || !newPassword.trim()) {
      toast.error("أكمل رقم الهاتف والرمز وكلمة المرور الجديدة");
      return;
    }

    setLoading(true);
    try {
      await resetPasswordFn({ data: { whatsapp, code: resetCode, newPassword } });
      toast.success("تم تغيير كلمة المرور. سجل دخولك الآن");
      setPassword("");
      setResetCode("");
      setNewPassword("");
      setMode("login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تغيير كلمة المرور");
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

          {mode === "login" && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <PhoneField value={whatsapp} onChange={setWhatsapp} disabled={loading} />

              <PasswordField
                id="password"
                label="كلمة المرور"
                placeholder="أدخل كلمة المرور"
                value={password}
                onChange={setPassword}
                visible={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                disabled={loading}
              />

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="text-sm font-medium text-primary hover:underline"
                  onClick={() => setMode("forgot")}
                >
                  نسيت كلمة المرور؟
                </button>
              </div>

              <Button type="submit" disabled={loading} className="w-full gap-2">
                {loading ? "جارٍ..." : "دخول"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={sendResetCode} className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                اكتب رقم الأدمن المسجل، ونرسل لك رمز تغيير كلمة المرور على واتساب.
              </div>
              <PhoneField value={whatsapp} onChange={setWhatsapp} disabled={loading} />
              <Button type="submit" disabled={loading} className="w-full gap-2">
                {loading ? "جارٍ الإرسال..." : "إرسال رمز الاسترجاع"}
                <KeyRound className="h-4 w-4" />
              </Button>
              <BackToLogin onClick={() => setMode("login")} />
            </form>
          )}

          {mode === "reset" && (
            <form onSubmit={resetPassword} className="space-y-6">
              <PhoneField value={whatsapp} onChange={setWhatsapp} disabled={loading} />
              <div>
                <Label htmlFor="reset-code">رمز الاسترجاع</Label>
                <Input
                  id="reset-code"
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="123456"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  disabled={loading}
                  className="mt-2 text-start"
                />
              </div>
              <PasswordField
                id="new-password"
                label="كلمة المرور الجديدة"
                placeholder="اكتب كلمة مرور جديدة"
                value={newPassword}
                onChange={setNewPassword}
                visible={showNewPassword}
                onToggle={() => setShowNewPassword((value) => !value)}
                disabled={loading}
              />
              <Button type="submit" disabled={loading} className="w-full gap-2">
                {loading ? "جارٍ الحفظ..." : "تغيير كلمة المرور"}
                <KeyRound className="h-4 w-4" />
              </Button>
              <BackToLogin onClick={() => setMode("login")} />
            </form>
          )}
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
            تحكم بالمتاجر، طلبات الزبائن، وأرقام الوسطاء من مكان واحد.
          </p>
        </div>
        <div className="text-sm text-white/60">© 2026 Botly Market Place</div>
      </div>
    </div>
  );
}

function PhoneField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <Label htmlFor="whatsapp">رقم الهاتف</Label>
      <Input
        id="whatsapp"
        type="tel"
        inputMode="tel"
        dir="ltr"
        placeholder="07XX XXX XXXX"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-2 text-start"
      />
    </div>
  );
}

function PasswordField({
  id,
  label,
  placeholder,
  value,
  onChange,
  visible,
  onToggle,
  disabled,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-2">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="pe-11"
        />
        <button
          type="button"
          aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
          onClick={onToggle}
          disabled={disabled}
          className="absolute inset-y-0 end-0 inline-flex w-10 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function BackToLogin({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="w-full text-center text-sm font-medium text-muted-foreground hover:text-primary"
      onClick={onClick}
    >
      رجوع إلى تسجيل الدخول
    </button>
  );
}
