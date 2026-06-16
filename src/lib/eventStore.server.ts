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
  | "botly_lead"
  | "botly_customer"
  | "botly_customer_session"
  | "botly_fitter"
  | "botly_fitter_session"
  | "botly_fitter_order"
  | "botly_fitter_sale"
  | "botly_fitter_reset"
  | "botly_outbound_guard"
  | "botly_order"
  | "botly_admin"
  | "botly_admin_session"
  | "botly_admin_password_reset"
  | "botly_admin_message"
  | "botly_currency"
  | "botly_settings"
  | "botly_delivery_company"
  | "botly_catalogue_config";

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

function merchantIdentity(row: EventRow): string {
  return getString(row.payload?.merchantId) || row.id;
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

// Read events of a given type filtered by a payload field, server-side
// (jsonb ->> filter). Critical for hot paths: avoids downloading thousands of
// rows just to scan for one customer's data in memory.
export async function listEventsByPayloadField(
  eventType: BotlyEventType,
  field: string,
  value: string,
  limit = 20,
): Promise<EventRow[]> {
  const primary = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id,payload,created_at")
    .eq("source", "botly")
    .eq("event_type", eventType)
    .eq(`payload->>${field}` as never, value)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!primary.error) return (primary.data ?? []) as EventRow[];

  // Older schema / filter failure: fall back to the in-memory scan.
  const rows = await listEvents(eventType, 1000);
  return rows.filter((row) => getString(row.payload?.[field]) === value).slice(0, limit);
}

// Read the most recent event matching a payload field equality. Useful for
// "current state" lookups in an append-only store (e.g. latest connection).
export async function latestEventWhere(
  eventType: BotlyEventType,
  field: string,
  value: string,
): Promise<EventRow | null> {
  const rows = await listEventsByPayloadField(eventType, field, value, 1);
  return rows[0] ?? null;
}

// Delete all events of a specific type matching a payload field (hard delete from DB).
export async function deleteEventsByPayloadField(
  eventType: BotlyEventType,
  field: string,
  value: string,
): Promise<number> {
  const result = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .delete()
    .eq("source", "botly")
    .eq("event_type", eventType)
    .eq(`payload->>${field}` as never, value);

  if (result.error) {
    throw new Error(`Failed to delete ${eventType}: ${result.error.message ?? "unknown error"}`);
  }
  return result.count ?? 0;
}

async function findMerchantById(id: string): Promise<EventRow | null> {
  if (!id || !id.trim()) return null;
  const rows = await listEvents("botly_merchant");
  return rows.find((row) => merchantIdentity(row) === id || row.id === id) ?? null;
}

async function findMerchantByPhone(phone: string): Promise<EventRow | null> {
  const key = phoneKey(phone);
  if (!key) return null;
  const rows = await listEvents("botly_merchant");
  return (
    rows.find((row) => {
      const payload = row.payload ?? {};
      return (
        phoneKey(getString(payload.whatsappNormalized)) === key ||
        phoneKey(getString(payload.whatsapp)) === key
      );
    }) ?? null
  );
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

// Normalize a phone number to international format (+<country><digits>).
// Handles Iraqi numbers in all formats:
// - 07XXXXXXXXX → +9647XXXXXXXXX (local Iraqi format)
// - 9647XXXXXXXXX → +9647XXXXXXXXX (10 digits without +)
// - +9647XXXXXXXXX → +9647XXXXXXXXX (already international)
// - 00967XXXXXXXXX → +967XXXXXXXXX (alternative international format)
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "").trim();
  if (!digits) return "";

  // Remove leading + if present, we'll add it back at the end
  let cleaned = digits.replace(/^\+/, "");

  // Convert 00 prefix to country code (e.g., 00964 → 964)
  if (cleaned.startsWith("00")) {
    cleaned = cleaned.slice(2);
  }

  // Convert Iraqi local format to international:
  // 07XXXXXXXXX (11 digits) → 9647XXXXXXXXX (12 digits)
  if (cleaned.startsWith("07") && cleaned.length === 11) {
    cleaned = "964" + cleaned.slice(1);
  }

  return "+" + cleaned;
}

// Format-independent phone identity: "07801234567", "+9647801234567" and
// "9647801234567" all refer to the same subscriber. Comparing the last 10
// digits matches numbers regardless of country-code/leading-zero format.
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
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
  const merchantRowId = getString(session.payload?.merchantRowId);
  const merchantPhone = getString(session.payload?.merchantPhone);
  if (!merchantId && (merchantRowId || merchantPhone)) {
    const merchant =
      (merchantRowId ? await findMerchantById(merchantRowId) : null) ||
      (merchantPhone ? await findMerchantByPhone(merchantPhone) : null);
    if (merchant) return merchantIdentity(merchant);
  }
  if (!merchantId) throw new Error("لم يتم العثور على المتجر.");
  const merchant =
    (merchantId ? await findMerchantById(merchantId) : null) ||
    (merchantRowId ? await findMerchantById(merchantRowId) : null) ||
    (merchantPhone ? await findMerchantByPhone(merchantPhone) : null);

  if (merchant) return merchantIdentity(merchant);
  return merchantId;
}
