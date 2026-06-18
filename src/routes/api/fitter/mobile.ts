import { createFileRoute } from "@tanstack/react-router";

import {
  cancelFitterOrder,
  confirmFitterReceipt,
  getFitterSummary,
  loginFitter,
  requestFitterProduct,
  signupFitter,
  updateFitterProfile,
  updateFitterVisa,
} from "@/lib/fitter.functions";
import { browseCarProducts, getEnabledCarCatalogue } from "@/lib/customer.functions";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

type Action =
  | "login"
  | "signup"
  | "summary"
  | "updateProfile"
  | "updateVisa"
  | "browseProducts"
  | "requestProduct"
  | "confirmReceipt"
  | "cancelOrder"
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

export const Route = createFileRoute("/api/fitter/mobile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { action, data } = await readBody(request);
          if (!action) return json({ ok: false, error: "Missing action" }, { status: 400 });

          switch (action) {
            case "login":
              return json({ ok: true, result: await callServerFn(loginFitter, data) });
            case "signup":
              return json({ ok: true, result: await callServerFn(signupFitter, data) });
            case "summary":
              return json({ ok: true, result: await callServerFn(getFitterSummary, data) });
            case "updateProfile":
              return json({ ok: true, result: await callServerFn(updateFitterProfile, data) });
            case "updateVisa":
              return json({ ok: true, result: await callServerFn(updateFitterVisa, data) });
            case "browseProducts":
              return json({ ok: true, result: await callServerFn(browseCarProducts, data) });
            case "requestProduct":
              return json({ ok: true, result: await callServerFn(requestFitterProduct, data) });
            case "confirmReceipt":
              return json({ ok: true, result: await callServerFn(confirmFitterReceipt, data) });
            case "cancelOrder":
              return json({ ok: true, result: await callServerFn(cancelFitterOrder, data) });
            case "catalogue":
              return json({ ok: true, result: await getEnabledCarCatalogue() });
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
