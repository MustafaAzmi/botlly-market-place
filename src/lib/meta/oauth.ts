// Official Meta OAuth (Facebook Login) helpers.
//
// This is the ONLY supported way to connect a merchant account. There is no
// scraping, no Puppeteer/Selenium, no unofficial Instagram tooling. We use
// Facebook Login + the Instagram Graph API exclusively.
//
// Flow:
//   1. buildLoginUrl()        -> redirect merchant to Facebook
//   2. Facebook redirects back -> ?code=...
//   3. exchangeCodeForToken()  -> short-lived user token
//   4. extendAccessToken()     -> long-lived (~60 day) token
//   5. fetchPagesAndInstagram()-> pages + linked IG business account

import type { GraphTokenResponse, GraphPage } from "./types";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const BOTLY_META_APP_ID = "1762515044432140";
const BOTLY_META_REDIRECT_URI = "https://bot-lly.tech/api/auth/meta/callback";

// Permissions required to read a merchant's pages and Instagram media.
const REQUIRED_SCOPES = [
  "public_profile",
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "instagram_basic",
];

export function getMetaAppId(): string | undefined {
  return process.env.META_OAUTH_APP_ID ?? process.env.META_APP_ID ?? BOTLY_META_APP_ID;
}

export function getMetaAppSecret(): string | undefined {
  return process.env.META_OAUTH_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET;
}

export function getMetaRedirectUri(): string | undefined {
  return process.env.META_OAUTH_REDIRECT_URI ?? BOTLY_META_REDIRECT_URI;
}

export function isMetaConfigured(): boolean {
  return Boolean(getMetaAppId() && getMetaAppSecret() && getMetaRedirectUri());
}

// Build the Facebook Login dialog URL. `state` carries the merchant identity so
// the callback can attribute the connection (and protect against CSRF).
export function buildLoginUrl(state: string): string {
  const appId = getMetaAppId();
  const redirectUri = getMetaRedirectUri();
  if (!appId || !redirectUri) {
    throw new Error("Meta OAuth is not configured (missing app id or redirect uri).");
  }

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: REQUIRED_SCOPES.join(","),
  });

  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

export function getRequiredScopes(): string[] {
  return [...REQUIRED_SCOPES];
}

export async function fetchGrantedScopes(accessToken: string): Promise<string[]> {
  const params = new URLSearchParams({ access_token: accessToken });
  const response = await fetch(`${GRAPH_BASE}/me/permissions?${params.toString()}`);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Failed to fetch granted permissions (${response.status}): ${detail}`);
  }
  const json = (await response.json()) as {
    data?: Array<{ permission?: string; status?: string }>;
  };
  return (json.data ?? [])
    .filter((scope) => scope.status === "granted" && scope.permission)
    .map((scope) => scope.permission!);
}

// Exchange the OAuth authorization code for a short-lived user access token.
export async function exchangeCodeForToken(code: string): Promise<GraphTokenResponse> {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  const redirectUri = getMetaRedirectUri();
  if (!appId || !appSecret || !redirectUri) {
    throw new Error("Meta OAuth is not configured.");
  }

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Token exchange failed (${response.status}): ${detail}`);
  }
  return (await response.json()) as GraphTokenResponse;
}

// Upgrade a short-lived token to a long-lived (~60 day) token.
export async function extendAccessToken(shortLivedToken: string): Promise<GraphTokenResponse> {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  if (!appId || !appSecret) {
    throw new Error("Meta OAuth is not configured.");
  }

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const response = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Token extension failed (${response.status}): ${detail}`);
  }
  return (await response.json()) as GraphTokenResponse;
}

// Identify the authenticated Facebook user.
export async function fetchFacebookUser(
  accessToken: string,
): Promise<{ id: string; name?: string }> {
  const params = new URLSearchParams({ access_token: accessToken, fields: "id,name" });
  const response = await fetch(`${GRAPH_BASE}/me?${params.toString()}`);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Failed to fetch Facebook user (${response.status}): ${detail}`);
  }
  return (await response.json()) as { id: string; name?: string };
}

// Fetch the merchant's pages and the Instagram Business account linked to each.
export async function fetchPagesAndInstagram(accessToken: string): Promise<GraphPage[]> {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "id,name,access_token,instagram_business_account{id,username}",
  });
  const response = await fetch(`${GRAPH_BASE}/me/accounts?${params.toString()}`);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Failed to fetch pages (${response.status}): ${detail}`);
  }
  const json = (await response.json()) as { data?: GraphPage[] };
  return json.data ?? [];
}
