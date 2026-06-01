// Token lifecycle management.
//
// Long-lived Meta user tokens last ~60 days. We proactively refresh any token
// within REFRESH_WINDOW_DAYS of expiry, and mark connections whose token has
// already expired as 'expired' so sync skips them and the merchant is prompted
// to reconnect.

import { appendEvent } from "@/lib/eventStore.server";
import { extendAccessToken } from "./oauth";
import type { MetaConnection } from "./types";

const REFRESH_WINDOW_DAYS = 7;

function daysUntil(iso: string | null): number {
  if (!iso) return Infinity;
  return (new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
}

export function needsRefresh(connection: MetaConnection): boolean {
  return daysUntil(connection.tokenExpiresAt) <= REFRESH_WINDOW_DAYS;
}

export function isExpired(connection: MetaConnection): boolean {
  return daysUntil(connection.tokenExpiresAt) <= 0;
}

// Refresh a single connection's token. Persists the updated connection (or marks
// it expired/revoked on failure). Returns the connection to use going forward.
export async function refreshConnectionToken(connection: MetaConnection): Promise<MetaConnection> {
  if (isExpired(connection)) {
    const expired: MetaConnection = { ...connection, status: "expired" };
    await appendEvent("botly_meta_connection", { kind: "connection", ...expired });
    return expired;
  }

  try {
    const refreshed = await extendAccessToken(connection.accessToken);
    const updated: MetaConnection = {
      ...connection,
      accessToken: refreshed.access_token,
      tokenExpiresAt: refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        : connection.tokenExpiresAt,
      status: "active",
    };
    await appendEvent("botly_meta_connection", { kind: "connection", ...updated });
    return updated;
  } catch (error) {
    console.error("[Token Refresh] Failed for merchant", connection.merchantId, error);
    // A failed refresh on an otherwise-valid token is non-fatal; keep using it.
    return connection;
  }
}
