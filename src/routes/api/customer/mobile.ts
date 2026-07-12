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
import { submitMissingProductRequest } from "@/lib/missing-product.functions";
import {
  appendEvent,
  getString,
  listEvents,
  listEventsByPayloadField,
  listProjectedEventsByPayloadFieldPage,
  normalizePageRequest,
  normalizePhone,
  type EventRow,
} from "@/lib/eventStore.server";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";
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
  | "updateProfile"
  | "browseProducts"
  | "submitOrder"
  | "submitSmartRequest"
  | "catalogue"
  | "mediator"
  | "listOrders"
  | "updateOrderStatus";

function json(route: string, data: unknown, requestData: unknown, init?: ResponseInit) {
  const body = JSON.stringify(data);
  const input = (requestData ?? {}) as Record<string, unknown>;
  return diagnosticResponse(
    route,
    body,
    {
      ...init,
      headers: { ...jsonHeaders, ...(init?.headers ?? {}) },
    },
    {
      payload: data,
      responseBytes: payloadBytes(body),
      user: diagnosticIdentity(
        getString(input.customerPhone) || getString(input.whatsapp),
      ),
      session: diagnosticSession(getString(input.token)),
      params: {
        limit: typeof input.limit === "number" ? input.limit : undefined,
        page: typeof input.page === "number" ? input.page : undefined,
        cursor: getString(input.cursor),
      },
    },
  );
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

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toWhatsAppRecipient(phone: string) {
  return normalizePhone(phone).replace(/^\+/, "");
}

function orderTime(row: EventRow) {
  return row.created_at || row.received_at || "";
}

async function listCustomerOrders(data: unknown) {
  const input = data as Record<string, unknown> | null;
  const phone = getString(input?.customerPhone);
  const key = phoneKey(phone);
  const pagination = normalizePageRequest({
    page: typeof input?.page === "number" ? input.page : undefined,
    limit: typeof input?.limit === "number" ? input.limit : undefined,
    cursor: getString(input?.cursor),
  });
  if (!key) {
    return { items: [], ...pagination, nextCursor: null, hasMore: false };
  }
  const projection = [
    "order_id:payload->>orderId",
    "customer_phone:payload->>customerPhone",
    "customer_number:payload->>customerNumber",
    "phone:payload->>phone",
    "product_title:payload->>productTitle",
    "price:payload->price",
    "currency:payload->>currency",
    "status:payload->>status",
    "availability_status:payload->>merchantAvailabilityStatus",
    "merchant_available:payload->merchantAvailable",
    "created_at_value:payload->>createdAt",
    "updated_at_value:payload->>updatedAt",
  ].join(",");
  let eventPage = await listProjectedEventsByPayloadFieldPage(
    "botly_order",
    "requesterPhone",
    phone,
    projection,
    pagination,
  );
  if (eventPage.items.length === 0) {
    eventPage = await listProjectedEventsByPayloadFieldPage(
      "botly_order",
      "customerPhone",
      phone,
      projection,
      pagination,
    );
  }
  const rows = eventPage.items;
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const orderPhone =
      getString(row.customer_phone) ||
      getString(row.customer_number) ||
      getString(row.phone);
    if (phoneKey(orderPhone) !== key) continue;
    const orderId = getString(row.order_id) || row.id;
    const existing = latest.get(orderId) ?? { id: orderId };
    latest.set(orderId, {
      ...existing,
      productTitle: getString(existing.productTitle) || getString(row.product_title),
      price: existing.price ?? row.price,
      currency: getString(existing.currency) || getString(row.currency) || "IQD",
      status:
        getString(existing.status) ||
        getString(row.status) ||
        getString(row.availability_status) ||
        "requested",
      merchantAvailable: existing.merchantAvailable ?? row.merchant_available,
      createdAt:
        getString(existing.createdAt) ||
        getString(row.created_at_value) ||
        row.created_at ||
        row.received_at,
      updatedAt:
        getString(existing.updatedAt) ||
        getString(row.updated_at_value) ||
        row.created_at ||
        row.received_at,
    });
  }
  return {
    items: [...latest.values()].slice(0, pagination.limit),
    page: pagination.page,
    limit: pagination.limit,
    nextCursor: eventPage.nextCursor,
    hasMore: eventPage.hasMore,
  };
}

async function findCustomerOrder(orderId: string, customerPhone: string) {
  const key = phoneKey(customerPhone);
  const rows = await listEventsByPayloadField("botly_order", "orderId", orderId, 100);
  const matches = rows.filter((row) => {
    const payload = row.payload ?? {};
    const rowOrderId = getString(payload.orderId) || row.id;
    const rowPhone =
      getString(payload.customerPhone) ||
      getString(payload.customerNumber) ||
      getString(payload.phone);
    return rowOrderId === orderId && phoneKey(rowPhone) === key;
  });
  const merged: Record<string, unknown> = { orderId };
  for (const row of matches) {
    const payload = row.payload ?? {};
    for (const [field, value] of Object.entries(payload)) {
      if (merged[field] === undefined || merged[field] === "") merged[field] = value;
    }
    if (!merged.createdAt) merged.createdAt = getString(payload.createdAt) || orderTime(row);
    if (!merged.updatedAt) merged.updatedAt = getString(payload.updatedAt) || orderTime(row);
  }
  return matches.length > 0 ? merged : null;
}

function mediatorContactsFromPayload(payload: Record<string, unknown>) {
  const contacts = Array.isArray(payload.mediatorContacts) ? payload.mediatorContacts : [];
  return contacts
    .map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({ phone: getString(item.phone), city: getString(item.city) }))
    .filter((item) => item.phone);
}

const ALL_GOVERNORATES_MEDIATOR = "كل المحافظات";

async function readMediatorPhonesForGovernorate(governorate: string) {
  const settingsRows = await listEvents("botly_settings").catch(() => [] as EventRow[]);
  for (const row of settingsRows) {
    const contacts = mediatorContactsFromPayload(row.payload ?? {});
    const scoped = contacts.filter(
      (contact) => !governorate || contact.city === governorate || contact.city === ALL_GOVERNORATES_MEDIATOR,
    );
    if (scoped.length > 0) return scoped.map((contact) => contact.phone);
    const phones = stringList(row.payload?.mediatorPhones);
    if (phones.length > 0) return phones;
    const phone = getString(row.payload?.mediatorPhone);
    if (phone) return [phone];
  }
  return [];
}

async function sendCustomerOrderStatusNotifications(args: {
  order: Record<string, unknown>;
  status: string;
}) {
  const order = args.order;
  const statusLabel = args.status === "purchased" ? "تم الشراء" : "تم إلغاء الطلب";
  const productTitle = getString(order.productTitle) || "قطعة";
  const customerName = getString(order.customerName) || "زبون";
  const customerPhone = getString(order.customerPhone) || getString(order.customerNumber);
  const merchantGovernorate = getString(order.merchantGovernorate);
  const merchantStoreName = getString(order.merchantStoreName);
  const merchantWhatsapp = getString(order.merchantWhatsapp);
  const price = order.price;
  const currency = getString(order.currency) || "IQD";

  let mediatorPhones = stringList(order.mediatorPhones);
  if (mediatorPhones.length === 0) {
    mediatorPhones = await readMediatorPhonesForGovernorate(merchantGovernorate);
  }

  const mediatorMessage = [
    `تحديث حالة طلب من تطبيق الزبون: ${statusLabel}`,
    `القطعة: ${productTitle}`,
    price ? `السعر: ${price} ${currency}` : "",
    merchantStoreName ? `التاجر: ${merchantStoreName}` : "",
    merchantGovernorate ? `محافظة التاجر: ${merchantGovernorate}` : "",
    "",
    `الزبون: ${customerName}`,
    `رقم الزبون: ${customerPhone || "-"}`,
  ].filter(Boolean).join("\n");

  const mediatorResults = [];
  for (const phone of mediatorPhones) {
    try {
      const result = await sendWhatsAppText(toWhatsAppRecipient(phone), mediatorMessage);
      mediatorResults.push({ phone, ...result });
    } catch (error) {
      mediatorResults.push({
        phone,
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const merchantResult: unknown = merchantWhatsapp
    ? { ok: false, status: 0, skipped: true, reason: "web_notifications_only" }
    : null;

  return { mediatorPhones, mediatorResults, merchantResult };
}

async function updateCustomerOrderStatus(data: unknown) {
  const record = data as Record<string, unknown> | null;
  const orderId = getString(record?.orderId);
  const customerPhone = getString(record?.customerPhone);
  const status = getString(record?.status);
  if (!orderId || !customerPhone) throw new Error("بيانات الطلب غير مكتملة.");
  if (!["cancelled", "purchased"].includes(status)) throw new Error("حالة الطلب غير صحيحة.");

  const order = await findCustomerOrder(orderId, customerPhone);
  if (!order) throw new Error("لم يتم العثور على الطلب.");
  const notifications = await sendCustomerOrderStatusNotifications({ order, status });

  await appendEvent("botly_order", {
    orderId,
    customerPhone,
    status,
    merchantId: getString(order.merchantId),
    productTitle: getString(order.productTitle),
    price: order.price,
    currency: getString(order.currency) || "IQD",
    merchantGovernorate: getString(order.merchantGovernorate),
    merchantWhatsapp: getString(order.merchantWhatsapp),
    merchantStoreName: getString(order.merchantStoreName),
    customerName: getString(order.customerName),
    customerNumber: getString(order.customerNumber) || customerPhone,
    mediatorPhones: notifications.mediatorPhones,
    customerStatusNotificationResults: notifications,
    updatedAt: new Date().toISOString(),
    updatedBy: "customer_app",
  });
  return { ok: true };
}

export const Route = createFileRoute("/api/customer/mobile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let action: Action | undefined;
        let data: unknown;
        try {
          ({ action, data } = await readBody(request));
          if (!action) return json("api:customerMobile:missingAction", { ok: false, error: "Missing action" }, data, { status: 400 });

          switch (action) {
            case "login":
              return json("api:customerMobile:login", { ok: true, result: await callServerFn(loginCustomer, data) }, data);
            case "signup":
              return json("api:customerMobile:signup", { ok: true, result: await callServerFn(signupCustomer, data) }, data);
            case "updateProfile":
              return json("api:customerMobile:updateProfile", { ok: true, result: await callServerFn(updateCustomerProfile, data) }, data);
            case "browseProducts":
              return json("api:customerMobile:browseProducts", { ok: true, result: await callServerFn(browseCarProducts, data) }, data);
            case "submitOrder":
              return json("api:customerMobile:submitOrder", { ok: true, result: await callServerFn(submitProductOrder, data) }, data);
            case "submitSmartRequest":
              return json("api:customerMobile:submitSmartRequest", { ok: true, result: await callServerFn(submitMissingProductRequest, data) }, data);
            case "catalogue":
              return json("api:customerMobile:catalogue", { ok: true, result: await getEnabledCarCatalogue() }, data);
            case "mediator":
              return json("api:customerMobile:mediator", { ok: true, result: await getMediatorPhone() }, data);
            case "listOrders":
              return json("api:customerMobile:listOrders", { ok: true, result: await listCustomerOrders(data) }, data);
            case "updateOrderStatus":
              return json("api:customerMobile:updateOrderStatus", { ok: true, result: await updateCustomerOrderStatus(data) }, data);
            default:
              return json("api:customerMobile:unknownAction", { ok: false, error: "Unknown action" }, data, { status: 400 });
          }
        } catch (error) {
          return json(
            `api:customerMobile:${action ?? "error"}`,
            { ok: false, error: error instanceof Error ? error.message : "Unexpected server error" },
            data,
            { status: 500 },
          );
        }
      },
    },
  },
});
