import { createFileRoute } from "@tanstack/react-router";

import { appendEvent } from "@/lib/eventStore.server";
import { getActiveConnections } from "@/lib/meta/connections";
import { needsRefresh, isExpired, refreshConnectionToken } from "@/lib/meta/token-refresh";
import { fetchInstagramMedia, fetchFacebookPosts } from "@/lib/meta/graph-api";
import { importMediaBatch, type ImportSummary } from "@/lib/meta/import";
import { throttle, isRateLimitError } from "@/lib/meta/rate-limit";
import type { MetaConnection } from "@/lib/meta/types";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function getCronSecret() {
  return process.env.CRON_SECRET;
}

// Authorize the cron request via Authorization: Bearer <secret> or ?secret=.
function isAuthorized(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) return false; // Disabled until configured (fail closed).
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("secret");
  const fromHeader = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return fromQuery === secret || fromHeader === secret;
}

// Incrementally sync one connection: refresh token if needed, fetch media newer
// than lastSyncedAt, import, then persist the new sync watermark.
async function syncConnection(connection: MetaConnection): Promise<ImportSummary | null> {
  let conn = connection;

  if (isExpired(conn)) {
    await refreshConnectionToken(conn); // marks it expired; merchant must reconnect
    return null;
  }
  if (needsRefresh(conn)) {
    conn = await refreshConnectionToken(conn);
  }

  let summary: ImportSummary | null = null;

  try {
    if (conn.instagramBusinessAccountId) {
      await throttle();
      const media = await fetchInstagramMedia(conn.instagramBusinessAccountId, conn.accessToken, {
        sinceIso: conn.lastSyncedAt,
        limit: 25,
      });
      summary = await importMediaBatch(conn, media, "instagram");
    } else if (conn.facebookPageId) {
      await throttle();
      const posts = await fetchFacebookPosts(conn.facebookPageId, conn.accessToken, {
        sinceIso: conn.lastSyncedAt,
        limit: 25,
      });
      summary = await importMediaBatch(conn, posts, "facebook");
    }

    // Advance the incremental-sync watermark.
    await appendEvent("botly_meta_connection", {
      kind: "connection",
      ...conn,
      lastSyncedAt: new Date().toISOString(),
      lastImportSummary: summary,
    });
  } catch (error) {
    if (isRateLimitError(error)) {
      console.warn("[Cron Sync] Rate limited, backing off for", conn.merchantId);
    } else {
      console.error("[Cron Sync] Failed for merchant", conn.merchantId, error);
    }
  }

  return summary;
}

export const Route = createFileRoute("/api/cron/sync-social")({
  server: {
    handlers: {
      // Triggered by an external scheduler (e.g. Netlify scheduled function,
      // GitHub Action cron, or any cron-as-a-service hitting this URL).
      GET: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: jsonHeaders,
          });
        }

        const connections = await getActiveConnections();
        const results: Array<{ merchantId: string; summary: ImportSummary | null }> = [];

        // Sequential (concurrency = 1) to respect Graph API rate limits.
        for (const connection of connections) {
          const summary = await syncConnection(connection);
          results.push({ merchantId: connection.merchantId, summary });
        }

        const totals = results.reduce(
          (acc, r) => {
            if (r.summary) {
              acc.imported += r.summary.imported;
              acc.pendingReview += r.summary.pendingReview;
              acc.skippedDuplicates += r.summary.skippedDuplicates;
              acc.failed += r.summary.failed;
            }
            return acc;
          },
          { imported: 0, pendingReview: 0, skippedDuplicates: 0, failed: 0 },
        );

        return new Response(JSON.stringify({ ok: true, connections: connections.length, totals }), {
          status: 200,
          headers: jsonHeaders,
        });
      },
    },
  },
});
