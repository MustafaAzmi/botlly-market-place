import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, MapPin, Phone, User } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loginCustomer, signupCustomer } from "@/lib/customer.functions";
import { readCustomerSession, writeCustomerSession } from "@/lib/customerSession";
import { pwaHeadLinks, pwaHeadMeta } from "@/lib/pwa";

export const Route = createFileRoute("/customer/auth")({
  head: () => ({
    meta: [
      { title: "دخول الزبائن - Botly" },
      { name: "description", content: "Login to your Botly customer account." },
      ...pwaHeadMeta("customer"),
    ],
    links: pwaHeadLinks("customer"),
  }),
  component: CustomerAuthPage,
});

type AuthMode = "login" | "signup";

function CustomerAuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [whatsapp, setWhatsapp] = useState("");
  const [name, setName] = useState("");
  const [landmark, setLandmark] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const loginFn = useServerFn(loginCustomer);
  const signupFn = useServerFn(signupCustomer);

  // Already remembered on this device? Straight to the dashboard.
  useEffect(() => {
    if (readCustomerSession()) {
      navigate({ to: "/customer/dashboard" });
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsapp.trim()) {
      toast.error("الرجاء إدخال رقم الواتساب");
      return;
    }

    setLoading(true);
    try {
      const result = await loginFn({ data: { whatsapp: whatsapp.trim() } });
      writeCustomerSession(result.customer, result.token);
      toast.success(`أهلاً بعودتك ${result.customer.name} 👋`);
      navigate({ to: "/customer/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل تسجيل الدخول");
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
      const result = await signupFn({
        data: {
          whatsapp: whatsapp.trim(),
          name: name.trim(),
          landmark: landmark.trim(),
          governorate: governorate.trim(),
        },
      });
      writeCustomerSession(result.customer, result.token);
      toast.success(
        result.existed ? `أهلاً بعودتك ${result.customer.name} 👋` : "تم إنشاء الحساب — راح نتذكرك دائماً ✅",
      );
      navigate({ to: "/customer/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل إنشاء الحساب");
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
          <div className="text-center">
            <h1 className="text-3xl font-bold">حساب الزبون</h1>
            <p className="mt-2 text-muted-foreground">
              سجل مرة وحدة بمعلوماتك — وبكل مرة تدخل برقم الواتساب فقط.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 shadow-soft">
            <Tabs
              value={mode}
              onValueChange={(value) => setMode(value as AuthMode)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">تسجيل دخول</TabsTrigger>
                <TabsTrigger value="signup">إنشاء حساب</TabsTrigger>
              </TabsList>
            </Tabs>

            {mode === "login" ? (
              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-whatsapp" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    رقم الواتساب
                  </Label>
                  <Input
                    id="login-whatsapp"
                    type="tel"
                    dir="ltr"
                    placeholder="07XX XXX XXXX"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    disabled={loading}
                    className="h-11"
                  />
                </div>

                <Button type="submit" size="lg" className="w-full gap-2" disabled={loading}>
                  {loading ? "جاري..." : "دخول"}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  أول مرة هنا؟{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className="font-semibold text-primary hover:underline"
                  >
                    أنشئ حساب
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleSignup} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-whatsapp" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    رقم الواتساب
                  </Label>
                  <Input
                    id="signup-whatsapp"
                    type="tel"
                    dir="ltr"
                    placeholder="07XX XXX XXXX"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    disabled={loading}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    الاسم الكامل
                  </Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="أحمد محمد"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
                    className="h-11"
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
                    placeholder="جامع، مدرسة، شارع معروف..."
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    disabled={loading}
                    className="h-11"
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
                    placeholder="بغداد، البصرة، أربيل..."
                    value={governorate}
                    onChange={(e) => setGovernorate(e.target.value)}
                    disabled={loading}
                    className="h-11"
                  />
                </div>

                <Button type="submit" size="lg" className="w-full gap-2" disabled={loading}>
                  {loading ? "جاري..." : "إنشاء حساب"}
                  <CheckCircle2 className="h-4 w-4" />
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  معلوماتك تنحفظ مرة وحدة بقاعدة البيانات وتبقى محفوظة — ما نطلبها منك مرة ثانية.
                </p>
              </form>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: "🚗", title: "فلاتر السيارة", desc: "نوع السيارة، الموديل، واللون" },
              { icon: "🛒", title: "اطلب بضغطة", desc: "عنوانك محفوظ — الطلب فوري" },
              { icon: "💬", title: "تواصل مع الوسيط", desc: "نساعدك بكل خطوة" },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-border bg-card p-4 text-center shadow-soft">
                <div className="text-3xl">{item.icon}</div>
                <h3 className="mt-2 font-semibold">{item.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
