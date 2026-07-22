import { createFileRoute, redirect } from "@tanstack/react-router";

import { pwaHeadLinks, pwaHeadMeta } from "@/lib/pwa";

export const Route = createFileRoute("/dashboard/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/orders" });
  },
  head: () => ({
    meta: [{ title: "الطلبات - Botly" }, ...pwaHeadMeta("merchant")],
    links: pwaHeadLinks("merchant"),
  }),
});
