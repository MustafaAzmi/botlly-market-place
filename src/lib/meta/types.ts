// Types for the Meta (Facebook/Instagram) social-commerce integration.

export type SocialPlatform = "instagram" | "facebook";

// A merchant's connected Meta account. Stored as event_type='botly_meta_connection'.
export interface MetaConnection {
  merchantId: string;
  // Long-lived user access token (official Meta token, never a scraped session).
  accessToken: string;
  tokenExpiresAt: string | null;
  facebookUserId: string;
  facebookPageId: string | null;
  facebookPageName: string | null;
  // Instagram Business/Creator account linked to the page.
  instagramBusinessAccountId: string | null;
  instagramUsername: string | null;
  scopes: string[];
  connectedAt: string;
  lastSyncedAt: string | null;
  status: "active" | "expired" | "revoked";
}

// A raw imported social post, preserved verbatim before/after AI analysis so the
// import pipeline never loses data even when extraction fails.
export interface RawSocialPost {
  postId: string;
  merchantId: string;
  platform: SocialPlatform;
  caption: string;
  mediaUrls: string[];
  mediaType: string;
  permalink: string;
  timestamp: string;
  importedAt: string;
}

// Structured product fields extracted by AI from a social post.
export interface ExtractedProduct {
  title: string;
  category: string | null;
  brand: string | null;
  price: number | null;
  currency: string;
  color: string | null;
  condition: "new" | "used" | "refurbished" | "unknown";
  keywords: string[];
  availability: "in_stock" | "out_of_stock" | "unknown";
  description: string;
  confidenceScore: number;
  confidenceReason: string;
}

// Meta Graph API response shapes (minimal subset we consume).
export interface GraphTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface GraphPage {
  id: string;
  name: string;
  access_token?: string;
  instagram_business_account?: { id: string };
}

export interface GraphMediaItem {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  children?: { data?: Array<{ media_url?: string; media_type?: string }> };
}
