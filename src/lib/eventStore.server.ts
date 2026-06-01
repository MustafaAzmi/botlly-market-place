// Shared server-side event-store helpers.
//
// Botly is event-sourced: merchants, products, sessions, social connections and
// imported posts all live in `whatsapp_webhook_events` as rows tagged with
// `source = 'botly'` and a discriminating `event_type`. This module centralises
// the read/append helpers so new features (Meta import, search, notifications)
// reuse the exact same storage path as merchant.functions.ts without modifying
// that file.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BotlyEventType =
  | "botly_merchant"
  | "botly_product"
  | "botly_session"
  | "botly_meta_connection"
  | "botly_social_post"
  | "botly_lead"
  | "botly_admin"
  | "botly_admin_session"
  | "botly_admin_message";

export type EventRow = {
  id: string;
  payload: Record<string, unknown>;
  created_at?: string;
  received_at?: string;
};

export function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function eventTime(row: EventRow): string {
  return row.created_at ?? row.received_at ?? new Date().toISOString();
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("42p01") || text.includes("does not exist") || text.includes("relation");
}

// Append a new event. Mirrors merchant.functions.ts insertEvent (source/event_type
// first, provider fallback for older schemas).
export async function appendEvent(
  eventType: BotlyEventType,
  payload: Record<string, unknown>,
): Promise<EventRow> {
  const primary = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .insert({ source: "botly", event_type: eventType, payload } as never)
    .select("id,payload,created_at")
    .single();

  if (!primary.error) return primary.data as unknown as EventRow;

  const fallback = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .insert({ provider: eventType, payload } as never)
    .select("id,payload,received_at")
    .single();

  if (fallback.error) {
    throw new Error(`Failed to persist ${eventType}: ${fallback.error.message ?? "unknown error"}`);
  }
  return fallback.data as unknown as EventRow;
}

// Read events of a given type (newest first).
export async function listEvents(eventType: BotlyEventType, limit = 5000): Promise<EventRow[]> {
  const primary = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id,payload,created_at")
    .eq("source", "botly")
    .eq("event_type", eventType)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!primary.error) return (primary.data ?? []) as EventRow[];

  const fallback = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id,payload,received_at")
    .eq("provider" as never, eventType)
    .order("received_at", { ascending: false })
    .limit(limit);

  if (isMissingTableError(fallback.error) || fallback.error) return [];
  return (fallback.data ?? []) as unknown as EventRow[];
}

// Read the most recent event matching a payload field equality. Useful for
// "current state" lookups in an append-only store (e.g. latest connection).
export async function latestEventWhere(
  eventType: BotlyEventType,
  field: string,
  value: string,
): Promise<EventRow | null> {
  const rows = await listEvents(eventType);
  return rows.find((row) => getString(row.payload?.[field]) === value) ?? null;
}

export async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// URL-safe random token (32 bytes).
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// Normalize a phone number to a comparable form (+<digits>).
export function normalizePhone(phone: string): string {
  return phone
    .replace(/[^\d+]/g, "")
    .replace(/^00/, "+")
    .trim();
}

// Validate a merchant session token and return the resolved merchant id.
// Mirrors the session model in merchant.functions.ts (botly_session events keyed
// by SHA-256 token hash with a TTL). Reused by Meta integration server functions.
export async function authorizeMerchantId(token: string): Promise<string> {
  const tokenHash = await sha256(token);
  const sessions = await listEvents("botly_session");
  const session = sessions.find((row) => {
    const payload = row.payload ?? {};
    return (
      getString(payload.tokenHash) === tokenHash &&
      new Date(getString(payload.expiresAt)).getTime() > Date.now()
    );
  });
  if (!session) throw new Error("انتهت الجلسة. سجل دخول مرة ثانية.");

  const merchantId = getString(session.payload?.merchantId);
  if (!merchantId) throw new Error("لم يتم العثور على المتجر.");
  return merchantId;
}
