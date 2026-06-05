-- Create whatsapp_webhook_events table for storing merchant and product data
-- This is used for event sourcing - keeping a history of all changes
-- Schema from: https://github.com/supabase/supabase/discussions/18236

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL DEFAULT 'botly',
  event_type text NOT NULL,
  provider text,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  received_at timestamp with time zone,
  inserted_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_webhook_events_source_type ON public.whatsapp_webhook_events(source, event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON public.whatsapp_webhook_events(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON public.whatsapp_webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_payload ON public.whatsapp_webhook_events USING GIN(payload);

-- Enable RLS
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

-- Allow admin to do everything
CREATE POLICY "admin_all_operations" ON public.whatsapp_webhook_events
  FOR ALL USING (auth.jwt() ->> 'role' = 'authenticated');

-- Allow service role to do everything (for server functions)
CREATE POLICY "service_role_all" ON public.whatsapp_webhook_events
  USING (true)
  WITH CHECK (true);

-- Create function to auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at
DROP TRIGGER IF EXISTS set_updated_at_trigger ON public.whatsapp_webhook_events;
CREATE TRIGGER set_updated_at_trigger
  BEFORE UPDATE ON public.whatsapp_webhook_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Grant permissions
GRANT ALL ON public.whatsapp_webhook_events TO postgres;
GRANT ALL ON public.whatsapp_webhook_events TO authenticated;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
