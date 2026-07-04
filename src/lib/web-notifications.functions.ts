import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendEvent,
  authorizeMerchantId,
  eventTime,
  getNumber,
  getProjectedEventById,
  getProjectedEventByPayloadField,
  getString,
  listEvents,
  listProjectedEventsByPayloadFieldPage,
  listProjectedEventsPage,
  normalizePageRequest,
  normalizePhone,
  phoneKey,
  type EventRow,
  type PageRequest,
  type PageResult,
  type ProjectedEventRow,
} from "@/lib/eventStore.server";
import { normalizeGovernorate } from "@/lib/governorates";
import {
  diagnoseServerResult,
  diagnosticIdentity,
  diagnosticSession,
} from "@/lib/egress-diagnostics.server";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";

type WebRole = "merchant" | "requester";
type RequesterType = "customer" | "fitter";
type MerchantStatus = "Available" | "Unavailable" | "Sold" | "Cancelled" | "Pending";
type RequesterStatus = "Purchased" | "Cancelled" | "Pending";
type MediatorContact = { phone: string; city: string };

export type WebOrderNotification = {
  orderId: string;
  sourceContext: string;
  productTitle: string;
  requestDetails: string;
  carMake: string;
  carModel: string;
  imageUrl: string;
  price: number;
  currency: string;
  requesterType: RequesterType;
  requesterName: string;
  requesterPhone: string;
  merchantId: string;
  merchantStoreName: string;
  merchantWhatsapp: string;
  merchantGovernorate: string;
  merchantPhoneVisible: boolean;
  mediatorPhone: string;
  merchantStatus: MerchantStatus;
  requesterStatus: RequesterStatus;
  finalStatus: string;
  createdAt: string;
  updatedAt: string;
  rating?: number;
  ratingComment?: string;
  webHiddenMerchant?: boolean;
  webHiddenRequester?: boolean;
};

const tokenInput = z.object({
  token: z.string().trim().min(20).max(300),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().max(100).optional().or(z.literal("")),
});

const requesterInput = z.object({
  requesterPhone: z.string().trim().min(6).max(40),
  requesterType: z.enum(["customer", "fitter"]),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().max(100).optional().or(z.literal("")),
});

const merchantActionInput = tokenInput.extend({
  orderId: z.string().trim().min(1).max(120),
});

const merchantSaleInput = merchantActionInput.extend({
  result: z.enum(["sold", "cancelled"]),
});

const requesterActionInput = requesterInput.extend({
  orderId: z.string().trim().min(1).max(120),
  result: z.enum(["purchased", "cancelled"]),
});

const clearInput = z.object({
  orderId: z.string().trim().min(1).max(120),
  role: z.enum(["merchant", "requester"]),
  token: z.string().trim().min(20).max(300).optional(),
  requesterPhone: z.string().trim().min(6).max(40).optional(),
  requesterType: z.enum(["customer", "fitter"]).optional(),
});

const clearBulkInput = z.object({
  orderIds: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
  role: z.enum(["merchant", "requester"]),
  token: z.string().trim().min(20).max(300).optional(),
  requesterPhone: z.string().trim().min(6).max(40).optional(),
  requesterType: z.enum(["customer", "fitter"]).optional(),
});

const ratingInput = requesterInput.extend({
  orderId: z.string().trim().min(1).max(120),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional().or(z.literal("")),
});

function toWhatsAppRecipient(phone: string) {
  return normalizePhone(phone).replace(/^\+/, "");
}

function merchantIdentity(row: EventRow) {
  return getString(row.payload?.merchantId) || row.id;
}

function orderIdentity(row: EventRow) {
  return getString(row.payload?.orderId) || row.id;
}

function statusFor(merchantStatus: string, requesterStatus: string) {
  if (merchantStatus === "Sold" && requesterStatus === "Purchased") return "completed";
  if (merchantStatus === "Cancelled" && requesterStatus === "Cancelled") return "cancelled";
  if (
    (merchantStatus === "Sold" && requesterStatus === "Cancelled") ||
    (merchantStatus === "Cancelled" && requesterStatus === "Purchased")
  ) {
    return "review";
  }
  if (
    merchantStatus === "Sold" ||
    merchantStatus === "Cancelled" ||
    requesterStatus === "Purchased" ||
    requesterStatus === "Cancelled"
  ) {
    return "pending_review";
  }
  if (merchantStatus === "Available") return "available";
  if (merchantStatus === "Unavailable") return "unavailable";
  return "pending";
}

function normalizeMerchantStatus(value: string): MerchantStatus {
  if (value === "Available" || value === "Unavailable" || value === "Sold" || value === "Cancelled") return value;
  return "Pending";
}

function normalizeRequesterStatus(value: string): RequesterStatus {
  if (value === "Purchased" || value === "Cancelled") return value;
  return "Pending";
}

function normalizeMediatorContacts(values: unknown): MediatorContact[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const contacts: MediatorContact[] = [];
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    const phone = getString(record.phone);
    const city = getString(record.city);
    const key = phoneKey(phone);
    if (!phone || !key || seen.has(key)) continue;
    seen.add(key);
    contacts.push({ phone, city });
  }
  return contacts;
}

function normalizeMediatorPhones(values: unknown[]) {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    if (typeof value !== "string") return false;
    const phone = value.trim();
    const key = phoneKey(phone);
    if (!phone || !key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function latestMediatorContacts() {
  const rows = await listEvents("botly_settings", 20);
  for (const row of rows) {
    const contacts = normalizeMediatorContacts(row.payload?.mediatorContacts);
    if (contacts.length > 0) return contacts;
    const storedPhones = Array.isArray(row.payload?.mediatorPhones) ? row.payload.mediatorPhones : [];
    const phones = normalizeMediatorPhones([
      ...storedPhones,
      getString(row.payload?.mediatorPhone),
    ]);
    if (phones.length > 0) return phones.map((phone) => ({ phone, city: "" }));
  }
  return [];
}

async function merchantPhoneVisibilityForOrders(
  orders: WebOrderNotification[],
) {
  const visibility = new Map<string, boolean>();
  const projection = [
    "merchant_id:payload->>merchantId",
    "whatsapp:payload->>whatsapp",
    "whatsapp_normalized:payload->>whatsappNormalized",
    "show_phone:payload->>showPhoneToRequesters",
  ].join(",");
  const unique = new Map<string, { id: string; phone: string }>();
  for (const order of orders) {
    const key = order.merchantId || phoneKey(order.merchantWhatsapp);
    if (key && !unique.has(key)) {
      unique.set(key, { id: order.merchantId, phone: order.merchantWhatsapp });
    }
  }
  const rows = await Promise.all(
    [...unique.values()].map(async ({ id, phone }) => {
      let row = id
        ? await getProjectedEventByPayloadField(
            "botly_merchant",
            "merchantId",
            id,
            projection,
          )
        : null;
      if (!row && id) row = await getProjectedEventById("botly_merchant", id, projection);
      if (!row && phone) {
        row = await getProjectedEventByPayloadField(
          "botly_merchant",
          "whatsappNormalized",
          normalizePhone(phone),
          projection,
        );
      }
      if (!row && phone) {
        row = await getProjectedEventByPayloadField(
          "botly_merchant",
          "whatsapp",
          phone,
          projection,
        );
      }
      return row;
    }),
  );
  for (const row of rows) {
    if (!row) continue;
    const id = getString(row.merchant_id) || row.id;
    const whatsapp = phoneKey(
      getString(row.whatsapp_normalized) || getString(row.whatsapp),
    );
    const enabled = getString(row.show_phone) === "true";
    if (id) visibility.set(id, enabled);
    if (whatsapp) visibility.set(whatsapp, enabled);
  }
  return visibility;
}

function mediatorPhoneForGovernorate(
  storedPhone: string,
  contacts: MediatorContact[],
  governorate: string,
) {
  if (storedPhone) return storedPhone;
  const wanted = normalizeGovernorate(governorate);
  const match = contacts.find((contact) => normalizeGovernorate(contact.city) === wanted);
  return match?.phone ?? contacts[0]?.phone ?? "";
}

function mergeLatestOrders(rows: EventRow[]) {
  const orders = new Map<string, { payload: Record<string, unknown>; createdAt: string; updatedAt: string }>();
  for (const row of [...rows].reverse()) {
    const orderId = orderIdentity(row);
    if (!orderId) continue;
    const previous = orders.get(orderId);
    orders.set(orderId, {
      payload: { ...(previous?.payload ?? {}), ...(row.payload ?? {}), orderId },
      createdAt: previous?.createdAt || getString(row.payload?.createdAt) || eventTime(row),
      updatedAt: getString(row.payload?.eventAt) || getString(row.payload?.updatedAt) || eventTime(row),
    });
  }
  return [...orders.values()];
}

function toNotification(order: { payload: Record<string, unknown>; createdAt: string; updatedAt: string }) {
  const p = order.payload;
  const orderId = getString(p.orderId);
  const rawImageUrl = getString(p.imageUrl);
  const merchantStatus = normalizeMerchantStatus(getString(p.merchantStatus));
  const requesterStatus = normalizeRequesterStatus(getString(p.requesterStatus));
  const requesterType = resolveRequesterType(p);
  const requesterPhone = resolveRequesterPhone(p, requesterType);
  const requesterName =
    requesterType === "fitter"
      ? getString(p.requesterName) || getString(p.fitterName)
      : getString(p.requesterName) || getString(p.customerName);
  return {
    orderId,
    sourceContext: getString(p.sourceContext),
    productTitle: getString(p.productTitle) || getString(p.title) || "منتج",
    requestDetails: getString(p.requestDetails),
    carMake: getString(p.carMake),
    carModel: getString(p.carModel),
    imageUrl: /^data:image\//i.test(rawImageUrl)
      ? `/api/missing-product-image/${encodeURIComponent(orderId)}`
      : rawImageUrl,
    price:
      getNumber(p.finalPrice) ??
      getNumber(p.price) ??
      getNumber(p.productPrice) ??
      getNumber(p.currentPrice) ??
      0,
    currency: getString(p.currency) || "IQD",
    requesterType,
    requesterName,
    requesterPhone,
    merchantId: getString(p.merchantId),
    merchantStoreName: getString(p.merchantStoreName) || getString(p.storeName),
    merchantWhatsapp: getString(p.merchantWhatsapp) || getString(p.whatsapp),
    merchantGovernorate:
      getString(p.merchantGovernorate) ||
      getString(p.merchantCity) ||
      getString(p.customerGovernorate) ||
      getString(p.requesterGovernorate),
    merchantPhoneVisible: p.merchantPhoneVisible === true,
    mediatorPhone: getString(p.mediatorPhone),
    merchantStatus,
    requesterStatus,
    finalStatus: getString(p.finalStatus) || getString(p.status) || statusFor(merchantStatus, requesterStatus),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    rating: getNumber(p.merchantRating),
    ratingComment: getString(p.merchantRatingComment) || undefined,
    webHiddenMerchant: p.webHiddenMerchant === true,
    webHiddenRequester: p.webHiddenRequester === true,
  } satisfies WebOrderNotification;
}

function resolveRequesterType(payload: Record<string, unknown>): RequesterType {
  const explicitType = getString(payload.requesterType);
  if (explicitType === "customer" || explicitType === "fitter") return explicitType;

  const sourceContext = getString(payload.sourceContext);
  if (sourceContext === "fitter_site") return "fitter";
  if (sourceContext === "customer_site") return "customer";

  const hasFitterOnlyFields =
    Boolean(getString(payload.fitterWhatsapp) || getString(payload.fitterOrderId)) &&
    !(getString(payload.customerPhone) || getString(payload.customerNumber));
  return hasFitterOnlyFields ? "fitter" : "customer";
}

function resolveRequesterPhone(payload: Record<string, unknown>, requesterType: RequesterType) {
  const requesterPhone = getString(payload.requesterPhone);
  if (requesterPhone) return requesterPhone;
  if (requesterType === "fitter") return getString(payload.fitterWhatsapp);
  return getString(payload.customerPhone) || getString(payload.customerNumber);
}

const orderProjectionFields = [
  ["orderId", "order_id", "text"],
  ["createdAt", "created_at_value", "text"],
  ["eventAt", "event_at", "text"],
  ["updatedAt", "updated_at", "text"],
  ["sourceContext", "source_context", "text"],
  ["productTitle", "product_title", "text"],
  ["title", "title", "text"],
  ["requestDetails", "request_details", "text"],
  ["carMake", "car_make", "text"],
  ["carModel", "car_model", "text"],
  ["finalPrice", "final_price", "json"],
  ["price", "price", "json"],
  ["productPrice", "product_price", "json"],
  ["currentPrice", "current_price", "json"],
  ["currency", "currency", "text"],
  ["requesterType", "requester_type", "text"],
  ["requesterName", "requester_name", "text"],
  ["fitterName", "fitter_name", "text"],
  ["customerName", "customer_name", "text"],
  ["requesterPhone", "requester_phone", "text"],
  ["fitterWhatsapp", "fitter_whatsapp", "text"],
  ["fitterOrderId", "fitter_order_id", "text"],
  ["customerPhone", "customer_phone", "text"],
  ["customerNumber", "customer_number", "text"],
  ["merchantId", "merchant_id", "text"],
  ["merchantStoreName", "merchant_store_name", "text"],
  ["storeName", "store_name", "text"],
  ["merchantWhatsapp", "merchant_whatsapp", "text"],
  ["whatsapp", "whatsapp", "text"],
  ["merchantGovernorate", "merchant_governorate", "text"],
  ["merchantCity", "merchant_city", "text"],
  ["customerGovernorate", "customer_governorate", "text"],
  ["requesterGovernorate", "requester_governorate", "text"],
  ["merchantPhoneVisible", "merchant_phone_visible", "json"],
  ["mediatorPhone", "mediator_phone", "text"],
  ["merchantStatus", "merchant_status", "text"],
  ["requesterStatus", "requester_status", "text"],
  ["finalStatus", "final_status", "text"],
  ["status", "status", "text"],
  ["merchantRating", "merchant_rating", "json"],
  ["merchantRatingComment", "merchant_rating_comment", "text"],
  ["webHiddenMerchant", "web_hidden_merchant", "json"],
  ["webHiddenRequester", "web_hidden_requester", "json"],
] as const;

const orderNotificationProjection = orderProjectionFields
  .map(([payloadKey, alias, kind]) =>
    `${alias}:payload->${kind === "text" ? ">" : ""}${payloadKey}`,
  )
  .join(",");

function projectedOrderRow(row: ProjectedEventRow): EventRow {
  const payload: Record<string, unknown> = {};
  for (const [payloadKey, alias] of orderProjectionFields) {
    const value = row[alias];
    if (value !== null && value !== undefined && value !== "") payload[payloadKey] = value;
  }
  return {
    id: row.id,
    created_at: row.created_at,
    received_at: row.received_at,
    payload,
  };
}

function projectedOrderPage(page: PageResult<ProjectedEventRow>): PageResult<EventRow> {
  return { ...page, items: page.items.map(projectedOrderRow) };
}

async function listProjectedOrderPage(request: PageRequest) {
  return projectedOrderPage(
    await listProjectedEventsPage(
      "botly_order",
      orderNotificationProjection,
      request,
    ),
  );
}

async function listProjectedOrderFieldPage(
  field: string,
  value: string,
  request: PageRequest,
) {
  return projectedOrderPage(
    await listProjectedEventsByPayloadFieldPage(
      "botly_order",
      field,
      value,
      orderNotificationProjection,
      request,
    ),
  );
}

function uniqueEventRows(groups: EventRow[][]) {
  const rows = new Map<string, EventRow>();
  for (const group of groups) {
    for (const row of group) rows.set(row.id, row);
  }
  return [...rows.values()];
}

async function latestOrders(orderRows?: EventRow[]) {
  const [rows, mediatorContacts] = await Promise.all([
    orderRows
      ? Promise.resolve(orderRows)
      : listProjectedOrderPage({ limit: 100 }).then((page) => page.items),
    latestMediatorContacts(),
  ]);
  const orders = mergeLatestOrders(rows)
    .map(toNotification)
    .filter((order) => order.orderId && (order.merchantId || order.merchantWhatsapp || order.requesterPhone));
  const merchantVisibility = await merchantPhoneVisibilityForOrders(orders);
  return orders
    .map((order) => ({
      ...order,
      merchantPhoneVisible:
        merchantVisibility.get(order.merchantId) ??
        merchantVisibility.get(phoneKey(order.merchantWhatsapp)) ??
        order.merchantPhoneVisible,
      mediatorPhone: mediatorPhoneForGovernorate(
        order.mediatorPhone,
        mediatorContacts,
        order.merchantGovernorate,
      ),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function requesterOrderRows(
  requesterPhone: string,
  requesterType: RequesterType,
  request: PageRequest,
) {
  const direct = await listProjectedOrderFieldPage(
    "requesterPhone",
    requesterPhone,
    request,
  );
  if (direct.items.length > 0) return direct;

  const normalized = normalizePhone(requesterPhone);
  if (normalized && normalized !== requesterPhone) {
    const normalizedRows = await listProjectedOrderFieldPage(
      "requesterPhone",
      normalized,
      request,
    );
    if (normalizedRows.items.length > 0) return normalizedRows;
  }

  const legacyFields =
    requesterType === "fitter"
      ? ["fitterWhatsapp"]
      : ["customerPhone", "customerNumber"];
  const legacyPages = await Promise.all(
    legacyFields.map((field) =>
      listProjectedOrderFieldPage(field, requesterPhone, request),
    ),
  );
  const scoped = uniqueEventRows(legacyPages.map((page) => page.items));
  if (scoped.length > 0) {
    return { ...legacyPages[0], items: scoped.slice(0, legacyPages[0].limit) };
  }
  return listProjectedOrderPage(request);
}

async function merchantOrderRows(
  merchant: { id: string; whatsapp: string },
  request: PageRequest,
) {
  const byId = await listProjectedOrderFieldPage(
    "merchantId",
    merchant.id,
    request,
  );
  if (byId.items.length > 0) return byId;

  if (merchant.whatsapp) {
    const byPhone = await listProjectedOrderFieldPage(
      "merchantWhatsapp",
      merchant.whatsapp,
      request,
    );
    if (byPhone.items.length > 0) return byPhone;
  }
  return listProjectedOrderPage(request);
}

async function merchantProfile(merchantId: string) {
  const projection = [
    "store_name:payload->>storeName",
    "whatsapp:payload->>whatsapp",
    "whatsapp_normalized:payload->>whatsappNormalized",
  ].join(",");
  const row =
    await getProjectedEventByPayloadField(
    "botly_merchant",
    "merchantId",
    merchantId,
    projection,
  ) ?? await getProjectedEventById("botly_merchant", merchantId, projection);
  return {
    id: merchantId,
    storeName: getString(row?.store_name),
    whatsapp: getString(row?.whatsapp_normalized) || getString(row?.whatsapp),
  };
}

function matchesMerchant(order: WebOrderNotification, merchant: { id: string; whatsapp: string }) {
  return (
    order.merchantId === merchant.id ||
    (Boolean(order.merchantWhatsapp) && phoneKey(order.merchantWhatsapp) === phoneKey(merchant.whatsapp))
  );
}

function matchesRequester(order: WebOrderNotification, requesterPhone: string, requesterType: RequesterType) {
  const orderPhoneKey = phoneKey(order.requesterPhone);
  const requesterPhoneKey = phoneKey(requesterPhone);
  return Boolean(orderPhoneKey && requesterPhoneKey) && order.requesterType === requesterType && orderPhoneKey === requesterPhoneKey;
}

async function currentOrder(orderId: string) {
  const rows = (
    await listProjectedOrderFieldPage("orderId", orderId, { limit: 100 })
  ).items;
  const order = (await latestOrders(rows.length > 0 ? rows : undefined)).find(
    (item) => item.orderId === orderId,
  );
  if (!order) throw new Error("لم يتم العثور على الطلب.");
  return order;
}

async function appendOrderUpdate(
  order: WebOrderNotification,
  updates: Record<string, unknown>,
  eventName: string,
) {
  const now = new Date().toISOString();
  await appendEvent("botly_order", {
    ...order,
    ...updates,
    orderId: order.orderId,
    eventName,
    status: getString(updates.finalStatus) || order.finalStatus,
    updatedAt: now,
    eventAt: now,
  });
}

async function mediatorPhonesForOrder(order: WebOrderNotification) {
  const contacts = await latestMediatorContacts();
  const phones = new Set<string>();
  const scopedPhone = mediatorPhoneForGovernorate(order.mediatorPhone, contacts, order.merchantGovernorate);
  if (scopedPhone) phones.add(scopedPhone);
  if (phones.size === 0 && order.mediatorPhone) phones.add(order.mediatorPhone);
  return [...phones];
}

async function notifyMediator(order: WebOrderNotification, title: string) {
  const phones = await mediatorPhonesForOrder(order);
  if (phones.length === 0) return;
  const body = [
    title,
    "",
    `اسم المنتج: ${order.productTitle}`,
    `نوع السيارة: ${order.carMake || "غير محدد"}`,
    `موديل السيارة: ${order.carModel || "غير محدد"}`,
    `مقدم الطلب: ${order.requesterName || "غير محدد"} / ${order.requesterPhone || "غير متوفر"}`,
    `التاجر: ${order.merchantStoreName || "غير محدد"} / ${order.merchantWhatsapp || "غير متوفر"}`,
    `حالة التاجر: ${order.merchantStatus}`,
    `حالة الزبون/الفيتر: ${order.requesterStatus}`,
    `الحالة النهائية: ${order.finalStatus}`,
  ].join("\n");
  await Promise.allSettled(
    phones.map((phone) => sendWhatsAppText(toWhatsAppRecipient(phone), body)),
  );
}

export const listMerchantWebNotifications = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    const merchantId = await authorizeMerchantId(data.token);
    const merchant = await merchantProfile(merchantId);
    const pagination = normalizePageRequest(data);
    const orderPage = await merchantOrderRows(merchant, pagination);
    const matches = (await latestOrders(orderPage.items)).filter(
      (order) =>
        matchesMerchant(order, merchant) &&
        !order.webHiddenMerchant &&
        order.finalStatus !== "web_hidden_merchant",
    );
    return diagnoseServerResult(
      "api:listMerchantWebNotifications",
      { ...orderPage, items: matches.slice(0, pagination.limit) },
      {
        user: diagnosticIdentity(merchantId),
        session: diagnosticSession(data.token),
        params: pagination,
      },
    );
  });

export const listRequesterWebNotifications = createServerFn({ method: "POST" })
  .inputValidator((d) => requesterInput.parse(d))
  .handler(async ({ data }) => {
    const pagination = normalizePageRequest(data);
    const orderPage = await requesterOrderRows(
      data.requesterPhone,
      data.requesterType,
      pagination,
    );
    const matches = (await latestOrders(orderPage.items)).filter(
      (order) =>
        matchesRequester(order, data.requesterPhone, data.requesterType) &&
        !(
          order.sourceContext === "missing_product_request" &&
          !order.merchantId &&
          !order.merchantWhatsapp
        ) &&
        !order.webHiddenRequester &&
        order.finalStatus !== "web_hidden_requester",
    );
    return diagnoseServerResult(
      "api:listRequesterWebNotifications",
      { ...orderPage, items: matches.slice(0, pagination.limit) },
      {
        user: diagnosticIdentity(data.requesterPhone),
        session: data.requesterType,
        params: pagination,
      },
    );
  });

export const merchantMarkProductAvailable = createServerFn({ method: "POST" })
  .inputValidator((d) => merchantActionInput.parse(d))
  .handler(async ({ data }) => {
    const merchantId = await authorizeMerchantId(data.token);
    const merchant = await merchantProfile(merchantId);
    const order = await currentOrder(data.orderId);
    if (!matchesMerchant(order, merchant)) throw new Error("لا تملك صلاحية تعديل هذا الطلب.");
    if (order.merchantStatus === "Available") return { ok: true };
    const finalStatus = statusFor("Available", order.requesterStatus);
    await appendOrderUpdate(
      order,
      { merchantStatus: "Available", requesterStatus: order.requesterStatus, finalStatus },
      "web_merchant_available",
    );
    await notifyMediator({ ...order, merchantStatus: "Available", finalStatus }, "التاجر أكد توفر المنتج من الموقع");
    return { ok: true };
  });

export const merchantMarkProductUnavailable = createServerFn({ method: "POST" })
  .inputValidator((d) => merchantActionInput.parse(d))
  .handler(async ({ data }) => {
    const merchantId = await authorizeMerchantId(data.token);
    const merchant = await merchantProfile(merchantId);
    const order = await currentOrder(data.orderId);
    if (!matchesMerchant(order, merchant)) throw new Error("لا تملك صلاحية تعديل هذا الطلب.");
    if (order.merchantStatus === "Unavailable") return { ok: true };
    const finalStatus = statusFor("Unavailable", order.requesterStatus);
    await appendOrderUpdate(
      order,
      { merchantStatus: "Unavailable", requesterStatus: order.requesterStatus, finalStatus },
      "web_merchant_unavailable",
    );
    await notifyMediator(
      { ...order, merchantStatus: "Unavailable", finalStatus },
      "التاجر أكد عدم توفر المنتج من الموقع",
    );
    return { ok: true };
  });

export const merchantConfirmWebSale = createServerFn({ method: "POST" })
  .inputValidator((d) => merchantSaleInput.parse(d))
  .handler(async ({ data }) => {
    const merchantId = await authorizeMerchantId(data.token);
    const merchant = await merchantProfile(merchantId);
    const order = await currentOrder(data.orderId);
    if (!matchesMerchant(order, merchant)) throw new Error("لا تملك صلاحية تعديل هذا الطلب.");
    const merchantStatus: MerchantStatus = data.result === "sold" ? "Sold" : "Cancelled";
    if (order.merchantStatus === merchantStatus) return { ok: true };
    const finalStatus = statusFor(merchantStatus, order.requesterStatus);
    await appendOrderUpdate(
      order,
      { merchantStatus, requesterStatus: order.requesterStatus, finalStatus },
      data.result === "sold" ? "web_merchant_sold" : "web_merchant_cancelled",
    );
    await notifyMediator(
      { ...order, merchantStatus, finalStatus },
      data.result === "sold" ? "التاجر أكد بيع المنتج من الموقع" : "التاجر ألغى الطلب من الموقع",
    );
    return { ok: true };
  });

export const requesterConfirmWebPurchase = createServerFn({ method: "POST" })
  .inputValidator((d) => requesterActionInput.parse(d))
  .handler(async ({ data }) => {
    const order = await currentOrder(data.orderId);
    if (!matchesRequester(order, data.requesterPhone, data.requesterType)) {
      throw new Error("لا تملك صلاحية تعديل هذا الطلب.");
    }
    const requesterStatus: RequesterStatus = data.result === "purchased" ? "Purchased" : "Cancelled";
    if (order.requesterStatus === requesterStatus) return { ok: true };
    const finalStatus = statusFor(order.merchantStatus, requesterStatus);
    const purchaseNotice =
      requesterStatus === "Purchased"
        ? { webHiddenMerchant: false, merchantRequesterPurchaseNoticeAt: new Date().toISOString() }
        : {};
    await appendOrderUpdate(
      order,
      {
        merchantStatus: order.merchantStatus,
        requesterStatus,
        finalStatus,
        ...purchaseNotice,
      },
      data.result === "purchased" ? "web_requester_purchased" : "web_requester_cancelled",
    );
    await notifyMediator(
      { ...order, requesterStatus, finalStatus },
      data.result === "purchased" ? "الزبون/الفيتر أكد الشراء من الموقع" : "الزبون/الفيتر ألغى الطلب من الموقع",
    );
    return { ok: true };
  });

export const clearWebOrderNotification = createServerFn({ method: "POST" })
  .inputValidator((d) => clearInput.parse(d))
  .handler(async ({ data }) => {
    const order = await currentOrder(data.orderId);
    if (data.role === "merchant") {
      if (!data.token) throw new Error("انتهت الجلسة. سجل دخول مرة ثانية.");
      const merchantId = await authorizeMerchantId(data.token);
      const merchant = await merchantProfile(merchantId);
      if (!matchesMerchant(order, merchant)) throw new Error("لا تملك صلاحية تعديل هذا الطلب.");
      await appendOrderUpdate(order, { webHiddenMerchant: true }, "web_notification_cleared");
    } else {
      if (!data.requesterPhone || !data.requesterType) throw new Error("بيانات الحساب غير مكتملة.");
      if (!matchesRequester(order, data.requesterPhone, data.requesterType)) {
        throw new Error("لا تملك صلاحية تعديل هذا الطلب.");
      }
      await appendOrderUpdate(order, { webHiddenRequester: true }, "web_notification_cleared");
    }
    return { ok: true };
  });

export const clearWebOrderNotificationsBulk = createServerFn({ method: "POST" })
  .inputValidator((d) => clearBulkInput.parse(d))
  .handler(async ({ data }) => {
    const requestedIds = new Set(data.orderIds);
    const orders = await Promise.all(data.orderIds.map((orderId) => currentOrder(orderId)));
    if (data.role === "merchant") {
      if (!data.token) throw new Error("انتهت الجلسة. سجل دخول مرة ثانية.");
      const merchantId = await authorizeMerchantId(data.token);
      const merchant = await merchantProfile(merchantId);
      const allowed = orders.filter((order) => matchesMerchant(order, merchant));
      if (allowed.length !== requestedIds.size) throw new Error("لا تملك صلاحية مسح بعض الطلبات.");
      await Promise.all(
        allowed.map((order) => appendOrderUpdate(order, { webHiddenMerchant: true }, "web_notification_cleared")),
      );
      return { ok: true, clearedCount: allowed.length };
    }

    if (!data.requesterPhone || !data.requesterType) throw new Error("بيانات الحساب غير مكتملة.");
    const allowed = orders.filter((order) => matchesRequester(order, data.requesterPhone!, data.requesterType!));
    if (allowed.length !== requestedIds.size) throw new Error("لا تملك صلاحية مسح بعض الطلبات.");
    await Promise.all(
      allowed.map((order) => appendOrderUpdate(order, { webHiddenRequester: true }, "web_notification_cleared")),
    );
    return { ok: true, clearedCount: allowed.length };
  });

export const rateMerchantFromWeb = createServerFn({ method: "POST" })
  .inputValidator((d) => ratingInput.parse(d))
  .handler(async ({ data }) => {
    const order = await currentOrder(data.orderId);
    if (!matchesRequester(order, data.requesterPhone, data.requesterType)) {
      throw new Error("لا تملك صلاحية تقييم هذا الطلب.");
    }
    if (!(order.merchantStatus === "Sold" && order.requesterStatus === "Purchased")) {
      throw new Error("يمكن تقييم التاجر بعد اكتمال عملية الشراء فقط.");
    }
    await appendOrderUpdate(
      order,
      {
        merchantRating: data.rating,
        merchantRatingComment: data.comment || "",
        merchantRatedAt: new Date().toISOString(),
        merchantRatedByType: data.requesterType,
      },
      "web_merchant_rated",
    );
    return { ok: true };
  });
