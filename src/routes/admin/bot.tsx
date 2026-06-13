import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { requireAdminClient } from "@/lib/adminGuard";

export const Route = createFileRoute("/admin/bot")({
  beforeLoad: () => requireAdminClient(),
  component: AdminBotRedirect,
});

function AdminBotRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/admin/mediators", replace: true });
  }, [navigate]);

  return null;
}
