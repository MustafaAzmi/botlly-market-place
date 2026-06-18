import { createFileRoute } from "@tanstack/react-router";

import {
  browseCarProducts,
  getEnabledCarCatalogue,
  getMediatorPhone,
  loginCustomer,
  signupCustomer,
  submitProductOrder,
  updateCustomerProfile,
} from "@/lib/customer.functions";
import { getString, listEvents } from "@/lib/eventStore.server";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

type Action =
  | "login"
  | "signup"
  | "updateProfile"
  | "browseProducts"
  | "submitOrder"
  | "catalogue"
  | "mediator"
  | "listOrders";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...jsonHeaders, ...(init?.headers ?? {}) },
  });
}

async function readBody(request: Request): Promise<{ action?: Action; data?: unknown }> {
  const body = await request.text();
  if (!body.trim()) return {};
  return JSON.parse(body) as { action?: Action; data?: unknown };
}

async function callServerFn<TData, TResult>(
  fn: (args: { data: TData }) => Promise<TResult>,
  data: TData,
) {
  return fn({ data });
}

function phoneKey(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

async function listCustomerOrders(data: unknown) {
  const phone = getString((data as Record<string, unknown> | null)?.customerPhone);
  const key = phoneKey(phone);
  if (!key) return [];
  const rows = await listEvents("botly_order");
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const payload = row.payload ?? {};
    const orderPhone =
      getString(payload.customerPhone) ||
      getString(payload.customerNumber) ||
      getString(payload.phone);
    if (phoneKey(orderPhone) !== key) continue;
    const orderId = getString(payload.orderId) || row.id;
    if (!latest.has(orderId)) {
      latest.set(orderId, {
        id: orderId,
        productTitle: getString(payload.productTitle),
        price: payload.price,
        currency: getString(payload.currency) || "IQD",
        status: getString(payload.status) || getString(payload.merchantAvailabilityStatus) || "requested",
        merchantAvailable: payload.merchantAvailable,
        createdAt: getString(payload.createdAt) || row.created_at || row.received_at,
        updatedAt: getString(payload.updatedAt) || row.created_at || row.received_at,
      });
    }
  }
  return [...latest.values()];
}

export const Route = createFileRoute("/api/customer/mobile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { action, data } = await readBody(request);
          if (!action) return json({ ok: false, error: "Missing action" }, { status: 400 });

          switch (action) {
            case "login":
              return json({ ok: true, result: await callServerFn(loginCustomer, data) });
            case "signup":
              return json({ ok: true, result: await callServerFn(signupCustomer, data) });
            case "updateProfile":
              return json({ ok: true, result: await callServerFn(updateCustomerProfile, data) });
            case "browseProducts":
              return json({ ok: true, result: await callServerFn(browseCarProducts, data) });
            case "submitOrder":
              return json({ ok: true, result: await callServerFn(submitProductOrder, data) });
            case "catalogue":
              return json({ ok: true, result: await getEnabledCarCatalogue() });
            case "mediator":
              return json({ ok: true, result: await getMediatorPhone() });
            case "listOrders":
              return json({ ok: true, result: await listCustomerOrders(data) });
            default:
              return json({ ok: false, error: "Unknown action" }, { status: 400 });
          }
        } catch (error) {
          return json(
            { ok: false, error: error instanceof Error ? error.message : "Unexpected server error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
