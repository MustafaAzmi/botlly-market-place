-- Fix: the earlier migration 20260530170000 used CREATE TABLE IF NOT EXISTS,
-- so on databases where 20260528012000 already created the table it was skipped
-- entirely — leaving the `provider`, `received_at` and `updated_at` columns
-- missing. Merchant product inserts (which write a `provider` value) then fail,
-- so the WhatsApp bot never finds any catalog rows.
--
-- This migration is fully idempotent: it adds whatever is missing without
-- assuming which of the two previous migrations actually ran.

ALTER TABLE public.whatsapp_webhook_events
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Indexes used by the bot/merchant read paths.
CREATE INDEX IF NOT EXISTS idx_webhook_events_source_type
  ON public.whatsapp_webhook_events (source, event_type);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider
  ON public.whatsapp_webhook_events (provider);

CREATE INDEX IF NOT EXISTS idx_webhook_events_payload
  ON public.whatsapp_webhook_events USING GIN (payload);

-- Ensure the service role (used by the server-side Supabase client that the
-- webhook and merchant functions run with) can read/write. service_role
-- bypasses RLS, but we keep an explicit policy + grants for clarity.
DROP POLICY IF EXISTS "service_role_all" ON public.whatsapp_webhook_events;
CREATE POLICY "service_role_all" ON public.whatsapp_webhook_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.whatsapp_webhook_events TO service_role;
