import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getString, getNumber, listEvents, appendEvent, normalizePhone } from "@/lib/eventStore.server";

const CUSTOMER_PROVIDER = "botly_customer";

export type CustomerProfile = {
  id: string;
  whatsapp: string;
  name: string;
  landmark: string; // أقرب نقطة دالة
  governorate: string; // المحافظة/المدينة
  createdAt: string;
  updatedAt: string;
};

const customerAuthInput = z.object({
  whatsapp: z.string().trim().min(3).max(40),
});

const customerSignupInput = customerAuthInput.extend({
  name: z.string().trim().min(2).max(100),
  landmark: z.string().trim().min(2).max(200),
  governorate: z.string().trim().min(2).max(100),
});

// Normalize WhatsApp number for consistent lookups (remove special chars, ensure digits only)
function normalizeCustomerPhone(whatsapp: string): string {
  const digits = whatsapp.replace(/\D/g, "");
  // If starts with 0 (Iraqi format), convert to 964 (country code)
  return digits.startsWith("0") ? `964${digits.slice(1)}` : digits;
}

// Find an existing customer by WhatsApp number
async function findCustomerByPhone(whatsapp: string): Promise<CustomerProfile | null> {
  const normalized = normalizeCustomerPhone(whatsapp);
  const rows = await listEvents(CUSTOMER_PROVIDER, 100).catch(() => []);

  for (const row of rows) {
    const p = row.payload ?? {};
    const customerPhone = normalizeCustomerPhone(getString(p.whatsapp) || "");
    if (customerPhone === normalized) {
      return {
        id: getString(p.customerId) || row.id,
        whatsapp: getString(p.whatsapp) || "",
        name: getString(p.name) || "",
        landmark: getString(p.landmark) || "",
        governorate: getString(p.governorate) || "",
        createdAt: getString(p.createdAt) || "",
        updatedAt: getString(p.updatedAt) || "",
      };
    }
  }
  return null;
}

// Login: check if customer exists by phone
export const loginCustomer = createServerFn({ method: "POST" }, async (input: unknown) => {
  try {
    const data = customerAuthInput.parse(input);
    const customer = await findCustomerByPhone(data.whatsapp);

    if (!customer) {
      return {
        ok: false as const,
        error: "الرقم غير مسجل. يرجى إنشاء حساب أولاً.",
      };
    }

    return {
      ok: true as const,
      customer,
      token: crypto.randomUUID(),
    };
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "خطأ في التحقق";
    return { ok: false as const, error: message };
  }
});

// Signup: create a new customer account
export const signupCustomer = createServerFn({ method: "POST" }, async (input: unknown) => {
  try {
    const data = customerSignupInput.parse(input);
    const existing = await findCustomerByPhone(data.whatsapp);

    if (existing) {
      return {
        ok: false as const,
        error: "هذا الرقم مسجل بالفعل. يرجى تسجيل الدخول.",
      };
    }

    const customerId = crypto.randomUUID();
    const now = new Date().toISOString();

    await appendEvent(CUSTOMER_PROVIDER, {
      customerId,
      whatsapp: data.whatsapp,
      name: data.name,
      landmark: data.landmark,
      governorate: data.governorate,
      createdAt: now,
      updatedAt: now,
    }).catch((error) => {
      console.error("[Customer] Failed to create customer:", error);
      throw new Error("فشل إنشاء الحساب. حاول لاحقاً.");
    });

    return {
      ok: true as const,
      customer: {
        id: customerId,
        whatsapp: data.whatsapp,
        name: data.name,
        landmark: data.landmark,
        governorate: data.governorate,
        createdAt: now,
        updatedAt: now,
      },
      token: crypto.randomUUID(),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues[0]?.message || "خطأ في البيانات المدخلة";
      return { ok: false as const, error: message };
    }
    if (error instanceof Error) {
      return { ok: false as const, error: error.message };
    }
    return { ok: false as const, error: "خطأ غير متوقع" };
  }
});

// Update customer profile
export const updateCustomerProfile = createServerFn(
  { method: "POST" },
  async (input: unknown) => {
    try {
      const data = customerSignupInput.parse(input);
      const customer = await findCustomerByPhone(data.whatsapp);

      if (!customer) {
        return { ok: false as const, error: "الزبون غير موجود" };
      }

      const now = new Date().toISOString();
      await appendEvent(CUSTOMER_PROVIDER, {
        customerId: customer.id,
        whatsapp: data.whatsapp,
        name: data.name,
        landmark: data.landmark,
        governorate: data.governorate,
        createdAt: customer.createdAt,
        updatedAt: now,
      }).catch((error) => {
        console.error("[Customer] Failed to update customer:", error);
        throw new Error("فشل تحديث البيانات");
      });

      return {
        ok: true as const,
        customer: {
          id: customer.id,
          whatsapp: data.whatsapp,
          name: data.name,
          landmark: data.landmark,
          governorate: data.governorate,
          createdAt: customer.createdAt,
          updatedAt: now,
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { ok: false as const, error: error.issues[0]?.message || "خطأ في البيانات" };
      }
      if (error instanceof Error) {
        return { ok: false as const, error: error.message };
      }
      return { ok: false as const, error: "خطأ غير متوقع" };
    }
  },
);
