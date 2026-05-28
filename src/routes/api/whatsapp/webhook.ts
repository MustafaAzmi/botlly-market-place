import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

const textHeaders = { "content-type": "text/plain; charset=utf-8" };
const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function getVerifyToken() {
  return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
}

function getAppSecret() {
  return process.env.WHATSAPP_APP_SECRET;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyMetaSignature(request: Request, rawBody: string) {
  const appSecret = getAppSecret();
  if (!appSecret) return true;

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature?.startsWith("sha256=")) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return timingSafeEqual(signature, `sha256=${bytesToHex(digest)}`);
}

function readWebhookSummary(payload: unknown) {
  const root = payload as {
    object?: string;
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string };
          messages?: Array<{ id?: string; from?: string; type?: string }>;
          statuses?: Array<{ id?: string; recipient_id?: string; status?: string }>;
        };
      }>;
    }>;
  };

  const value = root.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  const status = value?.statuses?.[0];

  return {
    source: root.object ?? "whatsapp_business_account",
    eventType: message ? `message.${message.type ?? "unknown"}` : status ? `status.${status.status ?? "unknown"}` : "unknown",
    phoneNumberId: value?.metadata?.phone_number_id ?? null,
    waMessageId: message?.id ?? status?.id ?? null,
    fromNumber: message?.from ?? status?.recipient_id ?? null,
  };
}

export const Route = createFileRoute("/api/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        if (mode === "subscribe" && challenge && token === getVerifyToken()) {
          return new Response(challenge, { status: 200, headers: textHeaders });
        }

        return new Response("Webhook verification failed", {
          status: 403,
          headers: textHeaders,
        });
      },
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const hasValidSignature = await verifyMetaSignature(request, rawBody);
        if (!hasValidSignature) {
          return new Response(JSON.stringify({ ok: false, error: "Invalid signature" }), {
            status: 401,
            headers: jsonHeaders,
          });
        }

        let payload: unknown;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
            status: 400,
            headers: jsonHeaders,
          });
        }

        const summary = readWebhookSummary(payload);
        const { error } = await supabaseAdmin.from("whatsapp_webhook_events").insert({
          source: summary.source,
          event_type: summary.eventType,
          phone_number_id: summary.phoneNumberId,
          wa_message_id: summary.waMessageId,
          from_number: summary.fromNumber,
          payload: payload as Json,
        });

        if (error) {
          console.error("[WhatsApp webhook] Failed to persist event", error);
          return new Response(JSON.stringify({ ok: false, error: "Storage failed" }), {
            status: 500,
            headers: jsonHeaders,
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: jsonHeaders,
        });
      },
    },
  },
});
