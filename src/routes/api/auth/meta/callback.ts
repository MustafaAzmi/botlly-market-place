import { createFileRoute } from "@tanstack/react-router";

import { appendEvent, listEvents, getString } from "@/lib/eventStore.server";
import {
  exchangeCodeForToken,
  extendAccessToken,
  fetchFacebookUser,
  fetchPagesAndInstagram,
  getRequiredScopes,
  isMetaConfigured,
} from "@/lib/meta/oauth";
import { fetchInstagramMedia } from "@/lib/meta/graph-api";
import { importMediaBatch } from "@/lib/meta/import";
import type { MetaConnection } from "@/lib/meta/types";

const DASHBOARD_OK = "/dashboard?meta=connected";
const DASHBOARD_ERR = "/dashboard?meta=error";

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { location } });
}

// Resolve the merchant behind a pending OAuth state (CSRF + attribution).
async function resolveMerchantFromState(state: string): Promise<string | null> {
  const rows = await listEvents("botly_meta_connection");
  const match = rows.find(
    (row) =>
      row.payload?.kind === "oauth_state" &&
      getString(row.payload?.state) === state &&
      getString(row.payload?.status) === "pending",
  );
  return match ? getString(match.payload?.merchantId) || null : null;
}

export const Route = createFileRoute("/api/auth/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isMetaConfigured()) return redirect(DASHBOARD_ERR);

        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        // Merchant denied permissions, or invalid request.
        if (error || !code || !state) return redirect(DASHBOARD_ERR);

        const merchantId = await resolveMerchantFromState(state);
        if (!merchantId) return redirect(DASHBOARD_ERR);

        try {
          // 1. code -> short-lived token -> long-lived token.
          const shortLived = await exchangeCodeForToken(code);
          const longLived = await extendAccessToken(shortLived.access_token);
          const accessToken = longLived.access_token;
          const expiresAt = longLived.expires_in
            ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
            : null;

          // 2. Identify user + pages + linked Instagram business account.
          const fbUser = await fetchFacebookUser(accessToken);
          const pages = await fetchPagesAndInstagram(accessToken);

          // Prefer a page that has an Instagram business account attached.
          const page = pages.find((p) => p.instagram_business_account?.id) ?? pages[0] ?? null;
          const igAccountId = page?.instagram_business_account?.id ?? null;
          const pageAccessToken = page?.access_token ?? null;

          const connection: MetaConnection = {
            merchantId,
            accessToken,
            pageAccessToken,
            tokenExpiresAt: expiresAt,
            facebookUserId: fbUser.id,
            facebookPageId: page?.id ?? null,
            facebookPageName: page?.name ?? null,
            instagramBusinessAccountId: igAccountId,
            instagramUsername: page?.instagram_business_account?.username ?? null,
            scopes: getRequiredScopes(),
            connectedAt: new Date().toISOString(),
            lastSyncedAt: null,
            status: "active",
          };

          // 3. Persist the connection.
          await appendEvent("botly_meta_connection", {
            kind: "connection",
            ...connection,
          });

          // 4. Initial import (best-effort — never block the redirect on it).
          if (igAccountId) {
            try {
              const media = await fetchInstagramMedia(igAccountId, pageAccessToken ?? accessToken, {
                limit: 25,
              });
              const summary = await importMediaBatch(connection, media, "instagram");
              await appendEvent("botly_meta_connection", {
                kind: "connection",
                ...connection,
                lastSyncedAt: new Date().toISOString(),
                lastImportSummary: summary,
              });
            } catch (importError) {
              console.error("[Meta callback] Initial import failed", importError);
            }
          }

          return redirect(DASHBOARD_OK);
        } catch (err) {
          console.error("[Meta callback] OAuth flow failed", err);
          return redirect(DASHBOARD_ERR);
        }
      },
    },
  },
});
