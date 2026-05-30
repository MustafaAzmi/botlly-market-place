import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/i18n/LanguageProvider";
import { loginAdmin, signupAdmin } from "@/lib/admin.functions";
import { writeAdminSession } from "@/lib/adminSession";

export const Route = createFileRoute("/admin/login")(
  {
    head: () => ({
      meta: [
        { title: "Admin Login - Botly" },
        { name: "description", content: "Admin panel for Botly market place." },
      ],
    }),
  },
  {
    component: AdminLoginPage,
  }
);

const copy = {
  ar: {
    email: "البريد الإلكتروني",
    emailPlaceholder: "admin@botly.tech",
    password: "كلمة المرور",
    passwordPlaceholder: "أدخل كلمة المرور",
    loginBtn: "دخول",
    signupBtn: "إنشاء حساب",
    required: "أكمل جميع الحقول",
    passwordShort: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
    loginSuccess: "تم الدخول بنجاح",
    signupSuccess: "تم إنشاء الحساب بنجاح",
    serverError: "خطأ من الخادم",
  },
  en: {
    email: "Email",
    emailPlaceholder: "admin@botly.tech",
    password: "Password",
    passwordPlaceholder: "Enter your password",
    loginBtn: "Sign In",
    signupBtn: "Sign Up",
    required: "Please fill in all fields",
    passwordShort: "Password must be at least 6 characters",
    loginSuccess: "Successfully signed in",
    signupSuccess: "Account created successfully",
    serverError: "Server error",
  },
};

function AdminLoginPage() {
  const { locale } = useLanguage();
  const text = copy[locale];
  const navigate = useNavigate();
  const loginAdminFn = useServerFn(loginAdmin);
  const signupAdminFn = useServerFn(signupAdmin);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignup, setIsSignup] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      toast.error(text.required);
      return;
    }

    if (password.length < 6) {
      toast.error(text.passwordShort);
      return;
    }

    setLoading(true);

    try {
      const result = isSignup
        ? await signupAdminFn({ data: { email, password } })
        : await loginAdminFn({ data: { email, password } });

      writeAdminSession({
        token: result.token,
        adminId: result.admin.id,
        email: result.admin.email,
        signedInAt: new Date().toISOString(),
      });

      toast.success(isSignup ? text.signupSuccess : text.loginSuccess);
      navigate({ to: "/admin" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.serverError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold">Admin Login</h1>
            <p className="mt-2 text-sm text-muted-foreground">Botly Market Place</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="email">{text.email}</Label>
              <Input
                id="email"
                type="email"
                placeholder={text.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="password">{text.password}</Label>
              <Input
                id="password"
                type="password"
                placeholder={text.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="mt-2"
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full gap-2">
              {loading ? "جارٍ..." : isSignup ? text.signupBtn : text.loginBtn}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setIsSignup(!isSignup)}
            className="w-full text-center text-sm text-primary hover:underline"
          >
            {isSignup ? "العودة للدخول" : "إنشاء حساب جديد"}
          </button>

          <div className="mt-8 rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-medium mb-2">⚠️ صفحة مؤقتة للاختبار</p>
            <p>يمكنك استخدام أي بريد وكلمة مرور (6 أحرف+)</p>
          </div>
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
            أدِر المتاجر والمنتجات وشركات التوصيل من مكان واحد.
          </p>
        </div>
        <div className="text-sm text-white/60">© 2026 Botly Market Place</div>
      </div>
    </div>
  );
}
