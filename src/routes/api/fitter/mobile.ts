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
import { submitMissingProductRequest } from "@/lib/missing-product.functions";
import {
  diagnosticIdentity,
  diagnosticResponse,
  diagnosticSession,
  payloadBytes,
} from "@/lib/egress-diagnostics.server";
import {
  listRequesterWebNotifications,
  requesterConfirmWebPurchase,
  type WebOrderNotification,
} from "@/lib/web-notifications.functions";

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
  | "submitSmartRequest"
  | "requestProduct"
  | "confirmReceipt"
  | "cancelOrder"
  | "confirmWebPurchase"
  | "cancelWebPurchase"
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

function calculateCommission(price: number, percent: number) {
  return Number(((price * percent) / 100).toFixed(2));
}

function webRequesterNotificationToFitterOrder(order: WebOrderNotification, commissionPercent: number) {
  const isCompleted = order.merchantStatus === "Sold" && order.requesterStatus === "Purchased";
  const commissionAmount = isCompleted ? calculateCommission(order.price, commissionPercent) : 0;
  return {
    id: order.orderId,
    productTitle: order.productTitle,
    productPrice: order.price,
    currency: order.currency || "IQD",
    merchantStoreName: order.merchantStoreName,
    merchantWhatsapp: order.merchantWhatsapp,
    merchantAddress: "",
    merchantGovernorate: order.merchantGovernorate,
    commissionPercent: isCompleted ? commissionPercent : 0,
    commissionAmount,
    status: order.finalStatus || order.requesterStatus,
    merchantStatus: order.merchantStatus,
    requesterStatus: order.requesterStatus,
    finalStatus: order.finalStatus,
  };
}

async function getMobileFitterSummary(data: unknown) {
  const summary = await callServerFn(getFitterSummary, data);
  const phone = summary.fitter.whatsapp;
  if (!phone) return summary;
  try {
    const page = await callServerFn(listRequesterWebNotifications, {
      requesterPhone: phone,
      requesterType: "fitter" as const,
      limit: 100,
    });
    if (page.items.length > 0) {
      const webOrders = page.items.map((order) =>
        webRequesterNotificationToFitterOrder(order, summary.fitter.commissionPercent),
      );
      const webOrderIds = new Set(webOrders.map((order) => order.id));
      const confirmedWebOrders = webOrders.filter((order) => order.finalStatus === "completed");
      const webProfit = Number(confirmedWebOrders.reduce((sum, order) => sum + order.commissionAmount, 0).toFixed(2));
      return {
        ...summary,
        totalProfit: Number((summary.totalProfit + webProfit).toFixed(2)),
        salesCount: summary.salesCount + confirmedWebOrders.length,
        orders: [
          ...webOrders,
          ...summary.orders.filter((order) => !webOrderIds.has(order.id)),
        ],
      };
    }
  } catch {
    // Keep the legacy fitter summary orders as a fallback.
  }
  return summary;
}

async function updateFitterWebPurchase(data: unknown, result: "purchased" | "cancelled") {
  const record = (data ?? {}) as Record<string, unknown>;
  const orderId = typeof record.orderId === "string" ? record.orderId : "";
  const summary = await callServerFn(getFitterSummary, data);
  await callServerFn(requesterConfirmWebPurchase, {
    orderId,
    requesterPhone: summary.fitter.whatsapp,
    requesterType: "fitter" as const,
    result,
  });
  return { ok: true };
}

async function submitFitterSmartRequest(data: unknown) {
  const record = (data ?? {}) as Record<string, unknown>;
  const summary = await callServerFn(getFitterSummary, data);
  return callServerFn(submitMissingProductRequest, {
    ...record,
    requesterType: "fitter" as const,
    requesterName: summary.fitter.name || "فيتر",
    requesterPhone: summary.fitter.whatsapp,
    searchScope: "governorate",
  });
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
              return json("api:fitterMobile:summary", { ok: true, result: await getMobileFitterSummary(data) }, data);
            case "updateProfile":
              return json("api:fitterMobile:updateProfile", { ok: true, result: await callServerFn(updateFitterProfile, data) }, data);
            case "updateVisa":
              return json("api:fitterMobile:updateVisa", { ok: true, result: await callServerFn(updateFitterVisa, data) }, data);
            case "browseProducts":
              return json("api:fitterMobile:browseProducts", { ok: true, result: await callServerFn(browseCarProducts, data) }, data);
            case "submitSmartRequest":
              return json("api:fitterMobile:submitSmartRequest", { ok: true, result: await submitFitterSmartRequest(data) }, data);
            case "requestProduct":
              return json("api:fitterMobile:requestProduct", { ok: true, result: await callServerFn(requestFitterProduct, data) }, data);
            case "confirmReceipt":
              return json("api:fitterMobile:confirmReceipt", { ok: true, result: await callServerFn(confirmFitterReceipt, data) }, data);
            case "cancelOrder":
              return json("api:fitterMobile:cancelOrder", { ok: true, result: await callServerFn(cancelFitterOrder, data) }, data);
            case "confirmWebPurchase":
              return json("api:fitterMobile:confirmWebPurchase", { ok: true, result: await updateFitterWebPurchase(data, "purchased") }, data);
            case "cancelWebPurchase":
              return json("api:fitterMobile:cancelWebPurchase", { ok: true, result: await updateFitterWebPurchase(data, "cancelled") }, data);
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
