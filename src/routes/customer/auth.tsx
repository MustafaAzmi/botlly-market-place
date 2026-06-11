import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Mail, Phone, MapPin, Building2, ArrowRight, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/i18n/LanguageProvider";
import { loginCustomer, signupCustomer } from "@/lib/customer.functions";
import { writeCustomerSession } from "@/lib/customerSession";

export const Route = createFileRoute("/customer/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل دخول الزبون - Botly" },
      { name: "description", content: "Login to your Botly customer account." },
    ],
  }),
  component: CustomerAuthPage,
});

type AuthMode = "login" | "signup";

export function CustomerAuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [whatsapp, setWhatsapp] = useState("");
  const [name, setName] = useState("");
  const [landmark, setLandmark] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const loginFn = useServerFn(loginCustomer);
  const signupFn = useServerFn(signupCustomer);
  const { language } = useLanguage();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsapp.trim()) {
      toast.error("الرجاء إدخال رقم الواتس اب");
      return;
    }

    setLoading(true);
    try {
      const result = await loginFn({ whatsapp });
      if (result.ok) {
        writeCustomerSession(result.customer, result.token);
        toast.success("تسجيل دخول ناجح ✅");
        navigate({ to: "/customer/dashboard" });
      } else {
        toast.error(result.error || "فشل تسجيل الدخول");
      }
    } catch (error) {
      toast.error("حدث خطأ أثناء تسجيل الدخول");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsapp.trim() || !name.trim() || !landmark.trim() || !governorate.trim()) {
      toast.error("الرجاء ملء جميع الحقول");
      return;
    }

    setLoading(true);
    try {
      const result = await signupFn({ whatsapp, name, landmark, governorate });
      if (result.ok) {
        writeCustomerSession(result.customer, result.token);
        toast.success("تم إنشاء الحساب بنجاح ✅");
        navigate({ to: "/customer/dashboard" });
      } else {
        toast.error(result.error || "فشل إنشاء الحساب");
      }
    } catch (error) {
      toast.error("حدث خطأ أثناء إنشاء الحساب");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-soft to-background">
      <header className="border-b border-border bg-background/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 max-w-2xl items-center justify-between px-4">
          <Logo />
          <LanguageSwitcher />
        </div>
      </header>

      <main className="container mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-12">
        <div className="w-full space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold">حساب الزبون</h1>
            <p className="mt-2 text-muted-foreground">
              ابحث عن قطع السيارات واكسسواراتها بسهولة
            </p>
          </div>

          {/* Auth Card */}
          <div className="rounded-2xl border border-border bg-card p-8 shadow-soft">
            <Tabs
              defaultValue="login"
              onValueChange={(value) => setMode(value as AuthMode)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">تسجيل دخول</TabsTrigger>
                <TabsTrigger value="signup">إنشاء حساب</TabsTrigger>
              </TabsList>

              {/* Login Form */}
              {mode === "login" && (
                <form onSubmit={handleLogin} className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-whatsapp" className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      رقم الواتس اب
                    </Label>
                    <Input
                      id="login-whatsapp"
                      type="tel"
                      placeholder="07XX XXX XXXX"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      disabled={loading}
                      className="text-right"
                      dir="rtl"
                    />
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full gap-2"
                    disabled={loading}
                  >
                    {loading ? "جاري..." : "دخول"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    ليس لديك حساب؟{" "}
                    <button
                      type="button"
                      onClick={() => setMode("signup")}
                      className="font-semibold text-primary hover:underline"
                    >
                      أنشئ واحد
                    </button>
                  </p>
                </form>
              )}

              {/* Signup Form */}
              {mode === "signup" && (
                <form onSubmit={handleSignup} className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-whatsapp" className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      رقم الواتس اب
                    </Label>
                    <Input
                      id="signup-whatsapp"
                      type="tel"
                      placeholder="07XX XXX XXXX"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      disabled={loading}
                      className="text-right"
                      dir="rtl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-name" className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      الاسم الكامل
                    </Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="احمد محمد"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={loading}
                      className="text-right"
                      dir="rtl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-landmark" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      أقرب نقطة دالة
                    </Label>
                    <Input
                      id="signup-landmark"
                      type="text"
                      placeholder="جامع، مدرسة، شارع معروف"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      disabled={loading}
                      className="text-right"
                      dir="rtl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-governorate" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      المحافظة / المدينة
                    </Label>
                    <Input
                      id="signup-governorate"
                      type="text"
                      placeholder="بغداد، كربلاء، النجف..."
                      value={governorate}
                      onChange={(e) => setGovernorate(e.target.value)}
                      disabled={loading}
                      className="text-right"
                      dir="rtl"
                    />
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full gap-2"
                    disabled={loading}
                  >
                    {loading ? "جاري..." : "إنشاء حساب"}
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    هل لديك حساب بالفعل؟{" "}
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      className="font-semibold text-primary hover:underline"
                    >
                      سجل دخول
                    </button>
                  </p>
                </form>
              )}
            </Tabs>
          </div>

          {/* Features */}
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {[
              { icon: "📷", title: "بحث بالصور", desc: "أرسل صورة القطعة والبحث الذكي" },
              { icon: "📝", title: "بحث بالنص", desc: "ابحث عن القطعة بالكلمات المفتاحية" },
              { icon: "🛒", title: "شراء سهل", desc: "اختر المنتج واستلمه من التاجر" },
              { icon: "💬", title: "تواصل مباشر", desc: "الوسيط يساعدك في كل خطوة" },
            ].map((item, i) => (
              <div key={i} className="rounded-lg border border-border bg-background p-4 text-center">
                <div className="text-3xl">{item.icon}</div>
                <h3 className="mt-2 font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
