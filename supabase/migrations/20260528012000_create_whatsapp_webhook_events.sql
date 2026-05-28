CREATE TABLE public.whatsapp_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'whatsapp_business_account',
  event_type TEXT NOT NULL DEFAULT 'unknown',
  phone_number_id TEXT,
  wa_message_id TEXT,
  from_number TEXT,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_webhook_events_created_at
  ON public.whatsapp_webhook_events (created_at DESC);

CREATE INDEX idx_whatsapp_webhook_events_wa_message_id
  ON public.whatsapp_webhook_events (wa_message_id);

GRANT ALL ON public.whatsapp_webhook_events TO service_role;

ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny all on whatsapp_webhook_events"
  ON public.whatsapp_webhook_events FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);
