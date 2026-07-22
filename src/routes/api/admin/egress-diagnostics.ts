import { createFileRoute } from "@tanstack/react-router";

import { getCurrentAdmin } from "@/lib/admin.functions";
import {
  diagnosticResponse,
  diagnosticSession,
  getEgressDiagnosticReport,
  payloadBytes,
} from "@/lib/egress-diagnostics.server";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(data: unknown, status = 200) {
  const body = JSON.stringify(data);
  return diagnosticResponse(
    "api:admin:egressDiagnosticsReport",
    body,
    { status, headers: jsonHeaders },
    {
      payload: data,
      responseBytes: payloadBytes(body),
      containsBase64: false,
    },
  );
}

export const Route = createFileRoute("/api/admin/egress-diagnostics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as { token?: unknown };
          const token = typeof body.token === "string" ? body.token : "";
          if (!token) return json({ ok: false, error: "Missing admin token" }, 400);
          const admin = await getCurrentAdmin({ data: { token } });
          const report = getEgressDiagnosticReport();
          return json({
            ok: true,
            adminId: admin.id,
            session: diagnosticSession(token),
            note: "In-memory totals cover the current warm server instance. Netlify logs contain every BOTLY_EGRESS event across instances.",
            ...report,
          });
        } catch (error) {
          return json({
            ok: false,
            error: error instanceof Error ? error.message : "Unauthorized",
          }, 401);
        }
      },
    },
  },
});
