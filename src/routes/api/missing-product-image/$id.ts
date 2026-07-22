import { createFileRoute } from "@tanstack/react-router";

import {
  getProjectedEventById,
  getProjectedEventByPayloadField,
  getString,
} from "@/lib/eventStore.server";
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

        const projection = [
          "image_url:payload->>imageUrl",
          "image_data_url:payload->>imageDataUrl",
        ].join(",");
        const byMissingRequestId = await getProjectedEventByPayloadField(
          "botly_order",
          "missingRequestId",
          missingRequestId,
          projection,
        );
        const byOrderId =
          byMissingRequestId
            ? null
            : await getProjectedEventByPayloadField(
                "botly_order",
                "orderId",
                missingRequestId,
                projection,
              );
        const row =
          byMissingRequestId ??
          byOrderId ??
          await getProjectedEventById("botly_order", missingRequestId, projection);
        if (!row) return respond("Not found", { status: 404 });

        const imageUrl = getString(row.image_url);
        if (/^https?:\/\//i.test(imageUrl) && !imageUrl.includes("/api/missing-product-image/")) {
          return respond(null, {
            status: 302,
            headers: { location: imageUrl, "cache-control": "public, max-age=86400, immutable" },
          });
        }

        const dataUrl = getString(row.image_data_url).match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
        if (!dataUrl) return respond("Not found", { status: 404 });

        try {
          const bytes = Uint8Array.from(atob(dataUrl[2]), (char) => char.charCodeAt(0));
          const body = new Blob([bytes], { type: dataUrl[1] });
          return respond(body, {
            headers: {
              "content-type": dataUrl[1],
              "cache-control": "public, max-age=86400, immutable",
            },
          }, body.size);
        } catch {
          return respond("Invalid image", { status: 422 });
        }
      },
    },
  },
});
