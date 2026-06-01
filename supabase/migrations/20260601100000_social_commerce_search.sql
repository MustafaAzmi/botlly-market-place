-- Social-commerce search architecture.
-- Botly converts merchant social posts into structured, searchable product
-- entities. Product search must run inside PostgreSQL (pg_trgm + full text),
-- NOT through GPT. GPT only extracts intent; this layer does the matching.

-- Enable trigram similarity matching for fuzzy Arabic/English product search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram GIN indexes on the JSONB product fields used for ranking.
-- Products live in whatsapp_webhook_events as event_type='botly_product'.
CREATE INDEX IF NOT EXISTS idx_botly_product_description_trgm
  ON public.whatsapp_webhook_events
  USING gin ((payload->>'description') gin_trgm_ops)
  WHERE source = 'botly' AND event_type = 'botly_product';

CREATE INDEX IF NOT EXISTS idx_botly_product_keywords_trgm
  ON public.whatsapp_webhook_events
  USING gin ((payload->>'searchText') gin_trgm_ops)
  WHERE source = 'botly' AND event_type = 'botly_product';

-- Helper: collapse a product payload into one searchable string.
CREATE OR REPLACE FUNCTION public.botly_product_search_text(payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    concat_ws(' ',
      payload->>'description',
      payload->>'title',
      payload->>'category',
      payload->>'brand',
      payload->>'color',
      payload->>'size',
      payload->>'condition',
      payload->>'searchText',
      payload->>'keywords'
    )
  );
$$;

-- Core product search RPC. Ranks active products by trigram similarity against
-- the (already intent-extracted) query terms. Banned merchants and
-- pending_review / expired products are excluded from customer-facing results.
CREATE OR REPLACE FUNCTION public.search_botly_products(
  search_query text,
  max_results int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  payload jsonb,
  similarity real,
  created_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  WITH banned AS (
    SELECT e.id::text AS merchant_id
    FROM public.whatsapp_webhook_events e
    WHERE e.source = 'botly'
      AND e.event_type = 'botly_merchant'
      AND (e.payload->>'bannedFromBot')::boolean IS TRUE
  )
  SELECT
    p.id,
    p.payload,
    similarity(public.botly_product_search_text(p.payload), lower(search_query)) AS similarity,
    p.created_at
  FROM public.whatsapp_webhook_events p
  WHERE p.source = 'botly'
    AND p.event_type = 'botly_product'
    AND COALESCE(p.payload->>'status', 'active') = 'active'
    AND (p.payload->>'merchantId') NOT IN (SELECT merchant_id FROM banned)
    AND (
      public.botly_product_search_text(p.payload) % lower(search_query)
      OR public.botly_product_search_text(p.payload) ILIKE '%' || lower(search_query) || '%'
    )
  ORDER BY similarity DESC, p.created_at DESC
  LIMIT GREATEST(max_results, 1);
$$;

GRANT EXECUTE ON FUNCTION public.search_botly_products(text, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.botly_product_search_text(jsonb) TO anon, authenticated, service_role;
