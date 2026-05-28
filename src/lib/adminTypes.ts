// Shared admin row types (camelCase mapping from snake_case Postgres rows).
// Keep this file client-safe — no Supabase admin imports here.

export type Plan = "free" | "basic" | "pro" | "enterprise";
export type Audience = "all" | "city" | "plan" | "selection";
export type BroadcastStatus = "draft" | "scheduled" | "sent";

export interface AdminStore {
  id: string;
  storeName: string;
  ownerName: string;
  whatsapp: string;
  city: string;
  category: string;
  productsCount: number;
  ordersCount: number;
  bannedFromBot: boolean;
  plan: Plan;
  createdAt: string;
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
  audience: Audience;
  audienceLabel: string;
  recipients: number;
  status: BroadcastStatus;
  sentAt: string | null;
}

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
