// Import pipeline: social posts -> structured, searchable products.
//
// Per post:
//   1. preserve the raw post (botly_social_post) so nothing is ever lost
//   2. run AI analysis (analyzePost) -> structured fields + confidence
//   3. store a structured product (botly_product) linked to merchant + post + media
//
// Design rules honoured here:
//   - never break the whole import because one post failed
//   - low-confidence products are marked pending_review, not trusted blindly
//   - duplicate posts (same postId) are skipped (idempotent re-sync)
//   - incremental: callers pass the last sync timestamp

import { appendEvent, listEvents, getString } from "@/lib/eventStore.server";
import { analyzePost } from "./product-analyzer";
import { toRawSocialPost } from "./graph-api";
import type { GraphMediaItem, MetaConnection, SocialPlatform } from "./types";

// Below this confidence, a product needs human confirmation before it surfaces
// to customers.
const PENDING_REVIEW_THRESHOLD = 0.55;

export interface ImportSummary {
  fetched: number;
  imported: number;
  skippedDuplicates: number;
  pendingReview: number;
  failed: number;
  latestTimestamp: string | null;
}

// Set of post ids already imported for this merchant (dedup across re-syncs).
async function loadImportedPostIds(merchantId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const rows = await listEvents("botly_product");
  for (const row of rows) {
    if (getString(row.payload?.merchantId) === merchantId) {
      const postId = getString(row.payload?.postId);
      if (postId) ids.add(postId);
    }
  }
  return ids;
}

// Process a batch of Graph media items for one connected merchant.
export async function importMediaBatch(
  connection: MetaConnection,
  items: GraphMediaItem[],
  platform: SocialPlatform,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    fetched: items.length,
    imported: 0,
    skippedDuplicates: 0,
    pendingReview: 0,
    failed: 0,
    latestTimestamp: connection.lastSyncedAt,
  };

  const alreadyImported = await loadImportedPostIds(connection.merchantId);

  for (const item of items) {
    try {
      const raw = toRawSocialPost(item, connection.merchantId, platform);

      // Idempotent: skip posts we've already turned into products.
      if (alreadyImported.has(raw.postId)) {
        summary.skippedDuplicates += 1;
        continue;
      }

      // 1. Preserve the raw post first — this is the safety net.
      await appendEvent("botly_social_post", { ...raw });

      // 2. AI analysis (always returns something thanks to fallback).
      const extracted = await analyzePost(raw);

      const status =
        extracted.confidenceScore < PENDING_REVIEW_THRESHOLD ? "pending_review" : "active";
      if (status === "pending_review") summary.pendingReview += 1;

      // 3. Store structured product, linked to merchant + post + platform + media.
      // Kept on event_type='botly_product' so search/catalog treat imported and
      // manual products uniformly.
      await appendEvent("botly_product", {
        productId: crypto.randomUUID(),
        merchantId: connection.merchantId,
        source: platform,
        platform,
        postId: raw.postId,
        postUrl: raw.permalink,
        imageUrl: raw.mediaUrls[0] ?? "",
        mediaUrls: raw.mediaUrls,
        // Structured fields
        title: extracted.title,
        description: extracted.description,
        category: extracted.category,
        brand: extracted.brand,
        currentPrice: extracted.price ?? 0,
        currency: extracted.currency,
        color: extracted.color,
        condition: extracted.condition,
        keywords: extracted.keywords,
        // Precomputed search string powers the pg_trgm index.
        searchText: [
          extracted.title,
          extracted.category,
          extracted.brand,
          extracted.color,
          ...extracted.keywords,
        ]
          .filter(Boolean)
          .join(" "),
        availability: extracted.availability,
        confidenceScore: extracted.confidenceScore,
        confidenceReason: extracted.confidenceReason,
        status,
        requiresReview: status === "pending_review",
        importedAt: raw.importedAt,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      summary.imported += 1;
      alreadyImported.add(raw.postId);

      if (!summary.latestTimestamp || raw.timestamp > summary.latestTimestamp) {
        summary.latestTimestamp = raw.timestamp;
      }
    } catch (error) {
      // One bad post must never abort the whole batch.
      console.error("[Import] Failed to import post", item.id, error);
      summary.failed += 1;
    }
  }

  return summary;
}
