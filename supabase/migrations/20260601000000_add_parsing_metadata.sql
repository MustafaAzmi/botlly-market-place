-- Add parsing metadata table for tracking AI model decisions
CREATE TABLE public.product_parsing_metadata (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_event_id UUID NOT NULL REFERENCES public.whatsapp_webhook_events(id) ON DELETE CASCADE,
  ai_provider TEXT DEFAULT 'openai',
  ai_model TEXT,
  parsing_version TEXT DEFAULT 'v2',
  confidence_score NUMERIC(3,2),
  confidence_reasons TEXT[],
  fallback_used BOOLEAN DEFAULT false,
  fallback_method TEXT,
  raw_ai_response TEXT,
  extracted_keywords TEXT[],
  language_detected TEXT,
  spam_score NUMERIC(3,2),
  duplicate_match_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_parsing_metadata_webhook_event_id
  ON public.product_parsing_metadata (webhook_event_id);
CREATE INDEX idx_parsing_metadata_confidence_score
  ON public.product_parsing_metadata (confidence_score DESC);
CREATE INDEX idx_parsing_metadata_language
  ON public.product_parsing_metadata (language_detected);
CREATE INDEX idx_parsing_metadata_fallback_used
  ON public.product_parsing_metadata (fallback_used);

-- Table for messages that couldn't be parsed (requires manual review)
CREATE TABLE public.unparseable_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_event_id UUID NOT NULL REFERENCES public.whatsapp_webhook_events(id),
  raw_text TEXT NOT NULL,
  extracted_fields JSONB,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT
);

CREATE INDEX idx_unparseable_messages_created_at
  ON public.unparseable_messages (created_at DESC);
CREATE INDEX idx_unparseable_messages_reviewed_at
  ON public.unparseable_messages (reviewed_at);

-- Table for parsing performance metrics (analytics)
CREATE TABLE public.parsing_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  average_confidence_score NUMERIC(3,2),
  median_confidence_score NUMERIC(3,2),
  fallback_usage_count INT DEFAULT 0,
  fallback_success_count INT DEFAULT 0,
  spam_detection_count INT DEFAULT 0,
  total_messages INT DEFAULT 0,
  by_language JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_parsing_metrics_date
  ON public.parsing_metrics (metric_date DESC);

-- Alter existing whatsapp_webhook_events table for quick-access fields
ALTER TABLE public.whatsapp_webhook_events
  ADD COLUMN IF NOT EXISTS product_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS product_title TEXT,
  ADD COLUMN IF NOT EXISTS product_price NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS product_category TEXT,
  ADD COLUMN IF NOT EXISTS has_validation_error BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS language_detected TEXT,
  ADD COLUMN IF NOT EXISTS spam_score NUMERIC(3,2);

-- Create indexes on new columns
CREATE INDEX IF NOT EXISTS idx_webhook_events_confidence
  ON public.whatsapp_webhook_events (product_confidence DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_fallback
  ON public.whatsapp_webhook_events (fallback_used);
CREATE INDEX IF NOT EXISTS idx_webhook_events_language
  ON public.whatsapp_webhook_events (language_detected);
CREATE INDEX IF NOT EXISTS idx_webhook_events_spam_score
  ON public.whatsapp_webhook_events (spam_score DESC);

-- Enable Row Level Security if needed
ALTER TABLE public.product_parsing_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unparseable_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parsing_metrics ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT ON public.product_parsing_metadata TO anon, authenticated;
GRANT SELECT ON public.unparseable_messages TO anon, authenticated;
GRANT SELECT ON public.parsing_metrics TO anon, authenticated;
