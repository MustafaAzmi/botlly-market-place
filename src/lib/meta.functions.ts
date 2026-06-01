import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { appendEvent, listEvents, authorizeMerchantId, getString } from "@/lib/eventStore.server";
import { buildLoginUrl, isMetaConfigured } from "@/lib/meta/oauth";
import { getMerchantConnections } from "@/lib/meta/connections";
import { needsRefresh, isExpired, refreshConnectionToken } from "@/lib/meta/token-refresh";
import { fetchInstagramMedia, fetchFacebookPosts } from "@/lib/meta/graph-api";
import { importMediaBatch } from "@/lib/meta/import";
import { throttle } from "@/lib/meta/rate-limit";
import type { MetaConnection } from "@/lib/meta/types";

const tokenInput = z.object({
  token: z.string().trim().min(20).max(300),
});

export type MetaConnectionView = {
  platform: string;
  facebookPageName: string | null;
  instagramUsername: string | null;
  status: string;
  connectedAt: string;
  lastSyncedAt: string | null;
};

function randomState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// Build the Facebook Login URL for a merchant. Persists a short-lived pending
// state mapped to the merchant so the OAuth callback can attribute + CSRF-check.
export const getMetaConnectUrl = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    if (!isMetaConfigured()) {
      throw new Error("ربط Meta غير مفعّل حالياً. تواصل مع الدعم.");
    }

    const merchantId = await authorizeMerchantId(data.token);
    const state = randomState();

    await appendEvent("botly_meta_connection", {
      kind: "oauth_state",
      state,
      merchantId,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    return { url: buildLoginUrl(state) };
  });

// List a merchant's active Meta connections (most recent state per platform).
export const listMetaConnections = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }): Promise<MetaConnectionView[]> => {
    const merchantId = await authorizeMerchantId(data.token);
    const rows = await listEvents("botly_meta_connection");

    const views: MetaConnectionView[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const payload = row.payload ?? {};
      if (payload.kind !== "connection") continue;
      if (getString(payload.merchantId) !== merchantId) continue;

      // Most recent row per facebook page wins (append-only "current state").
      const key =
        getString(payload.facebookPageId) || getString(payload.instagramBusinessAccountId);
      if (seen.has(key)) continue;
      seen.add(key);

      const conn = payload as unknown as MetaConnection;
      views.push({
        platform: conn.instagramBusinessAccountId ? "instagram" : "facebook",
        facebookPageName: conn.facebookPageName ?? null,
        instagramUsername: conn.instagramUsername ?? null,
        status: conn.status ?? "active",
        connectedAt: conn.connectedAt ?? "",
        lastSyncedAt: conn.lastSyncedAt ?? null,
      });
    }

    return views;
  });

// Whether the platform has Meta OAuth configured (drives the dashboard UI).
export const getMetaStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { configured: isMetaConfigured() };
});

// Manually trigger an incremental sync for the merchant's connected accounts.
export const syncMerchantPosts = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    const merchantId = await authorizeMerchantId(data.token);
    const connections = await getMerchantConnections(merchantId);

    let imported = 0;
    let pendingReview = 0;
    let skipped = 0;

    for (const base of connections) {
      if (base.status !== "active") continue;

      let conn = base;
      if (isExpired(conn)) {
        await refreshConnectionToken(conn);
        continue;
      }
      if (needsRefresh(conn)) conn = await refreshConnectionToken(conn);

      try {
        let summary = null;
        if (conn.instagramBusinessAccountId) {
          await throttle();
          const media = await fetchInstagramMedia(
            conn.instagramBusinessAccountId,
            conn.accessToken,
            { sinceIso: conn.lastSyncedAt, limit: 25 },
          );
          summary = await importMediaBatch(conn, media, "instagram");
        } else if (conn.facebookPageId) {
          await throttle();
          const posts = await fetchFacebookPosts(conn.facebookPageId, conn.accessToken, {
            sinceIso: conn.lastSyncedAt,
            limit: 25,
          });
          summary = await importMediaBatch(conn, posts, "facebook");
        }

        if (summary) {
          imported += summary.imported;
          pendingReview += summary.pendingReview;
          skipped += summary.skippedDuplicates;
        }

        await appendEvent("botly_meta_connection", {
          kind: "connection",
          ...conn,
          lastSyncedAt: new Date().toISOString(),
          lastImportSummary: summary,
        });
      } catch (error) {
        console.error("[Manual Sync] Failed for merchant", merchantId, error);
        throw new Error("تعذر استيراد المنشورات. حاول مرة ثانية بعد قليل.");
      }
    }

    return { imported, pendingReview, skipped };
  });

// Disconnect all of a merchant's Meta connections (revoke locally). Imported
// products are preserved; only the connection + token are deactivated.
export const disconnectMeta = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenInput.parse(d))
  .handler(async ({ data }) => {
    const merchantId = await authorizeMerchantId(data.token);
    const connections = await getMerchantConnections(merchantId);
    for (const conn of connections) {
      if (conn.status === "revoked") continue;
      await appendEvent("botly_meta_connection", {
        kind: "connection",
        ...conn,
        status: "revoked",
        accessToken: "",
      });
    }
    return { ok: true };
  });
