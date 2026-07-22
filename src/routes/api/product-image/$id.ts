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

// Public product image endpoint. Manually uploaded images are stored as
// base64 data: URLs in the product event — WhatsApp can only deliver public
// https links, so the bot points it here and we stream the decoded image.
// Link-based images just redirect to their original URL.

export const Route = createFileRoute("/api/product-image/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const productId = getString((params as Record<string, unknown>).id);
        const respond = (
          body: BodyInit | null,
          init: ResponseInit,
          responseBytes = typeof body === "string" ? payloadBytes(body) : 0,
        ) => diagnosticResponse("api:productImage", body, init, {
          responseBytes,
          rows: responseBytes > 0 ? 1 : 0,
          containsBase64: false,
          user: diagnosticIdentity(productId),
          cacheControl: new Headers(init.headers).get("cache-control") ?? undefined,
        });
        if (!productId) return respond("Not found", { status: 404 });

        const requestedIndex = Number(new URL(request.url).searchParams.get("index") ?? "0");
        const index = Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex <= 5
          ? requestedIndex
          : 0;
        const projection = [
          "image_url:payload->>imageUrl",
          `indexed_image:payload->imageUrls->>${index}`,
        ].join(",");
        const row =
          await getProjectedEventByPayloadField(
          "botly_product",
          "productId",
          productId,
          projection,
        ) ?? await getProjectedEventById("botly_product", productId, projection);
        if (!row) return respond("Not found", { status: 404 });

        const imageUrl =
          getString(row.indexed_image)
          || (index === 0 ? getString(row.image_url) : "");
        if (/^https?:\/\//i.test(imageUrl)) {
          return respond(null, {
            status: 302,
            headers: {
              location: imageUrl,
              "cache-control": "public, max-age=86400, immutable",
            },
          });
        }

        const dataUrl = imageUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
        if (!dataUrl) return respond("Not found", { status: 404 });

        let body: Blob;
        try {
          const bytes = Uint8Array.from(atob(dataUrl[2]), (c) => c.charCodeAt(0));
          body = new Blob([bytes], { type: dataUrl[1] });
        } catch {
          return respond("Invalid image", { status: 422 });
        }

        return respond(body, {
          headers: {
            "content-type": dataUrl[1],
            "cache-control": "public, max-age=86400, immutable",
          },
        }, body.size);
      },
    },
  },
});
