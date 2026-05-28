import { redirect } from "@tanstack/react-router";
import { ADMIN_SESSION_KEY } from "./adminMockData";

// Lightweight client-side guard. TODO(supabase): replace with a beforeLoad
// that awaits supabase.auth.getUser() and checks has_role(uid, 'admin').
export function requireAdminClient() {
  if (typeof window === "undefined") return;
  const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
  if (!raw) {
    throw redirect({ to: "/admin/login" });
  }
}
