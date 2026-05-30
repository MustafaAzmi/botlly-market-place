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

// Stores Management
export const listStores = createServerFn({ method: "POST" })
  .inputValidator((d) => storeListInput.parse(d))
  .handler(async ({ data }) => {
    try {
      const { data: stores, error } = await supabaseAdmin
        .from("admin_stores")
        .select("*")
        .ilike("store_name", `%${data.search || ""}%`)
        .range((data.page - 1) * 10, data.page * 10 - 1)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Supabase error:", error);
        // Return mock data for now
        return [
          {
            id: "store_1",
            storeName: "متجري الأول",
            ownerName: "أحمد",
            whatsapp: "+964791234567",
            email: "store1@example.com",
            city: "بغداد",
            category: "ملابس",
            active: true,
            createdAt: new Date().toISOString(),
          },
        ];
      }

      return stores.map((s: any) => ({
        id: s.id,
        storeName: s.store_name,
        ownerName: s.owner_name,
        whatsapp: s.whatsapp,
        email: s.email,
        city: s.city,
        category: s.category,
        active: !s.banned_from_bot,
        createdAt: s.created_at,
      })) as AdminStore[];
    } catch {
      // Return mock data on error
      return [
        {
          id: "store_1",
          storeName: "متجري الأول",
          ownerName: "أحمد",
          whatsapp: "+964791234567",
          email: "store1@example.com",
          city: "بغداد",
          category: "ملابس",
          active: true,
          createdAt: new Date().toISOString(),
        },
      ];
    }
  });

export const toggleStoreStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => toggleStoreInput.parse(d))
  .handler(async ({ data }) => {
    try {
      const { data: store, error: fetchError } = await supabaseAdmin
        .from("admin_stores")
        .select("banned_from_bot")
        .eq("id", data.storeId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      const { error } = await supabaseAdmin
        .from("admin_stores")
        .update({ banned_from_bot: !store?.banned_from_bot })
        .eq("id", data.storeId);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (err) {
      throw new Error(
        err instanceof Error ? err.message : "Failed to toggle store status"
      );
    }
  });
