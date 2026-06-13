// Client-side customer session state (localStorage).
// Similar to merchantSession, but for WhatsApp-first customers.
//
// Sessions are PERMANENT: the customer registers once and stays logged in on
// this device until they explicitly log out. The profile itself lives in the
// database (botly_customer events) keyed by WhatsApp number.

import type { CustomerProfile } from "@/lib/customer.functions";

const SESSION_KEY = "botly_customer_session";

export interface CustomerSessionData {
  customer: CustomerProfile;
  token: string;
}

export function writeCustomerSession(customer: CustomerProfile, token: string) {
  const session: CustomerSessionData = { customer, token };
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
    if (!session?.customer?.whatsapp) return null;
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
