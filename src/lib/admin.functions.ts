import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Types
export interface AdminStore {
  id: string;
  storeName: string;
  ownerName: string;
  whatsapp: string;
  email?: string;
  city: string;
  category: string;
  active: boolean;
  createdAt: string;
}

export interface AdminAccount {
  id: string;
  email: string;
}

// Validation
const loginInput = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6),
});

const signupInput = loginInput;

const tokenInput = z.object({
  token: z.string().min(20),
});

const storeListInput = tokenInput.extend({
  page: z.number().int().min(1).default(1),
  search: z.string().optional(),
});

const toggleStoreInput = tokenInput.extend({
  storeId: z.string().uuid(),
});

// Merchants are stored in the shared event-sourcing table, written by
// merchant.functions.ts with source='botly' and event_type='botly_merchant'.
const MERCHANT_EVENT_TYPE = "botly_merchant";

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

// Admin Authentication
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// ADMIN CREDENTIALS (Temporary - for testing only)
const ADMIN_CREDENTIALS = [
  { email: "mustafa.azmi.mustafa@gmail.com", password: "admin@123" },
  { email: "admin@botly.tech", password: "admin@123" },
];

export const loginAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => loginInput.parse(d))
  .handler(async ({ data }) => {
    const admin = ADMIN_CREDENTIALS.find(
      (a) =>
        a.email === data.email &&
        a.password === data.password
    );

    if (!admin) {
      throw new Error("Invalid email or password");
    }

    const token = generateToken();

    return {
      token,
      admin: {
        id: "admin_001",
        email: admin.email,
      },
    };
  });

export const signupAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => signupInput.parse(d))
  .handler(async ({ data }) => {
    // For now, just accept signup with a token
    const token = generateToken();

    return {
      token,
      admin: {
        id: "admin_" + Date.now(),
        email: data.email,
      },
    };
  });

// Stores Management — reads the real merchants registered through the merchant
// signup flow (stored as botly_merchant events), not a separate admin table.
const PAGE_SIZE = 10;

export const listStores = createServerFn({ method: "POST" })
  .inputValidator((d) => storeListInput.parse(d))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("whatsapp_webhook_events")
      .select("id,payload,created_at")
      .eq("source", "botly")
      .eq("event_type", MERCHANT_EVENT_TYPE)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) {
      throw new Error("تعذر تحميل المتاجر من قاعدة البيانات.");
    }

    const stores: AdminStore[] = (rows ?? []).map((row: any) => {
      const p = (row.payload ?? {}) as Record<string, unknown>;
      return {
        id: row.id,
        storeName: getString(p.storeName),
        ownerName: getString(p.ownerName) || getString(p.storeName),
        whatsapp: getString(p.whatsapp),
        email: getString(p.email) || undefined,
        city: getString(p.city),
        category: getString(p.category),
        active: p.bannedFromBot !== true,
        createdAt: getString(p.createdAt) || row.created_at || new Date().toISOString(),
      };
    });

    const search = (data.search || "").trim().toLowerCase();
    const filtered = search
      ? stores.filter(
          (s) =>
            s.storeName.toLowerCase().includes(search) ||
            s.whatsapp.toLowerCase().includes(search) ||
            (s.email ?? "").toLowerCase().includes(search),
        )
      : stores;

    const start = (data.page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  });

export const toggleStoreStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => toggleStoreInput.parse(d))
  .handler(async ({ data }) => {
    const { data: row, error: fetchError } = await supabaseAdmin
      .from("whatsapp_webhook_events")
      .select("id,payload")
      .eq("id", data.storeId)
      .maybeSingle();

    if (fetchError || !row) {
      throw new Error("لم يتم العثور على المتجر.");
    }

    const payload = ((row as any).payload ?? {}) as Record<string, unknown>;
    const nextBanned = payload.bannedFromBot !== true;

    const { error } = await supabaseAdmin
      .from("whatsapp_webhook_events")
      .update({
        payload: {
          ...payload,
          bannedFromBot: nextBanned,
          updatedAt: new Date().toISOString(),
        },
      })
      .eq("id", data.storeId);

    if (error) {
      throw new Error("تعذر تحديث حالة المتجر.");
    }

    // active = the opposite of banned; the UI shows نشط/معطل from this.
    return { success: true, active: !nextBanned };
  });
