// Read-side helpers for merchant Meta connections.
//
// Connections are append-only events (event_type='botly_meta_connection',
// kind='connection'). "Current state" = the most recent connection row per
// facebook page / instagram account. These helpers collapse the event log into
// the live connection set used by sync + token-refresh jobs.

import { listEvents, getString } from "@/lib/eventStore.server";
import type { MetaConnection } from "./types";

function rowToConnection(payload: Record<string, unknown>): MetaConnection {
  return payload as unknown as MetaConnection;
}

function connectionKey(conn: MetaConnection): string {
  return (
    conn.instagramBusinessAccountId ||
    conn.facebookPageId ||
    `${conn.merchantId}:${conn.facebookUserId}`
  );
}

// All live connections across every merchant (latest row per account wins).
export async function getActiveConnections(): Promise<MetaConnection[]> {
  const rows = await listEvents("botly_meta_connection");
  const latest = new Map<string, MetaConnection>();

  // listEvents returns newest-first, so the first row we see per key is current.
  for (const row of rows) {
    const payload = row.payload ?? {};
    if (payload.kind !== "connection") continue;
    const conn = rowToConnection(payload);
    const key = connectionKey(conn);
    if (!latest.has(key)) latest.set(key, conn);
  }

  return [...latest.values()].filter((c) => c.status === "active");
}

// Live connections for a single merchant.
export async function getMerchantConnections(merchantId: string): Promise<MetaConnection[]> {
  const rows = await listEvents("botly_meta_connection");
  const latest = new Map<string, MetaConnection>();

  for (const row of rows) {
    const payload = row.payload ?? {};
    if (payload.kind !== "connection") continue;
    if (getString(payload.merchantId) !== merchantId) continue;
    const conn = rowToConnection(payload);
    const key = connectionKey(conn);
    if (!latest.has(key)) latest.set(key, conn);
  }

  return [...latest.values()];
}
