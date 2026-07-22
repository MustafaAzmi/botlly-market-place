import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type Dispatch, type SetStateAction } from "react";
import {
  ArrowRight,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useLanguage } from "@/i18n/LanguageProvider";
import { CAR_MAKES } from "@/lib/car-data";
import {
  loginMerchant,
  requestMerchantOtp,
  resetMerchantPassword,
  signupMerchant,
} from "@/lib/merchant.functions";
import { writeMerchantSession } from "@/lib/merchantSession";
import { withNetworkRetry } from "@/lib/networkRetry";
import { pwaHeadLinks, pwaHeadMeta } from "@/lib/pwa";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„ Ø§Ù„ØªØ§Ø¬Ø± - Botly" },
      { name: "description", content: "Create or access your Botly merchant account." },
      ...pwaHeadMeta("merchant"),
    ],
    links: pwaHeadLinks("merchant"),
  }),
  component: AuthPage,
});

type ResetMethod = "whatsapp" | "email";
type AuthMode = "login" | "signup";

const CAR_PART_SPECIALTIES = [
  "كهربائيات عامة",
  "محرك",
  "هيكل وبدن",
  "تعليق وتوجيه",
  "فرامل",
  "تبريد وتكييف",
  "إكسسوارات",
  "أخرى",
];

const copy = {
  ar: {
    title: "Ø¯Ø®ÙˆÙ„ Ø§Ù„ØªØ¬Ø§Ø±",
    subtitle: "Ø§Ø¯Ø®Ù„ Ø¨Ø±Ù‚Ù… ÙˆØ§ØªØ³Ø§Ø¨ ÙˆÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±. Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© ÙŠØªÙ… Ø¹Ù† Ø·Ø±ÙŠÙ‚ Ø§Ù„Ù…Ø´Ø±Ù.",
    login: "ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„",
    signup: "Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨",
    whatsapp: "Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ / ÙˆØ§ØªØ³Ø§Ø¨",
    whatsappPlaceholder: "07XX XXX XXXX",
    storeName: "Ø§Ø³Ù… Ø§Ù„Ù…Ø­Ù„ Ø£Ùˆ Ø§Ù„Ø´Ø±ÙƒØ©",
    storeNamePlaceholder: "Ù…Ø«Ø§Ù„: Ø¨ÙˆØªÙ„ÙŠ Ø³ØªÙˆØ±",
    city: "Ø§Ù„Ù…Ø­Ø§ÙØ¸Ø©",
    cityPlaceholder: "Ø§Ø®ØªØ± Ù…Ø­Ø§ÙØ¸Ø© Ø§Ù„Ù…ØªØ¬Ø±",
    email: "Ø§Ù„Ø¥ÙŠÙ…ÙŠÙ„",
    emailOptional: "Ø§Ù„Ø¥ÙŠÙ…ÙŠÙ„ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)",
    emailPlaceholder: "name@example.com",
    password: "Ø§Ù„Ø¨Ø§Ø³ÙˆØ±Ø¯",
    passwordPlaceholder: "Ø§ÙƒØªØ¨ ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±",
    loginSubmit: "Ø¯Ø®ÙˆÙ„ Ø¥Ù„Ù‰ Ø§Ù„Ù„ÙˆØ­Ø©",
    signupSubmit: "Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨",
    forgotPassword: "Ù†Ø³ÙŠØª ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±ØŸ",
    resetTitle: "Ø§Ø³ØªØ¹Ø§Ø¯Ø© ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±",
    resetSubtitle: "Ø§Ø®ØªØ± Ø·Ø±ÙŠÙ‚Ø© Ø¥Ø±Ø³Ø§Ù„ Ø±Ø§Ø¨Ø· Ø£Ùˆ ÙƒÙˆØ¯ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªØ¹ÙŠÙŠÙ†.",
    resetByWhatsapp: "Ø±Ù‚Ù… Ø§Ù„ÙˆØ§ØªØ³Ø§Ø¨",
    resetByEmail: "Ø§Ù„Ø¥ÙŠÙ…ÙŠÙ„",
    sendReset: "Ø¥Ø±Ø³Ø§Ù„ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªØ¹ÙŠÙŠÙ†",
    backToLogin: "Ø±Ø¬ÙˆØ¹ Ù„Ù„Ø¯Ø®ÙˆÙ„",
    terms: "Ø¨Ø§Ù„Ø§Ø³ØªÙ…Ø±Ø§Ø± Ø£Ù†Øª ØªÙˆØ§ÙÙ‚ Ø¹Ù„Ù‰ Ø´Ø±ÙˆØ· Ø§Ù„Ø§Ø³ØªØ®Ø¯Ø§Ù… ÙˆØ³ÙŠØ§Ø³Ø© Ø§Ù„Ø®ØµÙˆØµÙŠØ©.",
    required: "Ø£ÙƒÙ…Ù„ Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©",
    passwordShort: "ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† 6 Ø£Ø­Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„",
    emailRequired: "Ø£Ø¯Ø®Ù„ Ø§Ù„Ø¥ÙŠÙ…ÙŠÙ„ Ø­ØªÙ‰ Ù†Ø±Ø³Ù„ Ø¹Ù„ÙŠÙ‡ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªØ¹ÙŠÙŠÙ†",
    loginSuccess: "ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„",
    signupSuccess: "ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨",
    resetSentWhatsapp: "ØªÙ… ØªØ¬Ù‡ÙŠØ² Ø±Ø³Ø§Ù„Ø© Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªØ¹ÙŠÙŠÙ† Ø¹Ø¨Ø± ÙˆØ§ØªØ³Ø§Ø¨",
    resetSentEmail: "ØªÙ… ØªØ¬Ù‡ÙŠØ² Ø±Ø³Ø§Ù„Ø© Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªØ¹ÙŠÙŠÙ† Ø¹Ø¨Ø± Ø§Ù„Ø¥ÙŠÙ…ÙŠÙ„",
    secure: "Ø¯Ø®ÙˆÙ„ Ù…Ø®ØªØµØ± ÙˆØ¢Ù…Ù† Ù„Ù„ØªØ§Ø¬Ø±",
    pointOne: "Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„Ø§Ø­Ù‚Ø§Ù‹ Ø¨Ø±Ù‚Ù… ÙˆØ§ØªØ³Ø§Ø¨ ÙˆÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±",
    pointTwo: "Ø§Ù„Ø¥ÙŠÙ…ÙŠÙ„ ÙŠØ¨Ù‚Ù‰ Ø§Ø®ØªÙŠØ§Ø±ÙŠ Ù„Ù„Ø­Ø³Ø§Ø¨",
    pointThree: "Ø§Ø³ØªØ±Ø¬Ø§Ø¹ ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± Ø¹Ø¨Ø± ÙˆØ§ØªØ³Ø§Ø¨ Ø£Ùˆ Ø¥ÙŠÙ…ÙŠÙ„",
  },
  en: {
    title: "Merchant Access",
    subtitle: "Sign in with your WhatsApp number and password. New accounts are created by a supervisor.",
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
    title: "Ú†ÙˆÙˆÙ†Û•Ú˜ÙˆÙˆØ±Û•ÙˆÛ•ÛŒ ÙØ±Û†Ø´ÛŒØ§Ø±",
    subtitle: "Ø¨Û• Ú˜Ù…Ø§Ø±Û•ÛŒ ÙˆØ§ØªØ³Ø§Ù¾ Ùˆ ÙˆØ´Û•ÛŒ Ù†Ù‡ÛŽÙ†ÛŒ Ø¨Ú†Û† Ú˜ÙˆÙˆØ±Û•ÙˆÛ•ØŒ ÛŒØ§Ù† Ù‡Û•Ú˜Ù…Ø§Ø±ÛŒ ÙØ±Û†Ø´Ú¯Ø§ÛŒ Ù†ÙˆÛŽ Ø¯Ø±ÙˆØ³Øª Ø¨Ú©Û•.",
    login: "Ú†ÙˆÙˆÙ†Û•Ú˜ÙˆÙˆØ±Û•ÙˆÛ•",
    signup: "Ø¯Ø±ÙˆØ³ØªÚ©Ø±Ø¯Ù†ÛŒ Ù‡Û•Ú˜Ù…Ø§Ø±",
    whatsapp: "Ú˜Ù…Ø§Ø±Û•ÛŒ ØªÛ•Ù„Û•ÙÛ†Ù† / ÙˆØ§ØªØ³Ø§Ù¾",
    whatsappPlaceholder: "07XX XXX XXXX",
    storeName: "Ù†Ø§ÙˆÛŒ Ø´ÙˆÛŽÙ† ÛŒØ§Ù† Ú©Û†Ù…Ù¾Ø§Ù†ÛŒØ§",
    storeNamePlaceholder: "Ù†Ù…ÙˆÙˆÙ†Û•: Botly Store",
    city: "Ù¾Ø§Ø±ÛŽØ²Ú¯Ø§",
    cityPlaceholder: "Ù¾Ø§Ø±ÛŽØ²Ú¯Ø§ÛŒ ÙØ±Û†Ø´Ú¯Ø§ Ù‡Û•ÚµØ¨Ú˜ÛŽØ±Û•",
    email: "Ø¦ÛŒÙ…Û•ÛŒÚµ",
    emailOptional: "Ø¦ÛŒÙ…Û•ÛŒÚµ (Ø¦Ø§Ø±Û•Ø²ÙˆÙˆÙ…Û•Ù†Ø¯Ø§Ù†Û•)",
    emailPlaceholder: "name@example.com",
    password: "ÙˆØ´Û•ÛŒ Ù†Ù‡ÛŽÙ†ÛŒ",
    passwordPlaceholder: "ÙˆØ´Û•ÛŒ Ù†Ù‡ÛŽÙ†ÛŒ Ø¨Ù†ÙˆÙˆØ³Û•",
    loginSubmit: "Ú©Ø±Ø¯Ù†Û•ÙˆÛ•ÛŒ Ø¯Ø§Ø´Ø¨Û†Ø±Ø¯",
    signupSubmit: "Ø¯Ø±ÙˆØ³ØªÚ©Ø±Ø¯Ù†ÛŒ Ù‡Û•Ú˜Ù…Ø§Ø±",
    forgotPassword: "ÙˆØ´Û•ÛŒ Ù†Ù‡ÛŽÙ†ÛŒØª Ù„Û•Ø¨ÛŒØ± Ú©Ø±Ø¯ÙˆÙˆÛ•ØŸ",
    resetTitle: "Ú¯Û†Ú•ÛŒÙ†ÛŒ ÙˆØ´Û•ÛŒ Ù†Ù‡ÛŽÙ†ÛŒ",
    resetSubtitle: "Ø´ÙˆÛŽÙ†ÛŒ ÙˆÛ•Ø±Ú¯Ø±ØªÙ†ÛŒ Ú©Û†Ø¯ ÛŒØ§Ù† Ø¨Û•Ø³ØªÛ•Ø±ÛŒ Ú¯Û†Ú•ÛŒÙ† Ù‡Û•ÚµØ¨Ú˜ÛŽØ±Û•.",
    resetByWhatsapp: "Ú˜Ù…Ø§Ø±Û•ÛŒ ÙˆØ§ØªØ³Ø§Ù¾",
    resetByEmail: "Ø¦ÛŒÙ…Û•ÛŒÚµ",
    sendReset: "Ù†Ø§Ø±Ø¯Ù†ÛŒ Ú¯Û†Ú•ÛŒÙ†",
    backToLogin: "Ú¯Û•Ú•Ø§Ù†Û•ÙˆÛ• Ø¨Û† Ú†ÙˆÙˆÙ†Û•Ú˜ÙˆÙˆØ±Û•ÙˆÛ•",
    terms: "Ø¨Û• Ø¨Û•Ø±Ø¯Û•ÙˆØ§Ù…Ø¨ÙˆÙˆÙ†Øª Ú•Ø§Ø²ÛŒ Ø¯Û•Ø¨ÛŒØª Ø¨Û• Ù…Û•Ø±Ø¬Û•Ú©Ø§Ù†ÛŒ Ø¨Û•Ú©Ø§Ø±Ù‡ÛŽÙ†Ø§Ù† Ùˆ Ø³ÛŒØ§Ø³Û•ØªÛŒ ØªØ§ÛŒØ¨Û•ØªÙ…Û•Ù†Ø¯ÛŒ.",
    required: "ØªÚ©Ø§ÛŒÛ• Ø®Ø§Ù†Û• Ù¾ÛŽÙˆÛŒØ³ØªÛ•Ú©Ø§Ù† Ù¾Ú• Ø¨Ú©Û•",
    passwordShort: "ÙˆØ´Û•ÛŒ Ù†Ù‡ÛŽÙ†ÛŒ Ø¯Û•Ø¨ÛŽØª Ù„Ø§Ù†ÛŒÚ©Û•Ù… 6 Ù¾ÛŒØª Ø¨ÛŽØª",
    emailRequired: "Ø¦ÛŒÙ…Û•ÛŒÚµ Ø¨Ù†ÙˆÙˆØ³Û• Ø¨Û† ÙˆÛ•Ø±Ú¯Ø±ØªÙ†ÛŒ Ú¯Û†Ú•ÛŒÙ†ÛŒ ÙˆØ´Û•ÛŒ Ù†Ù‡ÛŽÙ†ÛŒ",
    loginSuccess: "Ú†ÙˆÙˆÛŒØªÛ• Ú˜ÙˆÙˆØ±Û•ÙˆÛ•",
    signupSuccess: "Ù‡Û•Ú˜Ù…Ø§Ø± Ø¯Ø±ÙˆØ³Øª Ú©Ø±Ø§",
    resetSentWhatsapp: "Ù†Ø§Ù…Û•ÛŒ Ú¯Û†Ú•ÛŒÙ†ÛŒ ÙˆØ´Û•ÛŒ Ù†Ù‡ÛŽÙ†ÛŒ Ø¨Û† ÙˆØ§ØªØ³Ø§Ù¾ Ø¦Ø§Ù…Ø§Ø¯Û• Ú©Ø±Ø§",
    resetSentEmail: "Ù†Ø§Ù…Û•ÛŒ Ú¯Û†Ú•ÛŒÙ†ÛŒ ÙˆØ´Û•ÛŒ Ù†Ù‡ÛŽÙ†ÛŒ Ø¨Û† Ø¦ÛŒÙ…Û•ÛŒÚµ Ø¦Ø§Ù…Ø§Ø¯Û• Ú©Ø±Ø§",
    secure: "Ú†ÙˆÙˆÙ†Û•Ú˜ÙˆÙˆØ±Û•ÙˆÛ•ÛŒ Ú©ÙˆØ±Øª Ùˆ Ù¾Ø§Ø±ÛŽØ²Ø±Ø§Ùˆ Ø¨Û† ÙØ±Û†Ø´ÛŒØ§Ø±",
    pointOne: "Ø¯ÙˆØ§ØªØ± Ø¨Û• Ú˜Ù…Ø§Ø±Û•ÛŒ ÙˆØ§ØªØ³Ø§Ù¾ Ùˆ ÙˆØ´Û•ÛŒ Ù†Ù‡ÛŽÙ†ÛŒ Ø¨Ú†Û† Ú˜ÙˆÙˆØ±Û•ÙˆÛ•",
    pointTwo: "Ø¦ÛŒÙ…Û•ÛŒÚµ Ù„Û• Ù‡Û•Ú˜Ù…Ø§Ø±Ø¯Ø§ Ø¦Ø§Ø±Û•Ø²ÙˆÙˆÙ…Û•Ù†Ø¯Ø§Ù†Û• Ø¯Û•Ù…ÛŽÙ†ÛŽØª",
    pointThree: "Ú¯Û†Ú•ÛŒÙ†ÛŒ ÙˆØ´Û•ÛŒ Ù†Ù‡ÛŽÙ†ÛŒ Ù„Û• Ú•ÛŽÛŒ ÙˆØ§ØªØ³Ø§Ù¾ ÛŒØ§Ù† Ø¦ÛŒÙ…Û•ÛŒÚµ",
  },
} as const;

function AuthPage() {
  const { locale } = useLanguage();
  const text = copy[locale];
  const navigate = useNavigate();
  const loginMerchantFn = useServerFn(loginMerchant);
  const signupMerchantFn = useServerFn(signupMerchant);
  const requestOtpFn = useServerFn(requestMerchantOtp);
  const resetPasswordFn = useServerFn(resetMerchantPassword);
  const [showReset, setShowReset] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [storeName, setStoreName] = useState("");
  const [city, setCity] = useState("");
  const [carMakes, setCarMakes] = useState<string[]>([]);
  const [carModels, setCarModels] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
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
      accountStatus: result.profile.accountStatus,
      firstLoginCompleted: result.profile.firstLoginCompleted,
      signedInAt: new Date().toISOString(),
    });
    toast.success(successMessage);
    navigate({ to: "/dashboard/orders" });
  };

  const toggleValue = (
    setter: Dispatch<SetStateAction<string[]>>,
    value: string,
    checked: boolean,
  ) => {
    setter((current) =>
      checked
        ? [...new Set([...current, value])]
        : current.filter((item) => item !== value),
    );
  };

  const toggleMake = (makeLabel: string, checked: boolean) => {
    if (checked) {
      setCarMakes((current) => [...new Set([...current, makeLabel])]);
      return;
    }
    const remainingMakes = carMakes.filter((item) => item !== makeLabel);
    const allowedModels = new Set(
      CAR_MAKES
        .filter((make) => remainingMakes.includes(make.label))
        .flatMap((make) => make.models),
    );
    setCarMakes(remainingMakes);
    setCarModels((current) => current.filter((model) => allowedModels.has(model)));
  };

  const requestOtp = async (purpose: "signup" | "reset") => {
    if (!whatsapp.trim()) {
      toast.error(text.required);
      return;
    }
    setLoading(true);
    try {
      await requestOtpFn({ data: { whatsapp: whatsapp.trim(), purpose } });
      toast.success("ØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø±Ù…Ø² OTP Ø¥Ù„Ù‰ ÙˆØ§ØªØ³Ø§Ø¨");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.required);
    } finally {
      setLoading(false);
    }
  };

  const onAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!whatsapp.trim() || !password.trim()) {
      toast.error(text.required);
      return;
    }

    if (
      authMode === "signup" &&
      (!storeName.trim() ||
        !city.trim() ||
        !otpCode.trim() ||
        carMakes.length === 0 ||
        carModels.length === 0 ||
        specialties.length === 0)
    ) {
      toast.error(text.required);
      return;
    }

    if (password.trim().length < 6) {
      toast.error(text.passwordShort);
      return;
    }

    setLoading(true);
    try {
      if (authMode === "signup") {
        const result = await withNetworkRetry(() =>
          signupMerchantFn({
            data: {
              storeName: storeName.trim(),
              city: city.trim(),
              whatsapp: whatsapp.trim(),
              password,
              otpCode: otpCode.trim(),
              carMakes,
              carModels,
              specialties,
            },
          }),
        );
        saveAuthSession(text.signupSuccess, result);
      } else {
        const result = await withNetworkRetry(() =>
          loginMerchantFn({
            data: {
              whatsapp: whatsapp.trim(),
              password,
            },
          }),
        );
        saveAuthSession(text.loginSuccess, result);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.required);
    } finally {
      setLoading(false);
    }
  };

  const onResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!whatsapp.trim() || !otpCode.trim() || !password.trim()) {
      toast.error(text.required);
      return;
    }

    setLoading(true);
    try {
      const result = await resetPasswordFn({
        data: { whatsapp: whatsapp.trim(), password, otpCode: otpCode.trim() },
      });
      saveAuthSession(text.loginSuccess, result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.required);
    } finally {
      setLoading(false);
    }
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

                <Field
                  icon={ShieldCheck}
                  id="resetOtp"
                  label="Ø±Ù…Ø² OTP"
                  value={otpCode}
                  onChange={setOtpCode}
                  placeholder="Ø§ÙƒØªØ¨ Ø§Ù„Ø±Ù…Ø²"
                  type="text"
                  dir="ltr"
                />

                <PasswordField
                  id="resetPassword"
                  label="ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©"
                  value={password}
                  onChange={setPassword}
                  placeholder={text.passwordPlaceholder}
                />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label>{text.sendReset}</Label>
                    <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => requestOtp("reset")}>
                      Ø¥Ø±Ø³Ø§Ù„ OTP
                    </Button>
                  </div>
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
                    {loading ? "..." : "ØªØºÙŠÙŠØ± ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±"}
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setShowReset(false);
                    }}
                  >
                    {text.backToLogin}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={onAuthSubmit} className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold tracking-normal">
                    {authMode === "login" ? text.login : text.signup}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {authMode === "login"
                      ? "ادخل برقم واتساب وكلمة المرور."
                      : "أنشئ حساب التاجر مباشرة وسيصل رمز OTP إلى رقم واتساب التاجر."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary p-1">
                  <Button type="button" variant={authMode === "login" ? "default" : "ghost"} onClick={() => setAuthMode("login")}>
                    {text.login}
                  </Button>
                  <Button type="button" variant={authMode === "signup" ? "default" : "ghost"} onClick={() => setAuthMode("signup")}>
                    {text.signup}
                  </Button>
                </div>

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

                {authMode === "signup" && (
                  <>
                    <Field icon={MessageCircle} id="storeName" label={text.storeName} value={storeName} onChange={setStoreName} placeholder={text.storeNamePlaceholder} />
                    <Field icon={MessageCircle} id="city" label={text.city} value={city} onChange={setCity} placeholder={text.cityPlaceholder} />
                    <MultiCheckboxGroup
                      label="أنواع السيارات"
                      hint="اختر نوعاً واحداً أو أكثر"
                      options={CAR_MAKES.map((make) => make.label)}
                      selected={carMakes}
                      onCheckedChange={toggleMake}
                    />
                    <div className="space-y-2 rounded-xl border border-border bg-background p-3">
                      <div>
                        <Label>الموديلات</Label>
                        <p className="mt-1 text-xs text-muted-foreground">تظهر موديلات أنواع السيارات المحددة فقط.</p>
                      </div>
                      {carMakes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">اختر نوع السيارة أولاً.</p>
                      ) : (
                        <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
                          {CAR_MAKES
                            .filter((make) => carMakes.includes(make.label))
                            .flatMap((make) =>
                              make.models.map((model) => (
                                <CheckboxOption
                                  key={`${make.key}-${model}`}
                                  id={`signup-model-${make.key}-${model}`}
                                  label={`${make.label} - ${model}`}
                                  checked={carModels.includes(model)}
                                  onCheckedChange={(checked) => toggleValue(setCarModels, model, checked)}
                                />
                              )),
                            )}
                        </div>
                      )}
                    </div>
                    <MultiCheckboxGroup
                      label="الاختصاصات"
                      hint="اختر اختصاصاً واحداً أو أكثر"
                      options={CAR_PART_SPECIALTIES}
                      selected={specialties}
                      onCheckedChange={(value, checked) => toggleValue(setSpecialties, value, checked)}
                    />
                    <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                      <Field icon={ShieldCheck} id="otpCode" label="رمز OTP" value={otpCode} onChange={setOtpCode} placeholder="اكتب الرمز" type="text" dir="ltr" />
                      <Button type="button" variant="outline" className="h-12" disabled={loading} onClick={() => requestOtp("signup")}>
                        إرسال OTP
                      </Button>
                    </div>
                  </>
                )}

                <PasswordField
                  id="password"
                  label={text.password}
                  value={password}
                  onChange={setPassword}
                  placeholder={text.passwordPlaceholder}
                />

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

                <Button
                  type="submit"
                  size="lg"
                  className="w-full gap-2 rounded-xl shadow-soft"
                  disabled={loading}
                >
                  {loading ? "..." : authMode === "login" ? text.loginSubmit : text.signupSubmit}
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

function MultiCheckboxGroup({
  label,
  hint,
  options,
  selected,
  onCheckedChange,
}: {
  label: string;
  hint: string;
  options: string[];
  selected: string[];
  onCheckedChange: (value: string, checked: boolean) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-background p-3">
      <div>
        <Label>{label}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
        {options.map((option) => (
          <CheckboxOption
            key={option}
            id={`${label}-${option}`}
            label={option}
            checked={selected.includes(option)}
            onCheckedChange={(checked) => onCheckedChange(option, checked)}
          />
        ))}
      </div>
    </div>
  );
}

function CheckboxOption({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const inputId = `merchant-signup-${encodeURIComponent(id).replace(/%/g, "")}`;
  return (
    <label
      htmlFor={inputId}
      className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm transition-colors hover:bg-secondary/70"
    >
      <Checkbox
        id={inputId}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span>{label}</span>
    </label>
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
          aria-label={visible ? "Ø¥Ø®ÙØ§Ø¡ ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±" : "Ø¥Ø¸Ù‡Ø§Ø± ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±"}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
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
      className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-white px-3 py-2 text-sm transition-colors hover:bg-secondary/50"
    >
      <RadioGroupItem id={id} value={value} />
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="min-w-0 truncate">{label}</span>
    </Label>
  );
}
