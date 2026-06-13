import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { readCustomerSession } from "@/lib/customerSession";

export const Route = createFileRoute("/customer/__layout")({
  component: CustomerLayout,
});

function CustomerLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to auth if not logged in (only for protected routes)
    const pathname = window.location.pathname;
    if (!pathname.includes("/customer/auth") && !pathname.includes("/customer/app")) {
      const session = readCustomerSession();
      if (!session) {
        navigate({ to: "/customer/auth" });
      }
    }
  }, [navigate]);

  return <Outlet />;
}
