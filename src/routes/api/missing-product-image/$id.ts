import { createFileRoute } from "@tanstack/react-router";

import { getString, listEvents } from "@/lib/eventStore.server";

export const Route = createFileRoute("/api/missing-product-image/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const missingRequestId = getString((params as Record<string, unknown>).id);
        if (!missingRequestId) return new Response("Not found", { status: 404 });

        const rows = await listEvents("botly_order");
        const row = rows.find((event) => {
          const p = event.payload ?? {};
          return (
            getString(p.missingRequestId) === missingRequestId ||
            getString(p.orderId) === missingRequestId ||
            event.id === missingRequestId
          );
        });
        if (!row) return new Response("Not found", { status: 404 });

        const imageUrl = getString(row.payload?.imageUrl);
        if (/^https?:\/\//i.test(imageUrl) && !imageUrl.includes("/api/missing-product-image/")) {
          return new Response(null, {
            status: 302,
            headers: { location: imageUrl, "cache-control": "public, max-age=3600" },
          });
        }

        const dataUrl = getString(row.payload?.imageDataUrl).match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
        if (!dataUrl) return new Response("Not found", { status: 404 });

        try {
          const bytes = Uint8Array.from(atob(dataUrl[2]), (char) => char.charCodeAt(0));
          return new Response(new Blob([bytes], { type: dataUrl[1] }), {
            headers: {
              "content-type": dataUrl[1],
              "cache-control": "public, max-age=86400",
            },
          });
        } catch {
          return new Response("Invalid image", { status: 422 });
        }
      },
    },
  },
});
