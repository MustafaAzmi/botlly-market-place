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
import {
  diagnosticIdentity,
  diagnosticResponse,
  diagnosticSession,
  payloadBytes,
} from "@/lib/egress-diagnostics.server";

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

function json(route: string, data: unknown, requestData: unknown, init?: ResponseInit) {
  const body = JSON.stringify(data);
  const input = (requestData ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => typeof value === "string" ? value : "";
  return diagnosticResponse(route, body, {
    ...init,
    headers: { ...jsonHeaders, ...(init?.headers ?? {}) },
  }, {
    payload: data,
    responseBytes: payloadBytes(body),
    user: diagnosticIdentity(text(input.fitterId) || text(input.whatsapp)),
    session: diagnosticSession(text(input.token)),
    params: {
      limit: typeof input.limit === "number" ? input.limit : undefined,
      page: typeof input.page === "number" ? input.page : undefined,
      cursor: text(input.cursor),
    },
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
        let action: Action | undefined;
        let data: unknown;
        try {
          ({ action, data } = await readBody(request));
          if (!action) return json("api:fitterMobile:missingAction", { ok: false, error: "Missing action" }, data, { status: 400 });

          switch (action) {
            case "login":
              return json("api:fitterMobile:login", { ok: true, result: await callServerFn(loginFitter, data) }, data);
            case "signup":
              return json("api:fitterMobile:signup", { ok: true, result: await callServerFn(signupFitter, data) }, data);
            case "summary":
              return json("api:fitterMobile:summary", { ok: true, result: await callServerFn(getFitterSummary, data) }, data);
            case "updateProfile":
              return json("api:fitterMobile:updateProfile", { ok: true, result: await callServerFn(updateFitterProfile, data) }, data);
            case "updateVisa":
              return json("api:fitterMobile:updateVisa", { ok: true, result: await callServerFn(updateFitterVisa, data) }, data);
            case "browseProducts":
              return json("api:fitterMobile:browseProducts", { ok: true, result: await callServerFn(browseCarProducts, data) }, data);
            case "requestProduct":
              return json("api:fitterMobile:requestProduct", { ok: true, result: await callServerFn(requestFitterProduct, data) }, data);
            case "confirmReceipt":
              return json("api:fitterMobile:confirmReceipt", { ok: true, result: await callServerFn(confirmFitterReceipt, data) }, data);
            case "cancelOrder":
              return json("api:fitterMobile:cancelOrder", { ok: true, result: await callServerFn(cancelFitterOrder, data) }, data);
            case "catalogue":
              return json("api:fitterMobile:catalogue", { ok: true, result: await getEnabledCarCatalogue() }, data);
            default:
              return json("api:fitterMobile:unknownAction", { ok: false, error: "Unknown action" }, data, { status: 400 });
          }
        } catch (error) {
          return json(
            `api:fitterMobile:${action ?? "error"}`,
            { ok: false, error: error instanceof Error ? error.message : "Unexpected server error" },
            data,
            { status: 500 },
          );
        }
      },
    },
  },
});
