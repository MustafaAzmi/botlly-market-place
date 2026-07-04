import { createServerOnlyFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";

type DiagnosticParams = {
  limit?: number | string;
  page?: number | string;
  cursor?: string | null;
};

export type EgressDiagnosticInput = {
  route: string;
  payload?: unknown;
  responseBytes?: number;
  rows?: number;
  containsBase64?: boolean;
  user?: string;
  session?: string;
  params?: DiagnosticParams;
  cacheControl?: string;
  status?: number;
  setHeaders?: boolean;
};

type EgressDiagnosticEvent = {
  route: string;
  responseBytes: number;
  rows: number;
  containsBase64: boolean;
  timestamp: string;
  user: string | null;
  session: string | null;
  params: DiagnosticParams;
  cacheControl: string | null;
  status: number;
};

type DiagnosticStore = {
  events: EgressDiagnosticEvent[];
  lastConsoleReportAt: number;
};

export type EgressRouteSummary = {
  route: string;
  calls: number;
  totalBytes: number;
  averageBytes: number;
  maximumBytes: number;
  totalRows: number;
  base64Responses: number;
  lastSeenAt: string;
};

const ONE_HOUR_MS = 60 * 60 * 1_000;
const MAX_EVENTS_PER_INSTANCE = 10_000;
const STORE_KEY = "__BOTLY_EGRESS_DIAGNOSTICS__";
const encoder = new TextEncoder();
const setDiagnosticResponseHeaders = createServerOnlyFn(
  (headers: Record<string, string>) => setResponseHeaders(headers as never),
);

function diagnosticStore(): DiagnosticStore {
  const scope = globalThis as typeof globalThis & {
    [STORE_KEY]?: DiagnosticStore;
  };
  scope[STORE_KEY] ??= { events: [], lastConsoleReportAt: 0 };
  return scope[STORE_KEY];
}

function serializedPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

export function payloadContainsBase64(payload: unknown): boolean {
  const serialized = serializedPayload(payload);
  return (
    /data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/i.test(serialized)
    || /"(?:base64|imageDataUrl)"\s*:\s*"[a-z0-9+/]{64,}={0,2}"/i.test(serialized)
  );
}

export function payloadBytes(payload: unknown): number {
  return encoder.encode(serializedPayload(payload)).byteLength;
}

export function payloadRows(payload: unknown): number {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== "object") return 0;
  const value = payload as Record<string, unknown>;
  for (const key of ["items", "rows", "products", "orders", "notifications", "result", "data"]) {
    if (Array.isArray(value[key])) return value[key].length;
    if (value[key] && typeof value[key] === "object") {
      const nested = payloadRows(value[key]);
      if (nested > 0) return nested;
    }
  }
  return 1;
}

function shortFingerprint(value?: string): string | null {
  if (!value) return null;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function diagnosticIdentity(value?: string): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, "");
  return compact.length <= 4 ? compact : `***${compact.slice(-4)}`;
}

export function diagnosticSession(token?: string): string | undefined {
  return shortFingerprint(token) ?? undefined;
}

function prune(store: DiagnosticStore, now: number) {
  const cutoff = now - ONE_HOUR_MS;
  store.events = store.events
    .filter((event) => Date.parse(event.timestamp) >= cutoff)
    .slice(-MAX_EVENTS_PER_INSTANCE);
}

export function getEgressDiagnosticReport(): {
  generatedAt: string;
  windowMinutes: number;
  instanceScope: true;
  totalCalls: number;
  totalBytes: number;
  topRoutes: EgressRouteSummary[];
} {
  const store = diagnosticStore();
  const now = Date.now();
  prune(store, now);
  const summaries = new Map<string, EgressRouteSummary>();
  for (const event of store.events) {
    const current = summaries.get(event.route) ?? {
      route: event.route,
      calls: 0,
      totalBytes: 0,
      averageBytes: 0,
      maximumBytes: 0,
      totalRows: 0,
      base64Responses: 0,
      lastSeenAt: event.timestamp,
    };
    current.calls += 1;
    current.totalBytes += event.responseBytes;
    current.maximumBytes = Math.max(current.maximumBytes, event.responseBytes);
    current.totalRows += event.rows;
    current.base64Responses += event.containsBase64 ? 1 : 0;
    if (event.timestamp > current.lastSeenAt) current.lastSeenAt = event.timestamp;
    summaries.set(event.route, current);
  }
  const topRoutes = [...summaries.values()]
    .map((summary) => ({
      ...summary,
      averageBytes: Math.round(summary.totalBytes / Math.max(1, summary.calls)),
    }))
    .sort((a, b) => b.totalBytes - a.totalBytes)
    .slice(0, 20);
  return {
    generatedAt: new Date(now).toISOString(),
    windowMinutes: 60,
    instanceScope: true,
    totalCalls: store.events.length,
    totalBytes: store.events.reduce((sum, event) => sum + event.responseBytes, 0),
    topRoutes,
  };
}

export function recordEgressDiagnostic(input: EgressDiagnosticInput): EgressDiagnosticEvent {
  const now = Date.now();
  const responseBytes = input.responseBytes ?? payloadBytes(input.payload);
  const rows = input.rows ?? payloadRows(input.payload);
  const containsBase64 = input.containsBase64 ?? payloadContainsBase64(input.payload);
  const event: EgressDiagnosticEvent = {
    route: input.route,
    responseBytes,
    rows,
    containsBase64,
    timestamp: new Date(now).toISOString(),
    user: input.user ?? null,
    session: input.session ?? null,
    params: {
      limit: input.params?.limit,
      page: input.params?.page,
      cursor: input.params?.cursor ? "[present]" : null,
    },
    cacheControl: input.cacheControl ?? null,
    status: input.status ?? 200,
  };

  const store = diagnosticStore();
  store.events.push(event);
  prune(store, now);
  console.info(`[BOTLY_EGRESS] ${JSON.stringify(event)}`);

  if (now - store.lastConsoleReportAt >= 60_000) {
    store.lastConsoleReportAt = now;
    console.info(`[BOTLY_EGRESS_TOP20] ${JSON.stringify(getEgressDiagnosticReport())}`);
  }

  if (input.setHeaders) {
    try {
      setDiagnosticResponseHeaders({
        "X-Response-Bytes": String(responseBytes),
        "X-Rows-Count": String(rows),
        "X-Contains-Base64": String(containsBase64),
      });
    } catch {
      // A direct Response route sets the same headers on the Response object.
    }
  }
  return event;
}

export function diagnoseServerResult<T>(
  route: string,
  payload: T,
  context: Omit<EgressDiagnosticInput, "route" | "payload" | "setHeaders"> = {},
): T {
  recordEgressDiagnostic({ route, payload, ...context, setHeaders: true });
  return payload;
}

export function diagnosticResponse(
  route: string,
  body: BodyInit | null,
  init: ResponseInit,
  context: Omit<EgressDiagnosticInput, "route" | "responseBytes" | "setHeaders"> & {
    responseBytes: number;
  },
): Response {
  const event = recordEgressDiagnostic({
    route,
    ...context,
    status: init.status ?? 200,
  });
  const headers = new Headers(init.headers);
  headers.set("X-Response-Bytes", String(event.responseBytes));
  headers.set("X-Rows-Count", String(event.rows));
  headers.set("X-Contains-Base64", String(event.containsBase64));
  return new Response(body, { ...init, headers });
}
