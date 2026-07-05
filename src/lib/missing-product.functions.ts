import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendEvent,
  eventTime,
  getString,
  listProjectedEventsByPayloadFieldPage,
  listProjectedEventsPage,
  normalizePhone,
  phoneKey,
  type EventRow,
  type ProjectedEventRow,
} from "@/lib/eventStore.server";
import { normalizeGovernorate } from "@/lib/governorates";

type MissingRequestScope = "governorate" | "all";
type MissingRequesterType = "customer" | "fitter";

const missingProductInput = z.object({
  productName: z.string().trim().min(2).max(160),
  requestDetails: z.string().trim().max(1000).optional().or(z.literal("")),
  carMake: z.string().trim().min(1).max(80),
  carModel: z.string().trim().max(80).optional().or(z.literal("")),
  specialty: z.string().trim().min(1).max(100),
  governorate: z.string().trim().min(1).max(100),
  requesterType: z.enum(["customer", "fitter"]),
  requesterName: z.string().trim().min(1).max(120),
  requesterPhone: z.string().trim().min(6).max(40),
  searchScope: z.enum(["governorate", "all"]),
  imageUrl: z.string().trim().max(4000).optional().or(z.literal("")),
  imageDataUrl: z.string().trim().max(2500000).optional().or(z.literal("")),
});

function sameText(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

type MerchantMatchProfile = {
  id: string;
  storeName: string;
  whatsapp: string;
  governorate: string;
  servesAllGovernorates: boolean;
  carMakes: Set<string>;
  carModels: Set<string>;
  specialties: Set<string>;
};

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function normalizeSpecialty(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه");
  if (/كهرب/.test(normalized)) return "كهربائيات";
  if (/اكسسوار/.test(normalized)) return "إكسسوارات";
  if (/محرك|مكين/.test(normalized)) return "محرك";
  if (/هيكل|بدن/.test(normalized)) return "هيكل وبدن";
  if (/تعليق|توجيه/.test(normalized)) return "تعليق وتوجيه";
  if (/فرامل|بريك/.test(normalized)) return "فرامل";
  if (/تبريد|تكييف|مكيف/.test(normalized)) return "تبريد وتكييف";
  if (/اخرى|عام/.test(normalized)) return "أخرى";
  return value.trim();
}

async function projectedMerchantProfiles() {
  const page = await listProjectedEventsPage(
    "botly_merchant",
    [
      "merchant_id:payload->>merchantId",
      "store_name:payload->>storeName",
      "whatsapp:payload->>whatsapp",
      "whatsapp_normalized:payload->>whatsappNormalized",
      "city:payload->>city",
      "governorate:payload->>governorate",
      "status:payload->>status",
      "is_active:payload->isActive",
      "banned:payload->bannedFromBot",
      "visibility:payload->visibilityEnabled",
      "suspended_at:payload->>suspendedAt",
      "subscription_status:payload->>subscriptionStatus",
      "package_expiry:payload->>packageExpiry",
      "serves_all:payload->servesAllGovernorates",
      "car_makes:payload->carMakes",
      "car_models:payload->carModels",
      "specialties:payload->specialties",
    ].join(","),
    { limit: 100 },
  );
  const seen = new Set<string>();
  return page.items.filter((row) => {
    const id = getString(row.merchant_id) || row.id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function projectedProductFilters() {
  const page = await listProjectedEventsPage(
    "botly_product",
    [
      "product_id:payload->>productId",
      "merchant_id:payload->>merchantId",
      "status:payload->>status",
      "availability:payload->>availability",
      "car_make:payload->>carMake",
      "car_model:payload->>carModel",
      "category:payload->>category",
    ].join(","),
    { limit: 100 },
  );
  const latest = new Map<string, ProjectedEventRow>();
  for (const row of page.items) {
    const id = getString(row.product_id) || row.id;
    if (!latest.has(id)) latest.set(id, row);
  }
  const filters = new Map<string, {
    makes: Set<string>;
    models: Set<string>;
    specialties: Set<string>;
  }>();
  for (const row of latest.values()) {
    if (getString(row.status) !== "active" || getString(row.availability) === "out_of_stock") continue;
    const merchantId = getString(row.merchant_id);
    if (!merchantId) continue;
    const entry = filters.get(merchantId) ?? {
      makes: new Set<string>(),
      models: new Set<string>(),
      specialties: new Set<string>(),
    };
    if (getString(row.car_make)) entry.makes.add(getString(row.car_make));
    if (getString(row.car_model)) entry.models.add(getString(row.car_model));
    if (getString(row.category)) entry.specialties.add(getString(row.category));
    filters.set(merchantId, entry);
  }
  return filters;
}

function projectedMerchantIsInactive(row: ProjectedEventRow) {
  const status = getString(row.status);
  return (
    row.banned === true ||
    getString(row.banned) === "true" ||
    row.visibility === false ||
    getString(row.visibility) === "false" ||
    row.is_active === false ||
    getString(row.is_active) === "false" ||
    (status.length > 0 && status !== "active") ||
    Boolean(getString(row.suspended_at)) ||
    getString(row.subscription_status) === "expired" ||
    (Boolean(getString(row.package_expiry)) &&
      new Date(getString(row.package_expiry)).getTime() < Date.now())
  );
}

async function findMatchingMerchants(args: {
  carMake: string;
  carModel: string;
  specialty: string;
  governorate: string;
  scope: MissingRequestScope;
}): Promise<MerchantMatchProfile[]> {
  const [merchants, derivedFilters] = await Promise.all([
    projectedMerchantProfiles(),
    projectedProductFilters(),
  ]);
  const targets: MerchantMatchProfile[] = [];
  const seenPhones = new Set<string>();
  for (const row of merchants) {
    if (projectedMerchantIsInactive(row)) continue;
    const id = getString(row.merchant_id) || row.id;
    const whatsapp = getString(row.whatsapp_normalized) || getString(row.whatsapp);
    const phone = phoneKey(whatsapp);
    if (!id || !phone || seenPhones.has(phone)) continue;
    const derived = derivedFilters.get(id);
    const carMakes = new Set([...stringArray(row.car_makes), ...(derived?.makes ?? [])]);
    const carModels = new Set([...stringArray(row.car_models), ...(derived?.models ?? [])]);
    const specialties = new Set([
      ...stringArray(row.specialties),
      ...(derived?.specialties ?? []),
    ]);
    if (
      ![...carMakes].some((value) => sameText(value, args.carMake) || value === "عام")
    ) continue;
    if (
      args.carModel &&
      ![...carModels].some((value) => sameText(value, args.carModel) || value === "كل الموديلات")
    ) continue;
    if (
      args.specialty &&
      ![...specialties].some(
        (value) => sameText(normalizeSpecialty(value), normalizeSpecialty(args.specialty)),
      )
    ) continue;
    const governorate = normalizeGovernorate(getString(row.city) || getString(row.governorate));
    const servesAll = row.serves_all === true || getString(row.serves_all) === "true";
    if (
      args.scope === "governorate" &&
      !servesAll &&
      normalizeGovernorate(args.governorate) !== governorate
    ) continue;
    seenPhones.add(phone);
    targets.push({
      id,
      storeName: getString(row.store_name) || "متجر",
      whatsapp,
      governorate,
      servesAllGovernorates: servesAll,
      carMakes,
      carModels,
      specialties,
    });
  }
  return targets;
}

const CUSTOMER_LIMIT_MESSAGE =
  "وصلت للحد اليومي. تگدر ترسل طلبين فقط خلال 24 ساعة حتى نحافظ على جودة الخدمة وعدم إزعاج التجار.";

async function assertCustomerRequestLimit(data: z.infer<typeof missingProductInput>) {
  if (data.requesterType !== "customer") return;
  const variants = [...new Set([data.requesterPhone, normalizePhone(data.requesterPhone)])]
    .filter(Boolean);
  const pages = await Promise.all(
    variants.map((phone) =>
      listProjectedEventsByPayloadFieldPage(
        "botly_order",
        "requesterPhone",
        phone,
        [
          "missing_request_id:payload->>missingRequestId",
          "source_context:payload->>sourceContext",
          "event_name:payload->>eventName",
          "requester_type:payload->>requesterType",
          "created_at_value:payload->>createdAt",
        ].join(","),
        { limit: 100 },
      ),
    ),
  );
  const cutoff = Date.now() - 24 * 60 * 60 * 1_000;
  const requests = new Set<string>();
  for (const row of pages.flatMap((page) => page.items)) {
    if (getString(row.source_context) !== "missing_product_request") continue;
    if (getString(row.event_name) !== "missing_request_created") continue;
    if (getString(row.requester_type) !== "customer") continue;
    const createdAt =
      getString(row.created_at_value) || row.created_at || row.received_at || eventTime(row as EventRow);
    if (new Date(createdAt).getTime() < cutoff) continue;
    requests.add(getString(row.missing_request_id) || row.id);
  }
  if (requests.size >= 2) throw new Error(CUSTOMER_LIMIT_MESSAGE);
}

export const submitMissingProductRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => missingProductInput.parse(d))
  .handler(async ({ data }) => {
    await assertCustomerRequestLimit(data);
    const missingRequestId = crypto.randomUUID();
    const now = new Date().toISOString();
    const publicBase = (process.env.PUBLIC_SITE_URL ?? "https://www.bot-lly.tech").replace(/\/$/, "");
    const deliverableImageUrl =
      data.imageUrl ||
      (data.imageDataUrl ? `${publicBase}/api/missing-product-image/${encodeURIComponent(missingRequestId)}` : "");
    const carModel = data.carModel || "غير محدد";
    const productTitle = data.productName.trim();
    const requestDetails = data.requestDetails?.trim() ?? "";
    const governorate = normalizeGovernorate(data.governorate);
    const targets = await findMatchingMerchants({
      carMake: data.carMake,
      carModel: data.carModel ?? "",
      specialty: data.specialty,
      governorate,
      scope: data.searchScope,
    });

    await appendEvent("botly_order", {
      orderId: missingRequestId,
      missingRequestId,
      sourceContext: "missing_product_request",
      eventName: "missing_request_created",
      productTitle,
      requestDetails,
      carMake: data.carMake,
      carModel,
      specialty: data.specialty,
      requesterType: data.requesterType,
      requesterName: data.requesterName,
      requesterPhone: data.requesterPhone,
      requesterGovernorate: governorate,
      searchScope: data.searchScope,
      imageUrl: deliverableImageUrl,
      imageDataUrl: data.imageDataUrl ?? "",
      targetMerchantCount: targets.length,
      requestCountLimitChecked: data.requesterType === "customer",
      customerName: data.requesterType === "customer" ? data.requesterName : "",
      customerPhone: data.requesterType === "customer" ? data.requesterPhone : "",
      status: "missing_request_sent",
      createdAt: now,
      eventAt: now,
    });

    const sendResults = [];
    for (const merchant of targets) {
      const orderId = crypto.randomUUID();
      const sendResult = {
        skipped: true,
        reason: "web_notifications_only",
      };
      sendResults.push({ merchantId: merchant.id, ...sendResult });
      await appendEvent("botly_order", {
        orderId,
        missingRequestId,
        sourceContext: "missing_product_request",
        eventName: "missing_request_sent_to_merchant",
        productTitle,
        requestDetails,
        carMake: data.carMake,
        carModel,
        specialty: data.specialty,
        requesterType: data.requesterType,
        requesterName: data.requesterName,
        requesterPhone: data.requesterPhone,
        requesterGovernorate: governorate,
        searchScope: data.searchScope,
        imageUrl: deliverableImageUrl,
        imageDataUrl: data.imageDataUrl ?? "",
        merchantId: merchant.id,
        merchantStoreName: merchant.storeName,
        merchantWhatsapp: merchant.whatsapp,
        merchantGovernorate: merchant.governorate,
        status: "sent_to_merchant",
        recipientCreatedAt: now,
        merchantNotified: false,
        whatsappSendResults: sendResult,
        createdAt: now,
        eventAt: now,
      });
    }

    return {
      ok: true,
      missingRequestId,
      targetMerchantCount: targets.length,
      sentCount: targets.length,
      webNotificationCount: sendResults.length,
    };
  });
