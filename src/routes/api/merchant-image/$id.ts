import { createFileRoute } from "@tanstack/react-router";

import { getString, latestEventWhere } from "@/lib/eventStore.server";

export const Route = createFileRoute("/api/merchant-image/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const merchantId = getString((params as Record<string, unknown>).id);
        const type = new URL(request.url).searchParams.get("type") === "cover"
          ? "coverUrl"
          : "logoUrl";
        if (!merchantId) return new Response("Not found", { status: 404 });

        const row = await latestEventWhere("botly_merchant", "merchantId", merchantId);
        if (!row) return new Response("Not found", { status: 404 });
        const value = getString(row.payload?.[type]);
        if (/^https?:\/\//i.test(value)) {
          return new Response(null, {
            status: 302,
            headers: {
              location: value,
              "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
            },
          });
        }
        const dataUrl = value.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
        if (!dataUrl) return new Response("Not found", { status: 404 });
        try {
          const bytes = Uint8Array.from(atob(dataUrl[2]), (char) => char.charCodeAt(0));
          return new Response(new Blob([bytes], { type: dataUrl[1] }), {
            headers: {
              "content-type": dataUrl[1],
              "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
            },
          });
        } catch {
          return new Response("Invalid image", { status: 422 });
        }
      },
    },
  },
});
