// Admin Session Management
// Stores admin authentication state in sessionStorage
import { useEffect, useState } from "react";

export interface AdminSession {
  token: string;
  adminId: string;
  whatsapp: string;
  signedInAt: string;
}

const SESSION_KEY = "botly.admin.session";

export function writeAdminSession(session: AdminSession): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function readAdminSession(): AdminSession | null {
  if (typeof sessionStorage === "undefined") return null;
  const data = sessionStorage.getItem(SESSION_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data) as AdminSession;
  } catch {
    return null;
  }
}

export function clearAdminSession(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
}

export function isAdminAuthenticated(): boolean {
  const session = readAdminSession();
  return !!session?.token;
}

export function getAdminToken(): string | null {
  const session = readAdminSession();
  return session?.token ?? null;
}

export function useAdminSession() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(readAdminSession());
    setReady(true);
  }, []);

  return { session, ready };
}
