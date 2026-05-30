import { redirect } from "@tanstack/react-router";
import { ADMIN_SESSION_KEY } from "./adminMockData";

// Client-side guard for admin pages. 
// TODO(supabase): replace with beforeLoad that awaits supabase.auth.getUser() 
// and checks has_role(uid, 'admin').
export function requireAdminClient() {
  // Skip on server-side rendering
  if (typeof window === "undefined") return;
  
  const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
  
  // Session exists and is valid
  if (raw) return;
  
  // No valid session - redirect to login
  throw redirect({ to: "/admin/login" });
}
