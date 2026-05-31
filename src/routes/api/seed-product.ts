import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function env(name: string) {
  return process.env[name];
}

function normalizePhone(phone: string) {
  return phone
    .replace(/[^\d+]/g, "")
    .replace(/^00/, "+")
    .trim();
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("42p01") || text.includes("does not exist") || text.includes("relation");
}

function parseBroadcastBody(body: unknown) {
  if (typeof body !== "string") return {} as Record<string, unknown>;
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function merchantIdentity(row: { id: string; payload: Record<string, unknown> }) {
  return getString(row.payload.merchantId) || row.id;
}

async function listMerchantEvents() {
  const merchants: Array<{ id: string; payload: Record<string, unknown> }> = [];

  const eventPrimary = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id,payload,created_at")
    .eq("source", "botly")
    .eq("event_type", "botly_merchant")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (!eventPrimary.error) {
    for (const row of eventPrimary.data ?? []) {
      merchants.push({
        id: String(row.id ?? ""),
        payload: (row.payload ?? {}) as Record<string, unknown>,
      });
    }
  } else if (!isMissingTableError(eventPrimary.error)) {
    throw eventPrimary.error;
  }

  const eventFallback = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id,payload,received_at")
    .eq("provider", "botly_merchant")
    .order("received_at", { ascending: false })
    .limit(5000);

  if (!eventFallback.error) {
    for (const row of eventFallback.data ?? []) {
      merchants.push({
        id: String(row.id ?? ""),
        payload: (row.payload ?? {}) as Record<string, unknown>,
      });
    }
  } else if (!isMissingTableError(eventFallback.error)) {
    throw eventFallback.error;
  }

  const broadcasts = await supabaseAdmin
    .from("broadcasts")
    .select("id,body,created_at")
    .eq("audience", "botly:botly_merchant")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (!broadcasts.error) {
    for (const row of broadcasts.data ?? []) {
      merchants.push({
        id: String(row.id ?? ""),
        payload: parseBroadcastBody(row.body),
      });
    }
  } else if (!isMissingTableError(broadcasts.error)) {
    throw broadcasts.error;
  }

  return merchants;
}

async function insertProduct(payload: Record<string, unknown>) {
  const primary = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .insert({
      source: "botly",
      event_type: "botly_product",
      payload,
    })
    .select("id")
    .single();

  if (!primary.error) return { store: "whatsapp_webhook_events", id: primary.data.id };

  const fallback = await supabaseAdmin
    .from("broadcasts")
    .insert({
      title: "botly_product",
      body: JSON.stringify(payload),
      status: "botly_event",
      audience: "botly:botly_product",
      audience_label: "botly",
      recipients: 0,
    })
    .select("id")
    .single();

  if (fallback.error) throw fallback.error;
  return { store: "broadcasts", id: fallback.data.id };
}

export const Route = createFileRoute("/api/seed-product")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const seedToken = env("BOTLY_SEED_TOKEN") ?? env("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
        const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!seedToken || auth !== seedToken) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: jsonHeaders,
          });
        }

        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const phone = getString(body.phone) || "07517012173";
        const merchants = await listMerchantEvents();
        const merchant = merchants.find((row) => {
          const normalized = getString(row.payload.whatsappNormalized) || normalizePhone(getString(row.payload.whatsapp));
          return normalized === normalizePhone(phone);
        });

        if (!merchant) {
          return new Response(JSON.stringify({ ok: false, error: "Merchant not found", phone }), {
            status: 404,
            headers: jsonHeaders,
          });
        }

        const now = new Date().toISOString();
        const productPayload = {
          productId: crypto.randomUUID(),
          merchantId: merchantIdentity(merchant),
          description: getString(body.description) || "بنطلون جينز ازرق",
          imageUrl: "",
          currentPrice: Number(body.currentPrice ?? 15000),
          currency: getString(body.currency) || "IQD",
          size: "",
          color: getString(body.color) || "ازرق",
          quantity: undefined,
          createdAt: now,
          updatedAt: now,
        };

        const inserted = await insertProduct(productPayload);
        return new Response(
          JSON.stringify({
            ok: true,
            inserted,
            merchantId: productPayload.merchantId,
            product: productPayload,
          }),
          { status: 200, headers: jsonHeaders },
        );
      },
    },
  },
});
