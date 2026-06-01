// Official Meta Graph API media fetchers.
//
// Supports incremental syncing: callers pass `since` (the timestamp of the last
// imported post) so we never re-fetch the merchant's entire history on every
// run. Results are capped per call to respect rate limits.

import type { GraphMediaItem, RawSocialPost } from "./types";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const IG_MEDIA_FIELDS =
  "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_url,media_type}";

// Fetch recent Instagram media for a business account. `sinceIso` enables
// incremental syncing; `limit` caps the batch for rate-limit safety.
export async function fetchInstagramMedia(
  instagramBusinessAccountId: string,
  accessToken: string,
  options: { sinceIso?: string | null; limit?: number } = {},
): Promise<GraphMediaItem[]> {
  const { sinceIso, limit = 25 } = options;

  const params = new URLSearchParams({
    access_token: accessToken,
    fields: IG_MEDIA_FIELDS,
    limit: String(Math.min(limit, 50)),
  });
  if (sinceIso) {
    params.set("since", String(Math.floor(new Date(sinceIso).getTime() / 1000)));
  }

  const response = await fetch(
    `${GRAPH_BASE}/${instagramBusinessAccountId}/media?${params.toString()}`,
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Failed to fetch Instagram media (${response.status}): ${detail}`);
  }

  const json = (await response.json()) as { data?: GraphMediaItem[] };
  return json.data ?? [];
}

// Fetch recent Facebook Page posts (with attached photos).
export async function fetchFacebookPosts(
  pageId: string,
  pageAccessToken: string,
  options: { sinceIso?: string | null; limit?: number } = {},
): Promise<GraphMediaItem[]> {
  const { sinceIso, limit = 25 } = options;

  const params = new URLSearchParams({
    access_token: pageAccessToken,
    fields: "id,message,permalink_url,created_time,full_picture,attachments{media_type,media}",
    limit: String(Math.min(limit, 50)),
  });
  if (sinceIso) {
    params.set("since", String(Math.floor(new Date(sinceIso).getTime() / 1000)));
  }

  const response = await fetch(`${GRAPH_BASE}/${pageId}/posts?${params.toString()}`);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Failed to fetch Facebook posts (${response.status}): ${detail}`);
  }

  const json = (await response.json()) as {
    data?: Array<{
      id: string;
      message?: string;
      permalink_url?: string;
      created_time?: string;
      full_picture?: string;
    }>;
  };

  // Normalise FB post shape into the shared GraphMediaItem shape.
  return (json.data ?? []).map((post) => ({
    id: post.id,
    caption: post.message,
    media_type: "IMAGE",
    media_url: post.full_picture,
    permalink: post.permalink_url,
    timestamp: post.created_time,
  }));
}

// Normalise a Graph media item into our RawSocialPost shape.
export function toRawSocialPost(
  item: GraphMediaItem,
  merchantId: string,
  platform: "instagram" | "facebook",
): RawSocialPost {
  const mediaUrls: string[] = [];
  if (item.media_url) mediaUrls.push(item.media_url);
  if (item.thumbnail_url && !mediaUrls.includes(item.thumbnail_url)) {
    mediaUrls.push(item.thumbnail_url);
  }
  for (const child of item.children?.data ?? []) {
    if (child.media_url) mediaUrls.push(child.media_url);
  }

  return {
    postId: item.id,
    merchantId,
    platform,
    caption: item.caption ?? "",
    mediaUrls,
    mediaType: item.media_type ?? "UNKNOWN",
    permalink: item.permalink ?? "",
    timestamp: item.timestamp ?? new Date().toISOString(),
    importedAt: new Date().toISOString(),
  };
}
