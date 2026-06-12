// Customer-facing server functions.
//
// Customers are WhatsApp-first: they register ONCE with their WhatsApp number,
// name, landmark and governorate. The profile lives permanently in the event
// store (botly_customer) — logging in again only needs the number.
//
// Privacy model: customers browsing the catalogue NEVER see merchant contact
// info (no phone, no address, no store name) and merchants never see the
// customer's phone. All human contact goes through the mediator (الوسيط),
// whose number the admin manages in settings.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendEvent,
  listEvents,
  getString,
  getNumber,
  eventTime,
  phoneKey,
  type EventRow,
} from "@/lib/eventStore.server";
import { filterByEnabledConfig, type CarMake } from "@/lib/car-data";

const CUSTOMER_PROVIDER = "botly_customer" as const;

export type CustomerProfile = {
  id: string;
  whatsapp: string;
  name: string;
  landmark: string; // أقرب نقطة دالة
  governorate: string; // المحافظة / المدينة
  createdAt: string;
  updatedAt: string;
};

// Customer-facing product view: specs + price ONLY (no merchant identity).
export type CustomerProduct = {
  id: string;
  title: string;
  description: string;
  imageUrls: string[];
  // The final price — the only price customers see.
  price: number;
  currency: string;
  color?: string;
  size?: string;
  carMake?: string;
  carModel?: string;
  carYear?: string;
  quantity?: number;
};

const phoneInput = z.object({
  whatsapp: z.string().trim().min(6).max(40),
});

const profileInput = phoneInput.extend({
  name: z.string().trim().min(2).max(100),
  landmark: z.string().trim().min(2).max(200),
  governorate: z.string().trim().min(2).max(100),
});

function customerIdentity(row: EventRow): string {
  return getString(row.payload?.customerId) || row.id;
}

function toCustomer(row: EventRow): CustomerProfile {
  const p = row.payload ?? {};
  return {
    id: customerIdentity(row),
    whatsapp: getString(p.whatsapp),
    name: getString(p.name),
    landmark: getString(p.landmark),
    governorate: getString(p.governorate),
    createdAt: getString(p.createdAt) || eventTime(row),
    updatedAt: getString(p.updatedAt) || eventTime(row),
  };
}

// Latest profile event per customer (append-only store, newest wins). Phone
// matching is format-independent: 07X..., +9647X... and 9647X... all match.
async function findCustomerByPhone(whatsapp: string): Promise<EventRow | null> {
  const key = phoneKey(whatsapp);
  if (!key) return null;
  const rows = await listEvents(CUSTOMER_PROVIDER);
  return rows.find((row) => phoneKey(getString(row.payload?.whatsapp)) === key) ?? null;
}

// ---------------------------------------------------------------------------
// Auth: register once, stay remembered forever
// ---------------------------------------------------------------------------

export const loginCustomer = createServerFn({ method: "POST" })
  .inputValidator((d) => phoneInput.parse(d))
  .handler(async ({ data }) => {
    const row = await findCustomerByPhone(data.whatsapp);
    if (!row) {
      throw new Error("الرقم غير مسجل. أنشئ حساب أولاً — مرة وحدة فقط وراح نتذكرك دائماً.");
    }
    return { customer: toCustomer(row), token: crypto.randomUUID() };
  });

export const signupCustomer = createServerFn({ method: "POST" })
  .inputValidator((d) => profileInput.parse(d))
  .handler(async ({ data }) => {
    const existing = await findCustomerByPhone(data.whatsapp);
    if (existing) {
      // Already registered: just log them in with their saved profile.
      return { customer: toCustomer(existing), token: crypto.randomUUID(), existed: true };
    }

    const now = new Date().toISOString();
    const row = await appendEvent(CUSTOMER_PROVIDER, {
      customerId: crypto.randomUUID(),
      whatsapp: data.whatsapp,
      name: data.name,
      landmark: data.landmark,
      governorate: data.governorate,
      createdAt: now,
      updatedAt: now,
    });
    return { customer: toCustomer(row), token: crypto.randomUUID(), existed: false };
  });

export const updateCustomerProfile = createServerFn({ method: "POST" })
  .inputValidator((d) => profileInput.parse(d))
  .handler(async ({ data }) => {
    const existing = await findCustomerByPhone(data.whatsapp);
    if (!existing) throw new Error("الحساب غير موجود.");

    const now = new Date().toISOString();
    const row = await appendEvent(CUSTOMER_PROVIDER, {
      ...(existing.payload ?? {}),
      customerId: customerIdentity(existing),
      whatsapp: data.whatsapp,
      name: data.name,
      landmark: data.landmark,
      governorate: data.governorate,
      updatedAt: now,
    });
    return { customer: toCustomer(row) };
  });

// ---------------------------------------------------------------------------
// Catalogue browsing (car filters, merchant identity hidden)
// ---------------------------------------------------------------------------

const browseInput = z.object({
  carMake: z.string().trim().max(60).optional().or(z.literal("")),
  carModel: z.string().trim().max(60).optional().or(z.literal("")),
  carYear: z.string().trim().max(10).optional().or(z.literal("")),
  color: z.string().trim().max(60).optional().or(z.literal("")),
});

// Does this product fit the requested manufacture year?
// - carYear field set → must match exactly.
// - No carYear but the title/description mention a year (older products like
//   "لايت كورولا موديل 2016") → that year must match.
// - No year info at all → universal part, fits every year.
function matchesYear(payload: Record<string, unknown>, wantYear: string): boolean {
  if (!wantYear) return true;
  const carYear = getString(payload.carYear);
  if (carYear) return carYear === wantYear;
  const text = `${getString(payload.title)} ${getString(payload.description)}`;
  const mentionedYears = text.match(/\b(19|20)\d{2}\b/g);
  if (mentionedYears && mentionedYears.length > 0) return mentionedYears.includes(wantYear);
  return true;
}

// Merchants hidden from customers (banned / suspended / expired) — same rules
// as the WhatsApp search path.
async function loadHiddenMerchants(): Promise<Set<string>> {
  const hidden = new Set<string>();
  const rows = await listEvents("botly_merchant").catch(() => [] as EventRow[]);
  const seen = new Set<string>();
  for (const row of rows) {
    const p = row.payload ?? {};
    const id = getString(p.merchantId) || row.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (
      p.bannedFromBot === true ||
      p.bannedFromBot === "true" ||
      p.visibilityEnabled === "false" ||
      p.visibilityEnabled === false ||
      p.isActive === "false" ||
      p.isActive === false ||
      (p.suspendedAt && String(p.suspendedAt).trim() !== "") ||
      p.subscriptionStatus === "expired" ||
      (p.packageExpiry &&
        String(p.packageExpiry).trim() !== "" &&
        new Date(String(p.packageExpiry)) < new Date())
    ) {
      hidden.add(id);
    }
  }
  return hidden;
}

export const browseCarProducts = createServerFn({ method: "POST" })
  .inputValidator((d) => browseInput.parse(d))
  .handler(async ({ data }): Promise<CustomerProduct[]> => {
    const [rows, hiddenMerchants] = await Promise.all([
      listEvents("botly_product"),
      loadHiddenMerchants(),
    ]);

    const wantMake = (data.carMake ?? "").trim();
    const wantModel = (data.carModel ?? "").trim();
    const wantYear = (data.carYear ?? "").trim();
    const wantColor = (data.color ?? "").trim();

    const results: CustomerProduct[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const p = row.payload ?? {};
      const productId = getString(p.productId) || row.id;
      if (seen.has(productId)) continue;
      seen.add(productId); // newest event per product wins

      if (getString(p.status) !== "active") continue;
      if (hiddenMerchants.has(getString(p.merchantId))) continue;

      const carMake = getString(p.carMake);
      const carModel = getString(p.carModel);
      const color = getString(p.color);

      // Universal parts ("عام") fit every car, so they pass any make filter.
      if (wantMake && carMake !== wantMake && carMake !== "عام") continue;
      if (
        wantModel &&
        wantModel !== "كل الموديلات" &&
        carModel !== wantModel &&
        carModel !== "كل الموديلات"
      )
        continue;
      if (wantColor && wantColor !== "أخرى" && !color.includes(wantColor)) continue;
      if (!matchesYear(p, wantYear)) continue;

      const primaryImage = getString(p.imageUrl);
      const extraImages = Array.isArray(p.imageUrls)
        ? (p.imageUrls as unknown[]).filter(
            (v): v is string => typeof v === "string" && v.length > 0,
          )
        : [];

      results.push({
        id: productId,
        title: getString(p.title) || getString(p.description) || "منتج",
        description: getString(p.description),
        imageUrls: extraImages.length > 0 ? extraImages : primaryImage ? [primaryImage] : [],
        price: getNumber(p.discountPrice) ?? getNumber(p.currentPrice) ?? 0,
        currency: getString(p.currency) || "IQD",
        color: color || undefined,
        size: getString(p.size) || undefined,
        carMake: carMake || undefined,
        carModel: carModel || undefined,
        carYear: getString(p.carYear) || undefined,
        quantity: getNumber(p.quantity),
      });
    }

    return results;
  });

// ---------------------------------------------------------------------------
// Mediator (الوسيط) contact — admin-managed number in botly_settings
// ---------------------------------------------------------------------------

export const getMediatorPhone = createServerFn({ method: "POST" }).handler(async () => {
  const rows = await listEvents("botly_settings").catch(() => [] as EventRow[]);
  for (const row of rows) {
    const phone = getString(row.payload?.mediatorPhone);
    if (phone) return { phone };
  }
  return { phone: "" };
});

// Customer-facing car catalogue: only enabled items show in dropdowns.
export type CustomerCarCatalogue = {
  makes: CarMake[];
  colors: string[];
  years: string[];
};

export const getEnabledCarCatalogue = createServerFn({ method: "POST" }).handler(
  async (): Promise<CustomerCarCatalogue> => {
    const configRows = await listEvents("botly_catalogue_config").catch(
      () => [] as EventRow[],
    );

    if (configRows.length === 0) {
      return { makes: [], colors: [], years: [] };
    }

    const latest = configRows[configRows.length - 1];
    const p = latest.payload ?? {};
    const config = {
      enabledMakes: Array.isArray(p.enabledMakes)
        ? (p.enabledMakes as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
      modelsByMake:
        typeof p.modelsByMake === "object" && p.modelsByMake !== null
          ? (p.modelsByMake as Record<string, unknown>)
          : {},
      enabledColors: Array.isArray(p.enabledColors)
        ? (p.enabledColors as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
      enabledYears: Array.isArray(p.enabledYears)
        ? (p.enabledYears as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
    };

    // Filter the hardcoded car data by what's enabled
    const filtered = filterByEnabledConfig(config);
    return filtered;
  },
);

