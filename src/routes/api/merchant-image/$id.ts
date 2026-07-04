import { createFileRoute } from "@tanstack/react-router";

import { getProjectedEventByPayloadField, getString } from "@/lib/eventStore.server";
import {
  diagnosticIdentity,
  diagnosticResponse,
  payloadBytes,
} from "@/lib/egress-diagnostics.server";

export const Route = createFileRoute("/api/merchant-image/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const merchantId = getString((params as Record<string, unknown>).id);
        const type = new URL(request.url).searchParams.get("type") === "cover"
          ? "coverUrl"
          : "logoUrl";
        const respond = (
          body: BodyInit | null,
          init: ResponseInit,
          responseBytes = typeof body === "string" ? payloadBytes(body) : 0,
        ) => diagnosticResponse(`api:merchantImage:${type}`, body, init, {
          responseBytes,
          rows: responseBytes > 0 ? 1 : 0,
          containsBase64: false,
          user: diagnosticIdentity(merchantId),
          cacheControl: new Headers(init.headers).get("cache-control") ?? undefined,
        });
        if (!merchantId) return respond("Not found", { status: 404 });

        const row = await getProjectedEventByPayloadField(
          "botly_merchant",
          "merchantId",
          merchantId,
          `image_value:payload->>${type}`,
        );
        if (!row) return respond("Not found", { status: 404 });
        const value = getString(row.image_value);
        if (/^https?:\/\//i.test(value)) {
          return respond(null, {
            status: 302,
            headers: {
              location: value,
              "cache-control": "public, max-age=86400, immutable",
            },
          });
        }
        const dataUrl = value.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
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
