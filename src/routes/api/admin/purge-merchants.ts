import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const CONFIRMATION = "DELETE_ALL_BOTLY_MERCHANT_ACCOUNTS_2026_06_09";
const TARGET_EVENT_TYPES = [
  "botly_merchant",
  "botly_session",
  "botly_product",
  "botly_meta_connection",
  "botly_social_post",
  "botly_lead",
  "botly_customer_session",
  "botly_order",
];

async function deleteWebhookEvents() {
  const byEventType = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .delete()
    .eq("source", "botly")
    .in("event_type", TARGET_EVENT_TYPES)
    .select("id");

  if (byEventType.error) throw byEventType.error;

  const byProvider = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .delete()
    .in("provider" as never, TARGET_EVENT_TYPES)
    .select("id");

  if (byProvider.error) throw byProvider.error;

  return {
    eventTypeRows: byEventType.data?.length ?? 0,
    providerRows: byProvider.data?.length ?? 0,
  };
}

async function deleteBroadcastFallbackRows() {
  const audiences = TARGET_EVENT_TYPES.map((type) => `botly:${type}`);
  const deleted = await supabaseAdmin
    .from("broadcasts")
    .delete()
    .in("audience" as never, audiences)
    .select("id");

  if (deleted.error) {
    const message = `${deleted.error.code ?? ""} ${deleted.error.message ?? ""}`.toLowerCase();
    if (message.includes("42p01") || message.includes("does not exist") || message.includes("relation")) {
      return 0;
    }
    throw deleted.error;
  }

  return deleted.data?.length ?? 0;
}

export const Route = createFileRoute("/api/admin/purge-merchants")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const confirm = url.searchParams.get("confirm");
        if (confirm !== CONFIRMATION) {
          return new Response(JSON.stringify({ ok: false, error: "Confirmation mismatch" }), {
            status: 403,
            headers: jsonHeaders,
          });
        }

        try {
          const webhookEvents = await deleteWebhookEvents();
          const broadcastRows = await deleteBroadcastFallbackRows();

          return new Response(
            JSON.stringify({
              ok: true,
              deleted: {
                ...webhookEvents,
                broadcastRows,
                total:
                  webhookEvents.eventTypeRows + webhookEvents.providerRows + broadcastRows,
              },
            }),
            { status: 200, headers: jsonHeaders },
          );
        } catch (error) {
          console.error("[Admin Purge] Failed to delete merchant accounts", error);
          return new Response(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : "Unknown purge error",
            }),
            { status: 500, headers: jsonHeaders },
          );
        }
      },
    },
  },
});
