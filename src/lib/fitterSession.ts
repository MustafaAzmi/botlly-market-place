import type { FitterProfile } from "@/lib/fitter.functions";

const SESSION_KEY = "botly_fitter_session";

export interface FitterSessionData {
  fitter: FitterProfile;
  token: string;
}

export function writeFitterSession(fitter: FitterProfile, token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ fitter, token }));
}

export function readFitterSession(): FitterSessionData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as FitterSessionData;
    if (!session?.token || !session?.fitter?.whatsapp) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearFitterSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}
