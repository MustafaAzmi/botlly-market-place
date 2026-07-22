// Shared server-side event-store helpers.
//
// Botly is event-sourced: merchants, products, sessions, social connections and
// imported posts all live in `whatsapp_webhook_events` as rows tagged with
// `source = 'botly'` and a discriminating `event_type`. This module centralises
// the read/append helpers so new features (Meta import, search, notifications)
// reuse the exact same storage path as merchant.functions.ts without modifying
// that file.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordEgressDiagnostic } from "@/lib/egress-diagnostics.server";

export type BotlyEventType =
  | "botly_merchant"
  | "botly_product"
  | "botly_session"
  | "botly_merchant_otp"
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
  | "botly_order_counter_reset"
  | "botly_merchant_sales_reset"
  | "botly_merchant_review"
  | "botly_fitter_saved_request"
  | "botly_fitter_favorite"
  | "botly_supervisor"
  | "botly_supervisor_session"
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

export type ProjectedEventRow = Record<string, unknown> & {
  id: string;
  created_at?: string;
  received_at?: string;
};

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export type PageRequest = {
  page?: number;
  limit?: number;
  cursor?: string;
};

export type PageResult<T> = {
  items: T[];
  page: number;
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export function normalizePageRequest(input: PageRequest = {}) {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const limit = Math.min(
    MAX_PAGE_LIMIT,
    Math.max(1, Math.floor(input.limit ?? DEFAULT_PAGE_LIMIT)),
  );
  const cursor = typeof input.cursor === "string" ? input.cursor.trim() : "";
  return { page, limit, cursor };
}

const READ_CACHE_TTL_MS = 5_000;
const eventReadCache = new Map<
  string,
  { expiresAt: number; promise: Promise<EventRow[]> }
>();

function invalidateEventReadCache(eventType: BotlyEventType) {
  for (const key of eventReadCache.keys()) {
    if (key.startsWith(`${eventType}:`)) eventReadCache.delete(key);
  }
}

function cacheEventRead(key: string, loader: () => Promise<EventRow[]>) {
  const now = Date.now();
  const cached = eventReadCache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = loader().catch((error) => {
    eventReadCache.delete(key);
    throw error;
  });
  eventReadCache.set(key, { expiresAt: now + READ_CACHE_TTL_MS, promise });
  return promise;
}

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

  if (!primary.error) {
    invalidateEventReadCache(eventType);
    return primary.data as unknown as EventRow;
  }

  const fallback = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .insert({ provider: eventType, payload } as never)
    .select("id,payload,received_at")
    .single();

  if (fallback.error) {
    throw new Error(`Failed to persist ${eventType}: ${fallback.error.message ?? "unknown error"}`);
  }
  invalidateEventReadCache(eventType);
  return fallback.data as unknown as EventRow;
}

// Read one bounded page of events (newest first).
export async function listEventsPage(
  eventType: BotlyEventType,
  request: PageRequest = {},
): Promise<PageResult<EventRow>> {
  const { page, limit, cursor } = normalizePageRequest(request);
  const cacheKey = `${eventType}:page:${page}:${limit}:${cursor}`;
  const items = await cacheEventRead(cacheKey, async () => {
    const offset = (page - 1) * limit;
    let primaryQuery = supabaseAdmin
      .from("whatsapp_webhook_events")
      .select("id,payload,created_at")
      .eq("source", "botly")
      .eq("event_type", eventType)
      .order("created_at", { ascending: false });
    primaryQuery = cursor
      ? primaryQuery.lt("created_at", cursor)
      : primaryQuery.range(offset, offset + limit - 1);
    if (cursor) primaryQuery = primaryQuery.limit(limit);
    const primary = await primaryQuery;

    if (!primary.error) {
      const rows = (primary.data ?? []) as EventRow[];
      recordEgressDiagnostic({
        route: `db:listEventsPage:${eventType}`,
        payload: rows,
        params: { page, limit, cursor },
      });
      return rows;
    }

    let fallbackQuery = supabaseAdmin
      .from("whatsapp_webhook_events")
      .select("id,payload,received_at")
      .eq("provider" as never, eventType)
      .order("received_at", { ascending: false });
    fallbackQuery = cursor
      ? fallbackQuery.lt("received_at", cursor)
      : fallbackQuery.range(offset, offset + limit - 1);
    if (cursor) fallbackQuery = fallbackQuery.limit(limit);
    const fallback = await fallbackQuery;

    if (isMissingTableError(fallback.error) || fallback.error) return [];
    const rows = (fallback.data ?? []) as unknown as EventRow[];
    recordEgressDiagnostic({
      route: `db:listEventsPage:${eventType}:legacy`,
      payload: rows,
      params: { page, limit, cursor },
    });
    return rows;
  });

  const last = items.at(-1);
  return {
    items,
    page,
    limit,
    nextCursor: items.length === limit && last ? eventTime(last) : null,
    hasMore: items.length === limit,
  };
}

// Compatibility helper for single-page reads. It is intentionally capped at
// 100 rows; list/page endpoints should use listEventsPage directly.
export async function listEvents(
  eventType: BotlyEventType,
  limit = DEFAULT_PAGE_LIMIT,
): Promise<EventRow[]> {
  const page = await listEventsPage(eventType, { limit });
  return page.items;
}

// Read scalar JSONB fields without transferring the complete payload. The
// projection uses PostgREST aliases, e.g. "title:payload->>title".
export async function listProjectedEventsPage(
  eventType: BotlyEventType,
  projection: string,
  request: PageRequest = {},
): Promise<PageResult<ProjectedEventRow>> {
  const { page, limit, cursor } = normalizePageRequest(request);
  const offset = (page - 1) * limit;
  let primaryQuery = supabaseAdmin
    .from("whatsapp_webhook_events")
    .select(`id,created_at,${projection}`)
    .eq("source", "botly")
    .eq("event_type", eventType)
    .order("created_at", { ascending: false });
  primaryQuery = cursor
    ? primaryQuery.lt("created_at", cursor).limit(limit)
    : primaryQuery.range(offset, offset + limit - 1);
  const primary = await primaryQuery;

  let items: ProjectedEventRow[];
  if (!primary.error) {
    items = (primary.data ?? []) as unknown as ProjectedEventRow[];
  } else {
    let fallbackQuery = supabaseAdmin
      .from("whatsapp_webhook_events")
      .select(`id,received_at,${projection}`)
      .eq("provider" as never, eventType)
      .order("received_at", { ascending: false });
    fallbackQuery = cursor
      ? fallbackQuery.lt("received_at", cursor).limit(limit)
      : fallbackQuery.range(offset, offset + limit - 1);
    const fallback = await fallbackQuery;
    if (fallback.error) throw new Error(`Failed to read projected ${eventType}: ${fallback.error.message}`);
    items = (fallback.data ?? []) as unknown as ProjectedEventRow[];
  }

  recordEgressDiagnostic({
    route: `db:listProjectedEventsPage:${eventType}`,
    payload: items,
    params: { page, limit, cursor },
  });
  const last = items.at(-1);
  return {
    items,
    page,
    limit,
    nextCursor: items.length === limit && last ? eventTime(last as EventRow) : null,
    hasMore: items.length === limit,
  };
}

export async function listProjectedEventsByPayloadFieldPage(
  eventType: BotlyEventType,
  field: string,
  value: string,
  projection: string,
  request: PageRequest = {},
): Promise<PageResult<ProjectedEventRow>> {
  const { page, limit, cursor } = normalizePageRequest(request);
  const offset = (page - 1) * limit;
  let primaryQuery = supabaseAdmin
    .from("whatsapp_webhook_events")
    .select(`id,created_at,${projection}`)
    .eq("source", "botly")
    .eq("event_type", eventType)
    .eq(`payload->>${field}` as never, value)
    .order("created_at", { ascending: false });
  primaryQuery = cursor
    ? primaryQuery.lt("created_at", cursor).limit(limit)
    : primaryQuery.range(offset, offset + limit - 1);
  const primary = await primaryQuery;

  let items: ProjectedEventRow[];
  if (!primary.error) {
    items = (primary.data ?? []) as unknown as ProjectedEventRow[];
  } else {
    let fallbackQuery = supabaseAdmin
      .from("whatsapp_webhook_events")
      .select(`id,received_at,${projection}`)
      .eq("provider" as never, eventType)
      .eq(`payload->>${field}` as never, value)
      .order("received_at", { ascending: false });
    fallbackQuery = cursor
      ? fallbackQuery.lt("received_at", cursor).limit(limit)
      : fallbackQuery.range(offset, offset + limit - 1);
    const fallback = await fallbackQuery;
    if (fallback.error) throw new Error(`Failed to read projected ${eventType}: ${fallback.error.message}`);
    items = (fallback.data ?? []) as unknown as ProjectedEventRow[];
  }

  recordEgressDiagnostic({
    route: `db:listProjectedEventsByField:${eventType}:${field}`,
    payload: items,
    params: { page, limit, cursor },
  });
  const last = items.at(-1);
  return {
    items,
    page,
    limit,
    nextCursor: items.length === limit && last ? eventTime(last as EventRow) : null,
    hasMore: items.length === limit,
  };
}

export async function getProjectedEventByPayloadField(
  eventType: BotlyEventType,
  field: string,
  value: string,
  projection: string,
): Promise<ProjectedEventRow | null> {
  const primary = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select(`id,created_at,${projection}`)
    .eq("source", "botly")
    .eq("event_type", eventType)
    .eq(`payload->>${field}` as never, value)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!primary.error) {
    const row = (primary.data?.[0] ?? null) as unknown as ProjectedEventRow | null;
    recordEgressDiagnostic({
      route: `db:getProjectedEvent:${eventType}:${field}`,
      payload: row ? [row] : [],
      params: { limit: 1 },
    });
    return row;
  }

  const fallback = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select(`id,received_at,${projection}`)
    .eq("provider" as never, eventType)
    .eq(`payload->>${field}` as never, value)
    .order("received_at", { ascending: false })
    .limit(1);
  if (fallback.error) return null;
  const row = (fallback.data?.[0] ?? null) as unknown as ProjectedEventRow | null;
  recordEgressDiagnostic({
    route: `db:getProjectedEvent:${eventType}:${field}:legacy`,
    payload: row ? [row] : [],
    params: { limit: 1 },
  });
  return row;
}

export async function getProjectedEventById(
  eventType: BotlyEventType,
  id: string,
  projection: string,
): Promise<ProjectedEventRow | null> {
  if (!id.trim()) return null;
  const primary = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select(`id,created_at,${projection}`)
    .eq("source", "botly")
    .eq("event_type", eventType)
    .eq("id", id)
    .limit(1);
  if (!primary.error && primary.data?.[0]) {
    const row = primary.data[0] as unknown as ProjectedEventRow;
    recordEgressDiagnostic({
      route: `db:getProjectedEventById:${eventType}`,
      payload: [row],
      params: { limit: 1 },
    });
    return row;
  }
  const fallback = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select(`id,received_at,${projection}`)
    .eq("provider" as never, eventType)
    .eq("id", id)
    .limit(1);
  if (fallback.error || !fallback.data?.[0]) return null;
  const row = fallback.data[0] as unknown as ProjectedEventRow;
  recordEgressDiagnostic({
    route: `db:getProjectedEventById:${eventType}:legacy`,
    payload: [row],
    params: { limit: 1 },
  });
  return row;
}

// Admin exports may scan multiple bounded pages, but no individual database
// query exceeds MAX_PAGE_LIMIT.
export async function listEventsForAdminExport(
  eventType: BotlyEventType,
  maxRows = 5_000,
): Promise<EventRow[]> {
  const rows: EventRow[] = [];
  let cursor = "";
  while (rows.length < maxRows) {
    const page = await listEventsPage(eventType, {
      cursor,
      limit: Math.min(MAX_PAGE_LIMIT, maxRows - rows.length),
    });
    rows.push(...page.items);
    if (!page.hasMore || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return rows;
}

// Read events of a given type filtered by a payload field, server-side
// (jsonb ->> filter). Critical for hot paths: avoids downloading thousands of
// rows just to scan for one customer's data in memory.
export async function listEventsByPayloadField(
  eventType: BotlyEventType,
  field: string,
  value: string,
  limit = DEFAULT_PAGE_LIMIT,
): Promise<EventRow[]> {
  return (await listEventsByPayloadFieldPage(eventType, field, value, { limit })).items;
}

export async function listEventsByPayloadFieldPage(
  eventType: BotlyEventType,
  field: string,
  value: string,
  request: PageRequest = {},
): Promise<PageResult<EventRow>> {
  const { page, limit, cursor } = normalizePageRequest(request);
  const cacheKey = `${eventType}:field-page:${field}:${value}:${page}:${limit}:${cursor}`;
  const items = await cacheEventRead(cacheKey, async () => {
    const offset = (page - 1) * limit;
    let primaryQuery = supabaseAdmin
      .from("whatsapp_webhook_events")
      .select("id,payload,created_at")
      .eq("source", "botly")
      .eq("event_type", eventType)
      .eq(`payload->>${field}` as never, value)
      .order("created_at", { ascending: false });
    primaryQuery = cursor
      ? primaryQuery.lt("created_at", cursor).limit(limit)
      : primaryQuery.range(offset, offset + limit - 1);
    const primary = await primaryQuery;

    if (!primary.error) {
      const rows = (primary.data ?? []) as EventRow[];
      recordEgressDiagnostic({
        route: `db:listEventsByField:${eventType}:${field}`,
        payload: rows,
        params: { page, limit, cursor },
      });
      return rows;
    }

    // Older schema / filter failure: fall back to the in-memory scan.
    const rows = await listEvents(eventType, MAX_PAGE_LIMIT);
    return rows
      .filter((row) => getString(row.payload?.[field]) === value)
      .slice(offset, offset + limit);
  });
  const last = items.at(-1);
  return {
    items,
    page,
    limit,
    nextCursor: items.length === limit && last ? eventTime(last) : null,
    hasMore: items.length === limit,
  };
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

export async function getEventById(
  eventType: BotlyEventType,
  id: string,
): Promise<EventRow | null> {
  if (!id.trim()) return null;
  const primary = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id,payload,created_at")
    .eq("source", "botly")
    .eq("event_type", eventType)
    .eq("id", id)
    .limit(1);
  if (!primary.error && primary.data?.[0]) {
    const row = primary.data[0] as EventRow;
    recordEgressDiagnostic({
      route: `db:getEventById:${eventType}`,
      payload: [row],
      params: { limit: 1 },
    });
    return row;
  }

  const fallback = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id,payload,received_at")
    .eq("provider" as never, eventType)
    .eq("id", id)
    .limit(1);
  if (fallback.error || !fallback.data?.[0]) return null;
  const row = fallback.data[0] as unknown as EventRow;
  recordEgressDiagnostic({
    route: `db:getEventById:${eventType}:legacy`,
    payload: [row],
    params: { limit: 1 },
  });
  return row;
}

// Delete all events of a specific type matching a payload field (hard delete from DB).
export async function deleteEventsByPayloadField(
  eventType: BotlyEventType,
  field: string,
  value: string,
): Promise<number> {
  const primary = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .delete()
    .eq("source", "botly")
    .eq("event_type", eventType)
    .eq(`payload->>${field}` as never, value)
    .select("id");

  const fallback = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .delete()
    .eq("provider" as never, eventType)
    .eq(`payload->>${field}` as never, value)
    .select("id");

  if (primary.error && fallback.error) {
    throw new Error(`Failed to delete ${eventType}: ${primary.error.message ?? fallback.error.message ?? "unknown error"}`);
  }
  if (primary.error && !fallback.error) {
    invalidateEventReadCache(eventType);
    return fallback.data?.length ?? 0;
  }
  if (fallback.error) {
    const message = `${fallback.error.code ?? ""} ${fallback.error.message ?? ""}`.toLowerCase();
    if (!message.includes("provider") && !message.includes("column") && !message.includes("schema cache")) {
      throw new Error(`Failed to delete legacy ${eventType}: ${fallback.error.message ?? "unknown error"}`);
    }
  }

  invalidateEventReadCache(eventType);
  return (primary.data?.length ?? 0) + (fallback.data?.length ?? 0);
}

async function findMerchantById(id: string): Promise<EventRow | null> {
  if (!id || !id.trim()) return null;
  const rows = await listEventsByPayloadField("botly_merchant", "merchantId", id, 1);
  return rows[0] ?? getEventById("botly_merchant", id);
}

async function findMerchantByPhone(phone: string): Promise<EventRow | null> {
  const key = phoneKey(phone);
  if (!key) return null;
  const candidates = [...new Set([phone, normalizePhone(phone)])].filter(Boolean);
  const groups = await Promise.all(
    candidates.flatMap((candidate) => [
      listEventsByPayloadField("botly_merchant", "whatsapp", candidate, 1),
      listEventsByPayloadField("botly_merchant", "whatsappNormalized", candidate, 1),
    ]),
  );
  const rows = groups.flat();
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
  const sessions = await listEventsByPayloadField("botly_session", "tokenHash", tokenHash, 1);
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
