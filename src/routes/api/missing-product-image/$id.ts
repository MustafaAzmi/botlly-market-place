import { createFileRoute } from "@tanstack/react-router";

import { getEventById, getString, listEventsByPayloadField } from "@/lib/eventStore.server";
import {
  diagnosticIdentity,
  diagnosticResponse,
  payloadBytes,
} from "@/lib/egress-diagnostics.server";

export const Route = createFileRoute("/api/missing-product-image/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const missingRequestId = getString((params as Record<string, unknown>).id);
        const respond = (
          body: BodyInit | null,
          init: ResponseInit,
          responseBytes = typeof body === "string" ? payloadBytes(body) : 0,
        ) => diagnosticResponse("api:missingProductImage", body, init, {
          responseBytes,
          rows: responseBytes > 0 ? 1 : 0,
          containsBase64: false,
          user: diagnosticIdentity(missingRequestId),
          cacheControl: new Headers(init.headers).get("cache-control") ?? undefined,
        });
        if (!missingRequestId) return respond("Not found", { status: 404 });

        const byMissingRequestId = await listEventsByPayloadField(
          "botly_order",
          "missingRequestId",
          missingRequestId,
          1,
        );
        const byOrderId =
          byMissingRequestId.length > 0
            ? []
            : await listEventsByPayloadField("botly_order", "orderId", missingRequestId, 1);
        const row =
          byMissingRequestId[0] ??
          byOrderId[0] ??
          await getEventById("botly_order", missingRequestId);
        if (!row) return respond("Not found", { status: 404 });

        const imageUrl = getString(row.payload?.imageUrl);
        if (/^https?:\/\//i.test(imageUrl) && !imageUrl.includes("/api/missing-product-image/")) {
          return respond(null, {
            status: 302,
            headers: { location: imageUrl, "cache-control": "public, max-age=3600" },
          });
        }

        const dataUrl = getString(row.payload?.imageDataUrl).match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
        if (!dataUrl) return respond("Not found", { status: 404 });

        try {
          const bytes = Uint8Array.from(atob(dataUrl[2]), (char) => char.charCodeAt(0));
          const body = new Blob([bytes], { type: dataUrl[1] });
          return respond(body, {
            headers: {
              "content-type": dataUrl[1],
              "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
            },
          }, body.size);
        } catch {
          return respond("Invalid image", { status: 422 });
        }
      },
    },
  },
});
