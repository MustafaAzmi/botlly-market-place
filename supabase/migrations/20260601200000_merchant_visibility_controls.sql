-- Admin merchant-visibility controls.
--
-- Merchants can be hidden from customer search/WhatsApp results without deleting
-- their products, via admin-controlled flags on the latest botly_merchant event:
--   bannedFromBot | visibilityEnabled=false | isActive=false | suspendedAt set |
--   subscriptionStatus='expired' | packageExpiry in the past.
--
-- This replaces the search RPC so the `hidden` set uses the LATEST merchant
-- state per merchantId (append-only safe) and respects every flag.

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
  WITH latest_merchant AS (
    SELECT DISTINCT ON (COALESCE(e.payload->>'merchantId', e.id::text))
      COALESCE(e.payload->>'merchantId', e.id::text) AS merchant_id,
      e.payload AS payload
    FROM public.whatsapp_webhook_events e
    WHERE e.source = 'botly'
      AND e.event_type = 'botly_merchant'
    ORDER BY COALESCE(e.payload->>'merchantId', e.id::text), e.updated_at DESC
  ),
  hidden AS (
    SELECT m.merchant_id
    FROM latest_merchant m
    WHERE (m.payload->>'bannedFromBot')::boolean IS TRUE
      OR (m.payload->>'visibilityEnabled') = 'false'
      OR (m.payload->>'isActive') = 'false'
      OR COALESCE(m.payload->>'suspendedAt', '') <> ''
      OR (m.payload->>'subscriptionStatus') = 'expired'
      OR (
        COALESCE(m.payload->>'packageExpiry', '') <> ''
        AND (m.payload->>'packageExpiry')::timestamptz < now()
      )
  ),
  -- Products are append-only: keep only the latest row per productId.
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
      SELECT 1 FROM hidden h WHERE h.merchant_id = l.payload->>'merchantId'
    )
    AND (
      public.botly_product_search_text(l.payload) % lower(search_query)
      OR public.botly_product_search_text(l.payload) ILIKE '%' || lower(search_query) || '%'
    )
  ORDER BY similarity DESC, l.created_at DESC
  LIMIT GREATEST(max_results, 1);
$$;

GRANT EXECUTE ON FUNCTION public.search_botly_products(text, int) TO anon, authenticated, service_role;
