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
    SELECT COALESCE(e.payload->>'merchantId', e.id::text) AS merchant_id
    FROM public.whatsapp_webhook_events e
    WHERE e.source = 'botly'
      AND e.event_type = 'botly_merchant'
      AND (e.payload->>'bannedFromBot')::boolean IS TRUE
  ),
  -- Event-sourced products are append-only: status edits append a new row with
  -- the same productId. Keep only the latest row per productId.
  latest AS (
    SELECT DISTINCT ON (COALESCE(p.payload->>'productId', p.id::text))
      p.id, p.payload, p.updated_at AS created_at
    FROM public.whatsapp_webhook_events p
    WHERE p.source = 'botly'
      AND p.event_type = 'botly_product'
    ORDER BY COALESCE(p.payload->>'productId', p.id::text), p.updated_at DESC
  )
  SELECT
    l.id,
    l.payload,
    similarity(public.botly_product_search_text(l.payload), lower(search_query)) AS similarity,
    l.created_at
  FROM latest l
  WHERE COALESCE(l.payload->>'status', 'active') = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM banned b WHERE b.merchant_id = l.payload->>'merchantId'
    )
    AND (
      public.botly_product_search_text(l.payload) % lower(search_query)
      OR public.botly_product_search_text(l.payload) ILIKE '%' || lower(search_query) || '%'
    )
  ORDER BY similarity DESC, l.created_at DESC
  LIMIT GREATEST(max_results, 1);
$$;

GRANT EXECUTE ON FUNCTION public.search_botly_products(text, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.botly_product_search_text(jsonb) TO anon, authenticated, service_role;
