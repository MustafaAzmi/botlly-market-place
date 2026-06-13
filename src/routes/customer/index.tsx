import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { readCustomerSession } from "@/lib/customerSession";

export const Route = createFileRoute("/customer/")({
  component: CustomerIndex,
});

function CustomerIndex() {
  const navigate = useNavigate();

  useEffect(() => {
    const session = readCustomerSession();
    if (!session) {
      navigate({ to: "/customer/auth" });
    } else {
      // In the future, redirect to the full dashboard here
      navigate({ to: "/customer/dashboard" });
    }
  }, [navigate]);

  return null;
}
