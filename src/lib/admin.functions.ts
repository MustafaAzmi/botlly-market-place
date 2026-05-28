// Admin CRUD server functions. Backed by Lovable Cloud via supabaseAdmin.
//
// SECURITY NOTE
// -------------
// These functions currently rely on the client-side admin guard
// (sessionStorage flag set after /admin/login). They DO NOT yet verify a
// `has_role(uid, 'admin')` claim on the server. Anyone who can call the
// server fn endpoint can call these. This matches the current login model
// (hardcoded email/phone, no real Supabase auth), and is marked here so
// the next pass can wire `requireSupabaseAuth` + a `user_roles` check.
//
// TODO(auth): replace supabaseAdmin with requireSupabaseAuth middleware +
// has_role(auth.uid(), 'admin') check before any handler runs.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  AdminStore,
  BroadcastMessage,
  DeliveryCompany,
  PaymentPackage,
  Plan,
  Audience,
  BroadcastStatus,
} from "./adminTypes";

// ----------------------- Stores -----------------------

type StoreRow = {
  id: string;
  store_name: string;
  owner_name: string;
  whatsapp: string;
  city: string;
  category: string;
  products_count: number;
  orders_count: number;
  banned_from_bot: boolean;
  plan: string;
  created_at: string;
};

const mapStore = (r: StoreRow): AdminStore => ({
  id: r.id,
  storeName: r.store_name,
  ownerName: r.owner_name,
  whatsapp: r.whatsapp,
  city: r.city,
  category: r.category,
  productsCount: r.products_count,
  ordersCount: r.orders_count,
  bannedFromBot: r.banned_from_bot,
  plan: (r.plan as Plan) ?? "free",
  createdAt: r.created_at,
});

export const listStores = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminStore[]> => {
    const { data, error } = await supabaseAdmin
      .from("admin_stores")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as StoreRow[]).map(mapStore);
  },
);

export const setStoreBan = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), banned: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("admin_stores")
      .update({ banned_from_bot: data.banned })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----------------------- Packages -----------------------

type PkgRow = {
  id: string;
  name: string;
  city: string;
  price_monthly: number;
  currency: string;
  features: string[];
  active: boolean;
};

const mapPkg = (r: PkgRow): PaymentPackage => ({
  id: r.id,
  name: r.name,
  city: r.city,
  priceMonthly: r.price_monthly,
  currency: r.currency,
  features: r.features ?? [],
  active: r.active,
});

const packageInput = z.object({
  name: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(80),
  priceMonthly: z.number().int().min(0).max(100_000_000),
  currency: z.string().trim().min(1).max(6),
  features: z.array(z.string().trim().min(1).max(200)).max(20),
  active: z.boolean(),
});

export const listPackages = createServerFn({ method: "GET" }).handler(
  async (): Promise<PaymentPackage[]> => {
    const { data, error } = await supabaseAdmin
      .from("payment_packages")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as PkgRow[]).map(mapPkg);
  },
);

export const createPackage = createServerFn({ method: "POST" })
  .inputValidator((d) => packageInput.parse(d))
  .handler(async ({ data }) => {
    const { error, data: row } = await supabaseAdmin
      .from("payment_packages")
      .insert({
        name: data.name,
        city: data.city,
        price_monthly: data.priceMonthly,
        currency: data.currency,
        features: data.features,
        active: data.active,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapPkg(row as PkgRow);
  });

export const updatePackage = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ id: z.string().uuid() }).merge(packageInput).parse(d),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("payment_packages")
      .update({
        name: data.name,
        city: data.city,
        price_monthly: data.priceMonthly,
        currency: data.currency,
        features: data.features,
        active: data.active,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const togglePackageActive = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("payment_packages")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePackage = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("payment_packages")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----------------------- Delivery -----------------------

type DelRow = {
  id: string;
  name: string;
  phone: string;
  cities: string[];
  banned_from_bot: boolean;
  active_merchants: number;
};

const mapDel = (r: DelRow): DeliveryCompany => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  cities: r.cities ?? [],
  bannedFromBot: r.banned_from_bot,
  activeMerchants: r.active_merchants,
});

const deliveryInput = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(3).max(40),
  cities: z.array(z.string().trim().min(1).max(80)).max(30),
});

export const listDelivery = createServerFn({ method: "GET" }).handler(
  async (): Promise<DeliveryCompany[]> => {
    const { data, error } = await supabaseAdmin
      .from("delivery_companies")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as DelRow[]).map(mapDel);
  },
);

export const createDelivery = createServerFn({ method: "POST" })
  .inputValidator((d) => deliveryInput.parse(d))
  .handler(async ({ data }) => {
    const { error, data: row } = await supabaseAdmin
      .from("delivery_companies")
      .insert({
        name: data.name,
        phone: data.phone,
        cities: data.cities,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapDel(row as DelRow);
  });

export const setDeliveryBan = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), banned: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("delivery_companies")
      .update({ banned_from_bot: data.banned })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDelivery = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("delivery_companies")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----------------------- Broadcasts -----------------------

type BRow = {
  id: string;
  title: string;
  body: string;
  audience: string;
  audience_label: string;
  recipients: number;
  status: string;
  sent_at: string | null;
};

const mapB = (r: BRow): BroadcastMessage => ({
  id: r.id,
  title: r.title,
  body: r.body,
  audience: (r.audience as Audience) ?? "all",
  audienceLabel: r.audience_label,
  recipients: r.recipients,
  status: (r.status as BroadcastStatus) ?? "sent",
  sentAt: r.sent_at,
});

export const listBroadcasts = createServerFn({ method: "GET" }).handler(
  async (): Promise<BroadcastMessage[]> => {
    const { data, error } = await supabaseAdmin
      .from("broadcasts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as BRow[]).map(mapB);
  },
);

export const sendBroadcast = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        title: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(2000),
        audience: z.enum(["all", "city", "plan", "selection"]),
        audienceLabel: z.string().trim().min(1).max(200),
        recipientIds: z.array(z.string().uuid()).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // TODO(bot): enqueue actual WhatsApp send job for each recipient.
    const { error, data: row } = await supabaseAdmin
      .from("broadcasts")
      .insert({
        title: data.title,
        body: data.body,
        audience: data.audience,
        audience_label: data.audienceLabel,
        recipients: data.recipientIds.length,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapB(row as BRow);
  });
