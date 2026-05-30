// Admin-side seed holders. Keep empty until real Supabase queries provide data.

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

// TODO(supabase): replace this temporary guard with supabase.auth +
// a server-side user_roles admin check.
export const ADMIN_CREDENTIALS = {
  email: "mustafa.azmi.mustafa@gmail.com",
  phone: "07836653453",
} as const;

export const ADMIN_SESSION_KEY = "botly.admin.session";

export const adminStores: AdminStore[] = [];

export const paymentPackages: PaymentPackage[] = [];

export const deliveryCompanies: DeliveryCompany[] = [];

export const broadcastHistory: BroadcastMessage[] = [];

export const iraqiCities = [
  "بغداد",
  "البصرة",
  "أربيل",
  "الموصل",
  "النجف",
  "كربلاء",
  "السليمانية",
  "كركوك",
  "بابل",
  "الأنبار",
];
