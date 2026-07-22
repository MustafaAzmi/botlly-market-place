import { createFileRoute } from "@tanstack/react-router";

import {
  createMerchantProduct,
  deleteMerchantProduct,
  getCurrentMerchant,
  getEnabledCarCatalogueForMerchant,
  getPublicMerchantSignupCatalogue,
  getMerchantDashboard,
  getMerchantProduct,
  listMerchantProducts,
  loginMerchant,
  requestMerchantOtp,
  resetMerchantPassword,
  signupMerchant,
  updateMerchantProduct,
  updateMerchantProfile,
} from "@/lib/merchant.functions";
import {
  merchantConfirmWebSale,
  merchantMarkProductAvailable,
  merchantMarkProductUnavailable,
  listMerchantWebNotifications,
  type WebOrderNotification,
} from "@/lib/web-notifications.functions";
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
  | "requestOtp"
  | "resetPassword"
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
  | "markAvailable"
  | "markUnavailable"
  | "markSold"
  | "markCancelled"
  | "signupCatalogue"
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
    user: diagnosticIdentity(text(input.merchantId) || text(input.whatsapp)),
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

function webNotificationToMobileOrder(order: WebOrderNotification) {
  const details = [
    order.requestDetails ? `الوصف: ${order.requestDetails}` : "",
    order.specialty ? `الاختصاص: ${order.specialty}` : "",
    order.requesterName ? `مقدم الطلب: ${order.requesterName}` : "",
  ].filter(Boolean).join("\n");
  return {
    id: order.orderId,
    productTitle: order.productTitle,
    productPrice: order.price,
    currency: order.currency || "IQD",
    customerNumber: order.requesterPhone,
    customerDetails: details,
    status: order.merchantStatus === "Pending" ? order.finalStatus : order.merchantStatus,
    merchantStatus: order.merchantStatus,
    requesterStatus: order.requesterStatus,
    finalStatus: order.finalStatus,
    merchantNote: order.merchantNote ?? "",
    sentToDelivery: false,
    merchantNotified: order.merchantStatus !== "Pending",
    createdAt: order.createdAt || order.updatedAt,
  };
}

async function listMobileMerchantOrders(data: unknown) {
  const page = await callServerFn(listMerchantWebNotifications, data);
  return {
    ...page,
    items: page.items.map(webNotificationToMobileOrder),
  };
}

export const Route = createFileRoute("/api/merchant/mobile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let action: Action | undefined;
        let data: unknown;
        try {
          ({ action, data } = await readBody(request));
          if (!action) {
            return json("api:merchantMobile:missingAction", { ok: false, error: "Missing action" }, data, { status: 400 });
          }

          switch (action) {
            case "requestOtp":
              return json("api:merchantMobile:requestOtp", { ok: true, result: await callServerFn(requestMerchantOtp, data) }, data);
            case "resetPassword":
              return json("api:merchantMobile:resetPassword", { ok: true, result: await callServerFn(resetMerchantPassword, data) }, data);
            case "login":
              return json("api:merchantMobile:login", { ok: true, result: await callServerFn(loginMerchant, data) }, data);
            case "signup":
              return json("api:merchantMobile:signup", { ok: true, result: await callServerFn(signupMerchant, data) }, data);
            case "currentMerchant":
              return json("api:merchantMobile:currentMerchant", { ok: true, result: await callServerFn(getCurrentMerchant, data) }, data);
            case "updateProfile":
              return json("api:merchantMobile:updateProfile", { ok: true, result: await callServerFn(updateMerchantProfile, data) }, data);
            case "dashboard":
              return json("api:merchantMobile:dashboard", { ok: true, result: await callServerFn(getMerchantDashboard, data) }, data);
            case "listProducts":
              return json("api:merchantMobile:listProducts", { ok: true, result: await callServerFn(listMerchantProducts, data) }, data);
            case "getProduct":
              return json("api:merchantMobile:getProduct", { ok: true, result: await callServerFn(getMerchantProduct, data) }, data);
            case "createProduct":
              return json("api:merchantMobile:createProduct", { ok: true, result: await callServerFn(createMerchantProduct, data) }, data);
            case "updateProduct":
              return json("api:merchantMobile:updateProduct", { ok: true, result: await callServerFn(updateMerchantProduct, data) }, data);
            case "deleteProduct":
              return json("api:merchantMobile:deleteProduct", { ok: true, result: await callServerFn(deleteMerchantProduct, data) }, data);
            case "listOrders":
              return json("api:merchantMobile:listOrders", { ok: true, result: await listMobileMerchantOrders(data) }, data);
            case "markAvailable":
              return json("api:merchantMobile:markAvailable", { ok: true, result: await callServerFn(merchantMarkProductAvailable, data) }, data);
            case "markUnavailable":
              return json("api:merchantMobile:markUnavailable", { ok: true, result: await callServerFn(merchantMarkProductUnavailable, data) }, data);
            case "markSold":
              return json("api:merchantMobile:markSold", { ok: true, result: await callServerFn(merchantConfirmWebSale, { ...(data as Record<string, unknown>), result: "sold" }) }, data);
            case "markCancelled":
              return json("api:merchantMobile:markCancelled", { ok: true, result: await callServerFn(merchantConfirmWebSale, { ...(data as Record<string, unknown>), result: "cancelled" }) }, data);
            case "signupCatalogue":
              return json("api:merchantMobile:signupCatalogue", {
                ok: true,
                result: await getPublicMerchantSignupCatalogue(),
              }, data);
            case "catalogue":
              return json("api:merchantMobile:catalogue", {
                ok: true,
                result: await callServerFn(getEnabledCarCatalogueForMerchant, data),
              }, data);
            default:
              return json("api:merchantMobile:unknownAction", { ok: false, error: "Unknown action" }, data, { status: 400 });
          }
        } catch (error) {
          return json(
            `api:merchantMobile:${action ?? "error"}`,
            {
              ok: false,
              error: error instanceof Error ? error.message : "Unexpected server error",
            },
            data,
            { status: 500 },
          );
        }
      },
    },
  },
});
