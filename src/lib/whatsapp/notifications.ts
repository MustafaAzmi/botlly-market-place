// Merchant lead notifications.
//
// Botly is a lead-generation platform: when a customer's search matches a
// merchant's product, the merchant is notified with the customer query, the
// matched product and the customer's contact, then the lead is recorded.

import { appendEvent, listEvents, getString } from "@/lib/eventStore.server";
import type { ProductMatch } from "./search";

interface MerchantContact {
  merchantId: string;
  whatsapp: string;
  storeName: string;
}

// Resolve merchant WhatsApp numbers for the matched products (deduped).
async function resolveMerchantContacts(
  merchantIds: string[],
): Promise<Map<string, MerchantContact>> {
  const contacts = new Map<string, MerchantContact>();
  if (merchantIds.length === 0) return contacts;

  const wanted = new Set(merchantIds);
  const merchants = await listEvents("botly_merchant");

  for (const row of merchants) {
    const id = getString(row.payload?.merchantId) || row.id;
    if (!wanted.has(id) || contacts.has(id)) continue;
    const whatsapp = getString(row.payload?.whatsappNormalized) || getString(row.payload?.whatsapp);
    if (whatsapp) {
      contacts.set(id, {
        merchantId: id,
        whatsapp,
        storeName: getString(row.payload?.storeName) || "متجرك",
      });
    }
  }
  return contacts;
}

type SendFn = (to: string, body: string) => Promise<{ ok: boolean }>;

// Notify the merchant(s) behind the top match(es) about an interested customer.
// `sendWhatsAppText` is injected so this stays decoupled from the webhook module.
export async function notifyMerchantsOfLead(
  customerNumber: string | null,
  customerQuery: string,
  matches: ProductMatch[],
  sendWhatsAppText: SendFn,
): Promise<number> {
  if (matches.length === 0) return 0;

  // Notify the merchant of the single best match to avoid spamming on broad queries.
  const topMatch = matches[0];
  const contacts = await resolveMerchantContacts([topMatch.merchantId]);
  const contact = contacts.get(topMatch.merchantId);
  if (!contact) return 0;

  const contactLine = customerNumber ? `رقم الزبون: ${customerNumber}` : "رقم الزبون غير متوفر";
  const body = [
    "Botly: زبون يسأل عن منتجك",
    `طلب الزبون: ${customerQuery}`,
    `المنتج: ${topMatch.title}`,
    topMatch.price ? `السعر: ${topMatch.price} ${topMatch.currency}` : null,
    contactLine,
  ]
    .filter(Boolean)
    .join("\n");

  let notified = 0;
  try {
    const result = await sendWhatsAppText(contact.whatsapp, body);
    if (result.ok) notified += 1;
  } catch (error) {
    console.error("[Lead] Failed to notify merchant", contact.merchantId, error);
  }

  // Record the lead regardless of notification delivery, for the dashboard.
  await appendEvent("botly_lead", {
    leadId: crypto.randomUUID(),
    merchantId: topMatch.merchantId,
    productId: topMatch.id,
    customerNumber: customerNumber ?? "",
    customerQuery,
    matchedTitle: topMatch.title,
    notified: notified > 0,
    createdAt: new Date().toISOString(),
  }).catch((error) => console.error("[Lead] Failed to record lead", error));

  return notified;
}
