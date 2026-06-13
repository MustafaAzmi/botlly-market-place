export interface MerchantSession {
  token?: string;
  merchantId?: string;
  storeName?: string;
  storeSlug?: string;
  whatsapp?: string;
  email?: string;
  bio?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  deliveryPhone?: string;
  signedInAt?: string;
  updatedAt?: string;
}

export const merchantSessionKey = "botly.merchant.session";

export function readMerchantSession(): MerchantSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(merchantSessionKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as MerchantSession;
  } catch {
    return null;
  }
}

export function writeMerchantSession(nextSession: MerchantSession) {
  if (typeof window === "undefined") return;

  const currentSession = readMerchantSession() ?? {};
  const mergedSession = Object.fromEntries(
    Object.entries({
      ...currentSession,
      ...nextSession,
      updatedAt: new Date().toISOString(),
    }).filter(([, value]) => value !== undefined),
  ) as MerchantSession;

  window.localStorage.setItem(merchantSessionKey, JSON.stringify(mergedSession));
}

export function clearMerchantSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(merchantSessionKey);
  window.sessionStorage.removeItem(merchantSessionKey);
}
