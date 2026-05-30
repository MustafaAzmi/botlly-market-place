import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  KeyRound,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/i18n/LanguageProvider";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل دخول التاجر - Botly" },
      { name: "description", content: "Create or access your Botly merchant account." },
    ],
  }),
  component: AuthPage,
});

type AuthMode = "login" | "signup";
type ResetMethod = "whatsapp" | "email";

const merchantSessionKey = "botly.merchant.session";

const copy = {
  ar: {
    title: "دخول التجار",
    subtitle: "ادخل برقم واتساب وكلمة المرور، أو أنشئ حساب متجر جديد.",
    login: "تسجيل الدخول",
    signup: "إنشاء حساب",
    whatsapp: "رقم الهاتف / واتساب",
    whatsappPlaceholder: "07XX XXX XXXX",
    storeName: "اسم المحل أو الشركة",
    storeNamePlaceholder: "مثال: بوتلي ستور",
    email: "الإيميل",
    emailOptional: "الإيميل (اختياري)",
    emailPlaceholder: "name@example.com",
    password: "الباسورد",
    passwordPlaceholder: "اكتب كلمة المرور",
    loginSubmit: "دخول إلى اللوحة",
    signupSubmit: "إنشاء الحساب",
    forgotPassword: "نسيت كلمة المرور؟",
    resetTitle: "استعادة كلمة المرور",
    resetSubtitle: "اختر طريقة إرسال رابط أو كود إعادة التعيين.",
    resetByWhatsapp: "رقم الواتساب",
    resetByEmail: "الإيميل",
    sendReset: "إرسال إعادة التعيين",
    backToLogin: "رجوع للدخول",
    terms: "بالاستمرار أنت توافق على شروط الاستخدام وسياسة الخصوصية.",
    required: "أكمل الحقول المطلوبة",
    passwordShort: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
    emailRequired: "أدخل الإيميل حتى نرسل عليه إعادة التعيين",
    loginSuccess: "تم تسجيل الدخول",
    signupSuccess: "تم إنشاء الحساب",
    resetSentWhatsapp: "تم تجهيز رسالة إعادة التعيين عبر واتساب",
    resetSentEmail: "تم تجهيز رسالة إعادة التعيين عبر الإيميل",
    secure: "دخول مختصر وآمن للتاجر",
    pointOne: "الدخول لاحقاً برقم واتساب وكلمة المرور",
    pointTwo: "الإيميل يبقى اختياري للحساب",
    pointThree: "استرجاع كلمة المرور عبر واتساب أو إيميل",
  },
  en: {
    title: "Merchant Access",
    subtitle: "Sign in with your WhatsApp number and password, or create a new store account.",
    login: "Sign in",
    signup: "Create account",
    whatsapp: "Phone / WhatsApp number",
    whatsappPlaceholder: "07XX XXX XXXX",
    storeName: "Store or company name",
    storeNamePlaceholder: "e.g. Botly Store",
    email: "Email",
    emailOptional: "Email (optional)",
    emailPlaceholder: "name@example.com",
    password: "Password",
    passwordPlaceholder: "Enter your password",
    loginSubmit: "Open dashboard",
    signupSubmit: "Create account",
    forgotPassword: "Forgot password?",
    resetTitle: "Reset password",
    resetSubtitle: "Choose where to receive the reset link or code.",
    resetByWhatsapp: "WhatsApp number",
    resetByEmail: "Email",
    sendReset: "Send reset",
    backToLogin: "Back to sign in",
    terms: "By continuing you agree to the Terms of Service and Privacy Policy.",
    required: "Please complete the required fields",
    passwordShort: "Password must be at least 6 characters",
    emailRequired: "Enter an email address to receive the reset",
    loginSuccess: "Signed in",
    signupSuccess: "Account created",
    resetSentWhatsapp: "Password reset message prepared for WhatsApp",
    resetSentEmail: "Password reset message prepared for email",
    secure: "Simple secure merchant access",
    pointOne: "Sign in later with WhatsApp number and password",
    pointTwo: "Email stays optional on signup",
    pointThree: "Reset password through WhatsApp or email",
  },
} as const;

function AuthPage() {
  const { locale } = useLanguage();
  const text = copy[locale];
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("login");
  const [showReset, setShowReset] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetMethod, setResetMethod] = useState<ResetMethod>("whatsapp");
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setPassword("");
    setShowReset(false);
  };

  const onModeChange = (value: string) => {
    if (value !== "login" && value !== "signup") return;
    setMode(value);
    resetForm();
  };

  const openDashboard = (successMessage: string) => {
    sessionStorage.setItem(
      merchantSessionKey,
      JSON.stringify({
        storeName: storeName.trim(),
        whatsapp: whatsapp.trim(),
        email: email.trim() || null,
        signedInAt: new Date().toISOString(),
      }),
    );
    toast.success(successMessage);
    navigate({ to: "/dashboard/store" });
  };

  const onAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!whatsapp.trim() || !password.trim() || (mode === "signup" && !storeName.trim())) {
      toast.error(text.required);
      return;
    }

    if (password.trim().length < 6) {
      toast.error(text.passwordShort);
      return;
    }

    setLoading(true);
    // TODO(auth): replace this mock flow with Supabase auth + merchant profile storage.
    setTimeout(() => {
      setLoading(false);
      openDashboard(mode === "signup" ? text.signupSuccess : text.loginSuccess);
    }, 450);
  };

  const onResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!whatsapp.trim() || (resetMethod === "email" && !email.trim())) {
      toast.error(resetMethod === "email" ? text.emailRequired : text.required);
      return;
    }

    setLoading(true);
    // TODO(auth): request password reset through email provider or WhatsApp template.
    setTimeout(() => {
      setLoading(false);
      toast.success(resetMethod === "email" ? text.resetSentEmail : text.resetSentWhatsapp);
      setShowReset(false);
      setMode("login");
    }, 450);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border bg-background px-4 py-4 sm:px-6">
        <Logo />
        <LanguageSwitcher />
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-73px)] w-full max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_28rem] lg:px-6">
        <section className="hidden flex-col justify-between rounded-lg border border-border bg-secondary/35 p-8 lg:flex">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <ShieldCheck className="h-4 w-4" />
            {text.secure}
          </div>

          <div className="max-w-xl">
            <h1 className="text-balance text-5xl font-bold leading-tight tracking-normal">{text.title}</h1>
            <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">{text.subtitle}</p>
          </div>

          <div className="grid gap-3 text-sm text-muted-foreground">
            {[text.pointOne, text.pointTwo, text.pointThree].map((point) => (
              <div key={point} className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>{point}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-soft sm:p-6">
            <div className="mb-6 lg:hidden">
              <h1 className="text-2xl font-bold tracking-normal">{text.title}</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text.subtitle}</p>
            </div>

            {showReset ? (
              <form onSubmit={onResetSubmit} className="space-y-5">
                <div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 text-xl font-semibold tracking-normal">{text.resetTitle}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{text.resetSubtitle}</p>
                </div>

                <Field
                  icon={Phone}
                  id="resetWhatsapp"
                  label={text.whatsapp}
                  value={whatsapp}
                  onChange={setWhatsapp}
                  placeholder={text.whatsappPlaceholder}
                  type="tel"
                  dir="ltr"
                />

                <div className="space-y-3">
                  <Label>{text.sendReset}</Label>
                  <RadioGroup
                    value={resetMethod}
                    onValueChange={(value) => setResetMethod(value as ResetMethod)}
                    className="grid grid-cols-2 gap-2"
                  >
                    <ResetChoice
                      id="reset-whatsapp"
                      value="whatsapp"
                      icon={MessageCircle}
                      label={text.resetByWhatsapp}
                    />
                    <ResetChoice id="reset-email" value="email" icon={Mail} label={text.resetByEmail} />
                  </RadioGroup>
                </div>

                {resetMethod === "email" && (
                  <Field
                    icon={Mail}
                    id="resetEmail"
                    label={text.email}
                    value={email}
                    onChange={setEmail}
                    placeholder={text.emailPlaceholder}
                    type="email"
                    dir="ltr"
                  />
                )}

                <div className="space-y-3">
                  <Button type="submit" size="lg" className="w-full gap-2" disabled={loading}>
                    {loading ? "..." : text.sendReset}
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setShowReset(false);
                      setMode("login");
                    }}
                  >
                    {text.backToLogin}
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <Tabs value={mode} onValueChange={onModeChange} className="w-full">
                  <TabsList className="grid h-10 w-full grid-cols-2">
                    <TabsTrigger value="login">{text.login}</TabsTrigger>
                    <TabsTrigger value="signup">{text.signup}</TabsTrigger>
                  </TabsList>
                </Tabs>

                <form onSubmit={onAuthSubmit} className="mt-6 space-y-5">
                  <Field
                    icon={Phone}
                    id="whatsapp"
                    label={text.whatsapp}
                    value={whatsapp}
                    onChange={setWhatsapp}
                    placeholder={text.whatsappPlaceholder}
                    type="tel"
                    dir="ltr"
                  />

                  {mode === "signup" && (
                    <>
                      <Field
                        icon={Building2}
                        id="storeName"
                        label={text.storeName}
                        value={storeName}
                        onChange={setStoreName}
                        placeholder={text.storeNamePlaceholder}
                      />
                      <Field
                        icon={Mail}
                        id="email"
                        label={text.emailOptional}
                        value={email}
                        onChange={setEmail}
                        placeholder={text.emailPlaceholder}
                        type="email"
                        dir="ltr"
                      />
                    </>
                  )}

                  <Field
                    icon={KeyRound}
                    id="password"
                    label={text.password}
                    value={password}
                    onChange={setPassword}
                    placeholder={text.passwordPlaceholder}
                    type="password"
                    dir="ltr"
                  />

                  {mode === "login" && (
                    <div className="flex justify-end">
                      <Button type="button" variant="link" className="h-auto px-0" onClick={() => setShowReset(true)}>
                        {text.forgotPassword}
                      </Button>
                    </div>
                  )}

                  <Button type="submit" size="lg" className="w-full gap-2 shadow-soft" disabled={loading}>
                    {loading ? "..." : mode === "signup" ? text.signupSubmit : text.loginSubmit}
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </Button>

                  <p className="text-center text-xs leading-5 text-muted-foreground">{text.terms}</p>
                </form>
              </>
            )}

            <div className="mt-6 text-center text-sm text-muted-foreground">
              <Link to="/" className="hover:text-foreground">
                Botly
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({
  icon: Icon,
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  dir,
}: {
  icon: typeof Phone;
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: React.HTMLInputTypeAttribute;
  dir?: "rtl" | "ltr";
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir={dir}
          className="h-11 ps-10"
        />
      </div>
    </div>
  );
}

function ResetChoice({
  id,
  value,
  icon: Icon,
  label,
}: {
  id: string;
  value: ResetMethod;
  icon: typeof Mail;
  label: string;
}) {
  return (
    <Label
      htmlFor={id}
      className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-secondary/50"
    >
      <RadioGroupItem id={id} value={value} />
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="min-w-0 truncate">{label}</span>
    </Label>
  );
}
