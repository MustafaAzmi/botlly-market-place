import { createFileRoute } from "@tanstack/react-router";

import { getEventById, getString, listEventsByPayloadField } from "@/lib/eventStore.server";
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

        // Events are newest-first, so the first row per productId is the
        // latest version of the product (edits append new events).
        const matchingRows = await listEventsByPayloadField(
          "botly_product",
          "productId",
          productId,
          1,
        );
        const row =
          matchingRows[0] ??
          await getEventById("botly_product", productId);
        if (!row) return respond("Not found", { status: 404 });

        const requestedIndex = Number(new URL(request.url).searchParams.get("index") ?? "0");
        const index = Number.isInteger(requestedIndex) && requestedIndex >= 0 ? requestedIndex : 0;
        const imageUrls = Array.isArray(row.payload?.imageUrls)
          ? (row.payload.imageUrls as unknown[]).filter(
              (value): value is string => typeof value === "string" && value.length > 0,
            )
          : [];
        const imageUrl = imageUrls[index] ?? (index === 0 ? getString(row.payload?.imageUrl) : "");
        if (/^https?:\/\//i.test(imageUrl)) {
          return respond(null, {
            status: 302,
            headers: {
              location: imageUrl,
              "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
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
            "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
          },
        }, body.size);
      },
    },
  },
});
