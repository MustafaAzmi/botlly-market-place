import { createFileRoute } from "@tanstack/react-router";

import {
  createMerchantProduct,
  deleteMerchantProduct,
  getCurrentMerchant,
  getEnabledCarCatalogueForMerchant,
  getMerchantDashboard,
  getMerchantProduct,
  listMerchantOrders,
  listMerchantProducts,
  loginMerchant,
  signupMerchant,
  updateMerchantProduct,
  updateMerchantProfile,
} from "@/lib/merchant.functions";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

type Action =
  | "login"
  | "signup"
  | "currentMerchant"
  | "updateProfile"
  | "dashboard"
  | "listProducts"
  | "getProduct"
  | "createProduct"
  | "updateProduct"
  | "deleteProduct"
  | "listOrders"
  | "catalogue";

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

export const Route = createFileRoute("/api/merchant/mobile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { action, data } = await readBody(request);
          if (!action) {
            return json({ ok: false, error: "Missing action" }, { status: 400 });
          }

          switch (action) {
            case "login":
              return json({ ok: true, result: await callServerFn(loginMerchant, data) });
            case "signup":
              return json({ ok: true, result: await callServerFn(signupMerchant, data) });
            case "currentMerchant":
              return json({ ok: true, result: await callServerFn(getCurrentMerchant, data) });
            case "updateProfile":
              return json({ ok: true, result: await callServerFn(updateMerchantProfile, data) });
            case "dashboard":
              return json({ ok: true, result: await callServerFn(getMerchantDashboard, data) });
            case "listProducts":
              return json({ ok: true, result: await callServerFn(listMerchantProducts, data) });
            case "getProduct":
              return json({ ok: true, result: await callServerFn(getMerchantProduct, data) });
            case "createProduct":
              return json({ ok: true, result: await callServerFn(createMerchantProduct, data) });
            case "updateProduct":
              return json({ ok: true, result: await callServerFn(updateMerchantProduct, data) });
            case "deleteProduct":
              return json({ ok: true, result: await callServerFn(deleteMerchantProduct, data) });
            case "listOrders":
              return json({ ok: true, result: await callServerFn(listMerchantOrders, data) });
            case "catalogue":
              return json({
                ok: true,
                result: await callServerFn(getEnabledCarCatalogueForMerchant, data),
              });
            default:
              return json({ ok: false, error: "Unknown action" }, { status: 400 });
          }
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : "Unexpected server error",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
