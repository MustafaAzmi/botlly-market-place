// Admin-side mock data. Replace with Supabase queries during backend wiring.
// Schema mirrors the intended tables: stores, payment_packages,
// delivery_companies, broadcast_messages.

export interface AdminStore {
  id: string;
  storeName: string;
  ownerName: string;
  whatsapp: string;
  city: string;
  category: string;
  productsCount: number;
  ordersCount: number;
  createdAt: string;
  bannedFromBot: boolean;
  plan: "free" | "basic" | "pro" | "enterprise";
}

export interface PaymentPackage {
  id: string;
  name: string;
  city: string;
  priceMonthly: number;
  currency: string;
  features: string[];
  active: boolean;
}

export interface DeliveryCompany {
  id: string;
  name: string;
  phone: string;
  cities: string[];
  bannedFromBot: boolean;
  activeMerchants: number;
}

export interface BroadcastMessage {
  id: string;
  title: string;
  body: string;
  audience: "all" | "city" | "plan" | "selection";
  audienceLabel: string;
  recipients: number;
  sentAt: string;
  status: "draft" | "sent" | "scheduled";
}

// Admin credentials — TODO(supabase): replace with a user_roles 'admin' check
// keyed on auth.uid(). Never trust the client; recheck on the server.
export const ADMIN_CREDENTIALS = {
  email: "mustafa.azmi.mustafa@gmail.com",
  phone: "07836653453",
} as const;

export const ADMIN_SESSION_KEY = "botly.admin.session";

export const adminStores: AdminStore[] = [
  { id: "s1", storeName: "متجر النور", ownerName: "أحمد علي", whatsapp: "+9647701234567", city: "بغداد", category: "إلكترونيات", productsCount: 42, ordersCount: 128, createdAt: "2026-03-12", bannedFromBot: false, plan: "pro" },
  { id: "s2", storeName: "أزياء سارة", ownerName: "سارة خالد", whatsapp: "+9647712345678", city: "البصرة", category: "أزياء", productsCount: 87, ordersCount: 215, createdAt: "2026-02-04", bannedFromBot: false, plan: "basic" },
  { id: "s3", storeName: "بيت العطور", ownerName: "ليلى محمد", whatsapp: "+9647723456789", city: "أربيل", category: "عطور", productsCount: 23, ordersCount: 64, createdAt: "2026-04-22", bannedFromBot: true, plan: "free" },
  { id: "s4", storeName: "تك ستور", ownerName: "عمر حسن", whatsapp: "+9647734567890", city: "بغداد", category: "إلكترونيات", productsCount: 156, ordersCount: 402, createdAt: "2025-11-18", bannedFromBot: false, plan: "enterprise" },
  { id: "s5", storeName: "إكسسوارات لمى", ownerName: "لمى فؤاد", whatsapp: "+9647745678901", city: "الموصل", category: "إكسسوارات", productsCount: 31, ordersCount: 47, createdAt: "2026-05-01", bannedFromBot: false, plan: "free" },
  { id: "s6", storeName: "أحذية كلاسيك", ownerName: "زيد ناصر", whatsapp: "+9647756789012", city: "النجف", category: "أحذية", productsCount: 58, ordersCount: 92, createdAt: "2026-01-29", bannedFromBot: false, plan: "basic" },
];

export const paymentPackages: PaymentPackage[] = [
  { id: "pk1", name: "الباقة الأساسية - بغداد", city: "بغداد", priceMonthly: 25000, currency: "IQD", features: ["حتى 50 منتج", "بوت واتساب", "دعم بريد"], active: true },
  { id: "pk2", name: "الباقة الاحترافية - بغداد", city: "بغداد", priceMonthly: 75000, currency: "IQD", features: ["منتجات غير محدودة", "تقارير متقدمة", "دعم أولوية"], active: true },
  { id: "pk3", name: "الباقة الأساسية - البصرة", city: "البصرة", priceMonthly: 20000, currency: "IQD", features: ["حتى 50 منتج", "بوت واتساب"], active: true },
  { id: "pk4", name: "الباقة الاحترافية - أربيل", city: "أربيل", priceMonthly: 80000, currency: "IQD", features: ["منتجات غير محدودة", "تقارير متقدمة"], active: false },
];

export const deliveryCompanies: DeliveryCompany[] = [
  { id: "d1", name: "أرامكس العراق", phone: "+9647801111111", cities: ["بغداد", "البصرة", "أربيل"], bannedFromBot: false, activeMerchants: 124 },
  { id: "d2", name: "ون ديليفري", phone: "+9647802222222", cities: ["بغداد"], bannedFromBot: false, activeMerchants: 87 },
  { id: "d3", name: "ميتا اكسبرس", phone: "+9647803333333", cities: ["البصرة", "النجف"], bannedFromBot: true, activeMerchants: 32 },
  { id: "d4", name: "سبيد كارغو", phone: "+9647804444444", cities: ["الموصل", "أربيل"], bannedFromBot: false, activeMerchants: 56 },
];

export const broadcastHistory: BroadcastMessage[] = [
  { id: "b1", title: "تحديث جديد للبوت", body: "أضفنا ميزة الترجمة التلقائية لرسائل العملاء.", audience: "all", audienceLabel: "كل التجار", recipients: 2400, sentAt: "2026-05-20", status: "sent" },
  { id: "b2", title: "عروض خاصة لبغداد", body: "خصم 30% على الباقة الاحترافية لتجار بغداد.", audience: "city", audienceLabel: "بغداد", recipients: 840, sentAt: "2026-05-15", status: "sent" },
];

export const iraqiCities = ["بغداد", "البصرة", "أربيل", "الموصل", "النجف", "كربلاء", "السليمانية", "كركوك", "بابل", "الأنبار"];
