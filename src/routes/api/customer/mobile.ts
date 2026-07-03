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
import {
  appendEvent,
  getString,
  listEvents,
  listEventsByPayloadField,
  listEventsByPayloadFieldPage,
  normalizePageRequest,
  normalizePhone,
  type EventRow,
} from "@/lib/eventStore.server";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";

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
  | "listOrders"
  | "updateOrderStatus";

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
  let eventPage = await listEventsByPayloadFieldPage(
    "botly_order",
    "requesterPhone",
    phone,
    pagination,
  );
  if (eventPage.items.length === 0) {
    eventPage = await listEventsByPayloadFieldPage(
      "botly_order",
      "customerPhone",
      phone,
      pagination,
    );
  }
  const rows = eventPage.items;
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const payload = row.payload ?? {};
    const orderPhone =
      getString(payload.customerPhone) ||
      getString(payload.customerNumber) ||
      getString(payload.phone);
    if (phoneKey(orderPhone) !== key) continue;
    const orderId = getString(payload.orderId) || row.id;
    const existing = latest.get(orderId) ?? { id: orderId };
    latest.set(orderId, {
      ...existing,
      productTitle: getString(existing.productTitle) || getString(payload.productTitle),
      price: existing.price ?? payload.price,
      currency: getString(existing.currency) || getString(payload.currency) || "IQD",
      status:
        getString(existing.status) ||
        getString(payload.status) ||
        getString(payload.merchantAvailabilityStatus) ||
        "requested",
      merchantAvailable: existing.merchantAvailable ?? payload.merchantAvailable,
      createdAt:
        getString(existing.createdAt) ||
        getString(payload.createdAt) ||
        row.created_at ||
        row.received_at,
      updatedAt:
        getString(existing.updatedAt) ||
        getString(payload.updatedAt) ||
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
            case "updateOrderStatus":
              return json({ ok: true, result: await updateCustomerOrderStatus(data) });
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
