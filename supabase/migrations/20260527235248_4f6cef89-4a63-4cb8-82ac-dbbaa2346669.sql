
-- Stores managed by admin
CREATE TABLE public.admin_stores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  city TEXT NOT NULL,
  category TEXT NOT NULL,
  products_count INTEGER NOT NULL DEFAULT 0,
  orders_count INTEGER NOT NULL DEFAULT 0,
  banned_from_bot BOOLEAN NOT NULL DEFAULT false,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  price_monthly INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'IQD',
  features TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.delivery_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  cities TEXT[] NOT NULL DEFAULT '{}',
  banned_from_bot BOOLEAN NOT NULL DEFAULT false,
  active_merchants INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.broadcasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all',
  audience_label TEXT NOT NULL DEFAULT '',
  recipients INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grants: service_role only (admin operations go through server functions).
-- Authenticated/anon roles get no direct access — RLS denies everything below.
GRANT ALL ON public.admin_stores TO service_role;
GRANT ALL ON public.payment_packages TO service_role;
GRANT ALL ON public.delivery_companies TO service_role;
GRANT ALL ON public.broadcasts TO service_role;

ALTER TABLE public.admin_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

-- Deny-all RLS (service_role bypasses RLS, so admin server fns still work)
CREATE POLICY "deny all on admin_stores"
  ON public.admin_stores FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE POLICY "deny all on payment_packages"
  ON public.payment_packages FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE POLICY "deny all on delivery_companies"
  ON public.delivery_companies FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE POLICY "deny all on broadcasts"
  ON public.broadcasts FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_admin_stores_updated BEFORE UPDATE ON public.admin_stores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_payment_packages_updated BEFORE UPDATE ON public.payment_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_delivery_companies_updated BEFORE UPDATE ON public.delivery_companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_broadcasts_updated BEFORE UPDATE ON public.broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
