import { createFileRoute } from "@tanstack/react-router";

import { getString, listEvents } from "@/lib/eventStore.server";

// Public product image endpoint. Manually uploaded images are stored as
// base64 data: URLs in the product event — WhatsApp can only deliver public
// https links, so the bot points it here and we stream the decoded image.
// Link-based images just redirect to their original URL.

export const Route = createFileRoute("/api/product-image/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const productId = getString((params as Record<string, unknown>).id);
        if (!productId) return new Response("Not found", { status: 404 });

        // Events are newest-first, so the first row per productId is the
        // latest version of the product (edits append new events).
        const rows = await listEvents("botly_product");
        const row = rows.find(
          (r) => getString(r.payload?.productId) === productId || r.id === productId,
        );
        if (!row) return new Response("Not found", { status: 404 });

        const imageUrl = getString(row.payload?.imageUrl);
        if (/^https?:\/\//i.test(imageUrl)) {
          return new Response(null, {
            status: 302,
            headers: { location: imageUrl, "cache-control": "public, max-age=3600" },
          });
        }

        const dataUrl = imageUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
        if (!dataUrl) return new Response("Not found", { status: 404 });

        let body: Blob;
        try {
          const bytes = Uint8Array.from(atob(dataUrl[2]), (c) => c.charCodeAt(0));
          body = new Blob([bytes], { type: dataUrl[1] });
        } catch {
          return new Response("Invalid image", { status: 422 });
        }

        return new Response(body, {
          headers: {
            "content-type": dataUrl[1],
            "cache-control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
