import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendEvent,
  getString,
  listEvents,
  phoneKey,
  type EventRow,
} from "@/lib/eventStore.server";
import { normalizeGovernorate } from "@/lib/governorates";

type MissingRequestScope = "governorate" | "all";
type MissingRequesterType = "customer" | "fitter";

const missingProductInput = z.object({
  productName: z.string().trim().min(2).max(160),
  requestDetails: z.string().trim().max(1000).optional().or(z.literal("")),
  carMake: z.string().trim().min(1).max(80),
  carModel: z.string().trim().max(80).optional().or(z.literal("")),
  governorate: z.string().trim().min(1).max(100),
  requesterType: z.enum(["customer", "fitter"]),
  requesterName: z.string().trim().min(1).max(120),
  requesterPhone: z.string().trim().min(6).max(40),
  searchScope: z.enum(["governorate", "all"]),
  imageUrl: z.string().trim().max(4000).optional().or(z.literal("")),
  imageDataUrl: z.string().trim().max(2500000).optional().or(z.literal("")),
});

type TargetMerchant = {
  id: string;
  storeName: string;
  whatsapp: string;
  governorate: string;
};

function merchantIdentity(row: EventRow) {
  return getString(row.payload?.merchantId) || row.id;
}

function productIdentity(row: EventRow) {
  return getString(row.payload?.productId) || row.id;
}

function isInactiveMerchant(payload: Record<string, unknown>) {
  return (
    payload.bannedFromBot === true ||
    payload.bannedFromBot === "true" ||
    payload.visibilityEnabled === false ||
    payload.visibilityEnabled === "false" ||
    payload.isActive === false ||
    payload.isActive === "false" ||
    Boolean(getString(payload.suspendedAt)) ||
    getString(payload.subscriptionStatus) === "expired" ||
    (Boolean(getString(payload.packageExpiry)) &&
      new Date(getString(payload.packageExpiry)).getTime() < Date.now())
  );
}

function sameText(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function latestMerchantRows() {
  const rows = await listEvents("botly_merchant", 100).catch(() => [] as EventRow[]);
  const latest = new Map<string, EventRow>();
  for (const row of rows) {
    const id = merchantIdentity(row);
    if (id && !latest.has(id)) latest.set(id, row);
  }
  return [...latest.values()];
}

async function merchantCarMakes() {
  const rows = await listEvents("botly_product", 100).catch(() => [] as EventRow[]);
  const latest = new Map<string, EventRow>();
  for (const row of rows) {
    const id = productIdentity(row);
    if (id && !latest.has(id)) latest.set(id, row);
  }

  const makes = new Map<string, Set<string>>();
  for (const row of latest.values()) {
    const p = row.payload ?? {};
    if (getString(p.status) !== "active") continue;
    if (getString(p.availability) === "out_of_stock") continue;
    const merchantId = getString(p.merchantId);
    const carMake = getString(p.carMake);
    if (!merchantId || !carMake) continue;
    if (!makes.has(merchantId)) makes.set(merchantId, new Set());
    makes.get(merchantId)!.add(carMake);
  }
  return makes;
}

async function findTargetMerchants(args: {
  carMake: string;
  governorate: string;
  scope: MissingRequestScope;
}): Promise<TargetMerchant[]> {
  const [merchants, specialties] = await Promise.all([latestMerchantRows(), merchantCarMakes()]);
  const targets: TargetMerchant[] = [];
  const seenPhones = new Set<string>();

  for (const row of merchants) {
    const p = row.payload ?? {};
    const merchantId = merchantIdentity(row);
    if (!merchantId || isInactiveMerchant(p)) continue;

    const whatsapp = getString(p.whatsappNormalized) || getString(p.whatsapp);
    const phone = phoneKey(whatsapp);
    if (!whatsapp || !phone || seenPhones.has(phone)) continue;

    const carMakes = specialties.get(merchantId) ?? new Set<string>();
    const matchesMake = [...carMakes].some((make) => sameText(make, args.carMake) || make === "عام");
    if (!matchesMake) continue;

    const governorate = normalizeGovernorate(getString(p.city) || getString(p.governorate));
    if (args.scope === "governorate" && normalizeGovernorate(args.governorate) !== governorate) continue;

    seenPhones.add(phone);
    targets.push({
      id: merchantId,
      storeName: getString(p.storeName) || "متجر",
      whatsapp,
      governorate,
    });
  }

  return targets;
}

export const submitMissingProductRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => missingProductInput.parse(d))
  .handler(async ({ data }) => {
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
    const targets = await findTargetMerchants({
      carMake: data.carMake,
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
      requesterType: data.requesterType,
      requesterName: data.requesterName,
      requesterPhone: data.requesterPhone,
      requesterGovernorate: governorate,
      searchScope: data.searchScope,
      imageUrl: deliverableImageUrl,
      imageDataUrl: data.imageDataUrl ?? "",
      targetMerchantCount: targets.length,
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
