import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/i18n/LanguageProvider";
import { loginMerchant, signupMerchant } from "@/lib/merchant.functions";
import { writeMerchantSession } from "@/lib/merchantSession";
import { pwaHeadLinks, pwaHeadMeta } from "@/lib/pwa";

export const Route = createFileRoute("/auth")({
  // ?mode=signup opens the create-store form directly; anything else → login.
  validateSearch: (search: Record<string, unknown>): { mode?: AuthMode } => ({
    mode: search.mode === "signup" ? "signup" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "تسجيل دخول التاجر - Botly" },
      { name: "description", content: "Create or access your Botly merchant account." },
      ...pwaHeadMeta("merchant"),
    ],
    links: pwaHeadLinks("merchant"),
  }),
  component: AuthPage,
});

type AuthMode = "login" | "signup";
type ResetMethod = "whatsapp" | "email";

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
    city: "المحافظة",
    cityPlaceholder: "اختر محافظة المتجر",
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
    city: "Governorate",
    cityPlaceholder: "Choose store governorate",
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
  ku: {
    title: "چوونەژوورەوەی فرۆشیار",
    subtitle: "بە ژمارەی واتساپ و وشەی نهێنی بچۆ ژوورەوە، یان هەژماری فرۆشگای نوێ دروست بکە.",
    login: "چوونەژوورەوە",
    signup: "دروستکردنی هەژمار",
    whatsapp: "ژمارەی تەلەفۆن / واتساپ",
    whatsappPlaceholder: "07XX XXX XXXX",
    storeName: "ناوی شوێن یان کۆمپانیا",
    storeNamePlaceholder: "نموونە: Botly Store",
    city: "پارێزگا",
    cityPlaceholder: "پارێزگای فرۆشگا هەڵبژێرە",
    email: "ئیمەیڵ",
    emailOptional: "ئیمەیڵ (ئارەزوومەندانە)",
    emailPlaceholder: "name@example.com",
    password: "وشەی نهێنی",
    passwordPlaceholder: "وشەی نهێنی بنووسە",
    loginSubmit: "کردنەوەی داشبۆرد",
    signupSubmit: "دروستکردنی هەژمار",
    forgotPassword: "وشەی نهێنیت لەبیر کردووە؟",
    resetTitle: "گۆڕینی وشەی نهێنی",
    resetSubtitle: "شوێنی وەرگرتنی کۆد یان بەستەری گۆڕین هەڵبژێرە.",
    resetByWhatsapp: "ژمارەی واتساپ",
    resetByEmail: "ئیمەیڵ",
    sendReset: "ناردنی گۆڕین",
    backToLogin: "گەڕانەوە بۆ چوونەژوورەوە",
    terms: "بە بەردەوامبوونت ڕازی دەبیت بە مەرجەکانی بەکارهێنان و سیاسەتی تایبەتمەندی.",
    required: "تکایە خانە پێویستەکان پڕ بکە",
    passwordShort: "وشەی نهێنی دەبێت لانیکەم 6 پیت بێت",
    emailRequired: "ئیمەیڵ بنووسە بۆ وەرگرتنی گۆڕینی وشەی نهێنی",
    loginSuccess: "چوویتە ژوورەوە",
    signupSuccess: "هەژمار دروست کرا",
    resetSentWhatsapp: "نامەی گۆڕینی وشەی نهێنی بۆ واتساپ ئامادە کرا",
    resetSentEmail: "نامەی گۆڕینی وشەی نهێنی بۆ ئیمەیڵ ئامادە کرا",
    secure: "چوونەژوورەوەی کورت و پارێزراو بۆ فرۆشیار",
    pointOne: "دواتر بە ژمارەی واتساپ و وشەی نهێنی بچۆ ژوورەوە",
    pointTwo: "ئیمەیڵ لە هەژماردا ئارەزوومەندانە دەمێنێت",
    pointThree: "گۆڕینی وشەی نهێنی لە ڕێی واتساپ یان ئیمەیڵ",
  },
} as const;

const IRAQI_GOVERNORATES = [
  "بغداد",
  "نينوى",
  "البصرة",
  "أربيل",
  "السليمانية",
  "دهوك",
  "كركوك",
  "الأنبار",
  "صلاح الدين",
  "ديالى",
  "واسط",
  "بابل",
  "كربلاء",
  "النجف",
  "الديوانية",
  "المثنى",
  "ذي قار",
  "ميسان",
  "حلبجة",
];

function AuthPage() {
  const { locale } = useLanguage();
  const text = copy[locale];
  const navigate = useNavigate();
  const loginMerchantFn = useServerFn(loginMerchant);
  const signupMerchantFn = useServerFn(signupMerchant);
  const { mode: requestedMode } = Route.useSearch();
  const [mode, setMode] = useState<AuthMode>(requestedMode === "signup" ? "signup" : "login");
  const [showReset, setShowReset] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [city, setCity] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetMethod, setResetMethod] = useState<ResetMethod>("whatsapp");
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setPassword("");
    setShowReset(false);
  };

  const saveAuthSession = (
    successMessage: string,
    result: Awaited<ReturnType<typeof loginMerchantFn>>,
  ) => {
    writeMerchantSession({
      token: result.token,
      merchantId: result.profile.id,
      storeName: result.profile.storeName,
      storeSlug: result.profile.storeSlug,
      whatsapp: result.profile.whatsapp,
      email: result.profile.email,
      bio: result.profile.bio,
      city: result.profile.city,
      deliveryPhone: result.profile.deliveryPhone,
      signedInAt: new Date().toISOString(),
    });
    toast.success(successMessage);
    navigate({ to: mode === "signup" ? "/dashboard/store" : "/dashboard" });
  };

  const onAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!whatsapp.trim() || !password.trim() || (mode === "signup" && (!storeName.trim() || !city))) {
      toast.error(text.required);
      return;
    }

    if (password.trim().length < 6) {
      toast.error(text.passwordShort);
      return;
    }

    setLoading(true);
    try {
      const result =
        mode === "signup"
          ? await signupMerchantFn({
              data: {
                storeName: storeName.trim(),
                city,
                whatsapp: whatsapp.trim(),
                email: email.trim(),
                password,
              },
            })
          : await loginMerchantFn({
              data: {
                whatsapp: whatsapp.trim(),
                password,
              },
            });
      saveAuthSession(mode === "signup" ? text.signupSuccess : text.loginSuccess, result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.required);
    } finally {
      setLoading(false);
    }
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
    <div className="min-h-screen bg-[linear-gradient(180deg,#f3fff7_0%,#ffffff_48%,#f6f7f6_100%)] text-foreground">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/70 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
        <Logo />
        <LanguageSwitcher />
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-73px)] w-full max-w-6xl gap-8 px-4 py-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_27rem] lg:px-6">
        <section className="hidden min-h-[34rem] flex-col justify-between overflow-hidden rounded-[2rem] border border-primary/15 bg-white p-8 shadow-elevated lg:flex">
          <div className="flex w-fit items-center gap-2 rounded-full bg-primary-soft px-4 py-2 text-sm font-medium text-primary">
            <ShieldCheck className="h-4 w-4" />
            {text.secure}
          </div>

          <div className="max-w-xl">
            <h1 className="text-balance text-5xl font-bold leading-tight tracking-normal text-slate-950">
              {text.title}
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">
              {text.subtitle}
            </p>
          </div>

          <div className="grid gap-3 rounded-2xl bg-slate-950 p-5 text-sm text-white/78">
            {[text.pointOne, text.pointTwo, text.pointThree].map((point) => (
              <div key={point} className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>{point}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-md rounded-[1.75rem] border border-border bg-white p-5 shadow-elevated sm:p-6">
            <div className="mb-6 lg:hidden">
              <h1 className="text-2xl font-bold tracking-normal">{text.title}</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text.subtitle}</p>
            </div>

            {showReset ? (
              <form onSubmit={onResetSubmit} className="space-y-5">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 text-xl font-semibold tracking-normal">{text.resetTitle}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {text.resetSubtitle}
                  </p>
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
                    <ResetChoice
                      id="reset-email"
                      value="email"
                      icon={Mail}
                      label={text.resetByEmail}
                    />
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
              <form onSubmit={onAuthSubmit} className="space-y-5">
                {mode === "login" && (
                  <div>
                    <h2 className="text-xl font-semibold tracking-normal">{text.login}</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {locale === "ar" ? "ادخل برقم واتساب وكلمة المرور" : "Sign in with WhatsApp number and password"}
                    </p>
                  </div>
                )}

                {mode === "signup" && (
                  <div>
                    <h2 className="text-xl font-semibold tracking-normal">{text.signup}</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {locale === "ar" ? "أنشئ متجر جديد" : "Create your store"}
                    </p>
                  </div>
                )}

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
                    <div>
                      <Field
                        icon={Building2}
                        id="storeName"
                        label={text.storeName}
                        value={storeName}
                        onChange={setStoreName}
                        placeholder={text.storeNamePlaceholder}
                      />
                      <StoreSlugHint storeName={storeName} locale={locale} />
                    </div>
                    <CitySelect
                      label={text.city}
                      placeholder={text.cityPlaceholder}
                      value={city}
                      onChange={setCity}
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

                <PasswordField
                  id="password"
                  label={text.password}
                  value={password}
                  onChange={setPassword}
                  placeholder={text.passwordPlaceholder}
                />

                {mode === "login" && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto px-0"
                      onClick={() => setShowReset(true)}
                    >
                      {text.forgotPassword}
                    </Button>
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full gap-2 rounded-xl shadow-soft"
                  disabled={loading}
                >
                  {loading ? "..." : mode === "signup" ? text.signupSubmit : text.loginSubmit}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </Button>

                <p className="text-center text-xs leading-5 text-muted-foreground">
                  {text.terms}
                </p>
              </form>
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

function CitySelect({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-12 rounded-xl bg-white">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {IRAQI_GOVERNORATES.map((governorate) => (
            <SelectItem key={governorate} value={governorate}>
              {governorate}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
          className="h-12 rounded-xl bg-white ps-10"
        />
      </div>
    </div>
  );
}

// Password input with a show/hide toggle.
function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <KeyRound className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir="ltr"
          className="h-12 rounded-xl bg-white ps-10 pe-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute end-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// Client-side mirror of the server slug rules (merchant.functions
// generateStoreSlug): English names become a readable URL slug; Arabic names
// get a unique number so URLs never contain Arabic text.
function previewStoreSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// Live hint under the store-name field showing the store's URL identifier.
function StoreSlugHint({ storeName, locale }: { storeName: string; locale: "ar" | "en" | "ku" }) {
  if (!storeName.trim()) {
    return (
      <p className="mt-1.5 text-xs text-muted-foreground">
        {locale === "ar"
          ? "يفضّل كتابة اسم المتجر بالإنكليزي حتى يظهر برابط متجرك."
          : "Prefer an English store name — it becomes your store URL."}
      </p>
    );
  }
  const slug = previewStoreSlug(storeName);
  if (slug.length >= 2) {
    return (
      <p className="mt-1.5 text-xs text-muted-foreground">
        {locale === "ar" ? "رابط متجرك: " : "Your store URL: "}
        <span dir="ltr" className="font-medium text-primary">
          bot-lly.tech/dashboard?store={slug}
        </span>
      </p>
    );
  }
  return (
    <p className="mt-1.5 text-xs text-amber-600">
      {locale === "ar"
        ? "الاسم بالعربي — راح ينعطي متجرك رقم مميز بالرابط بدل الاسم حتى ما يصير خلل بالاستدعاء."
        : "Arabic name detected — a unique store number will be used in the URL instead."}
    </p>
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
      className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-white px-3 py-2 text-sm transition-colors hover:bg-secondary/50"
    >
      <RadioGroupItem id={id} value={value} />
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="min-w-0 truncate">{label}</span>
    </Label>
  );
}
