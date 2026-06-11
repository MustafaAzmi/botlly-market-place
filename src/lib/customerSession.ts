// Client-side customer session state (localStorage).
// Similar to merchantSession, but for WhatsApp-first customers.

import type { CustomerProfile } from "@/lib/customer.functions";

const SESSION_KEY = "botly_customer_session";

export interface CustomerSessionData {
  customer: CustomerProfile;
  token: string;
  expiresAt: number; // Timestamp when session expires (7 days)
}

export function writeCustomerSession(customer: CustomerProfile, token: string) {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const session: CustomerSessionData = { customer, token, expiresAt };
  if (typeof window !== "undefined") {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}

export function readCustomerSession(): CustomerSessionData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as CustomerSessionData;
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearCustomerSession() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function getCustomerPhone(): string | null {
  const session = readCustomerSession();
  return session?.customer.whatsapp ?? null;
}
