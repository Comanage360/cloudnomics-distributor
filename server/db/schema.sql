-- Cloudnomics Distributor Console — schema

-- Full PANW pricelist (imported from the Cloudnomics XLSX).
CREATE TABLE IF NOT EXISTS products (
  model             TEXT PRIMARY KEY,
  series            TEXT NOT NULL,
  recommended_users TEXT,
  max_users         INTEGER,
  form_factor       TEXT,
  fw_throughput     TEXT,
  tp_throughput     TEXT,
  sessions_max      TEXT,
  list_price        NUMERIC,
  price_unit        TEXT,            -- one_time | annual | on_request
  notes             TEXT
);

-- Catalog SKUs from the PANW GLOBAL price list (MSSP subscriptions today).
-- Separate from `products`: those are firewalls keyed by model and sized by user
-- count, whereas these are subscription/support SKUs where several rows share a
-- model (e.g. seven XSOAR SKUs), so the part number is the only safe key.
CREATE TABLE IF NOT EXISTS catalog_items (
  part_number       TEXT PRIMARY KEY,
  category          TEXT,             -- Subscription | Support | Hardware | ...
  product           TEXT,             -- Demisto | XSIAM | Expanse | ...
  model             TEXT,             -- XSOAR | XSIAM | Cortex-XDR | ...
  description       TEXT,
  list_price        NUMERIC,          -- NULL when quoted per PANW
  price_unit        TEXT,             -- one_time | annual | on_request
  discount_category TEXT,             -- A | B | C | D | ... (drives the reseller discount)
  tag               TEXT,             -- catalog grouping, e.g. 'mssp'
  eol_date          TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_items_tag ON catalog_items(tag);

-- Non-tabular reference data (XDR per-user pricing, currency).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS resellers (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  company       TEXT,
  logo_url      TEXT,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'reseller',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add password storage on databases created before it existed.
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS password_hash TEXT;
-- Reseller vs admin role.
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'reseller';
-- Per-reseller AI spend cap in USD (rolling 30 days). New resellers default to
-- $10; 0 = explicitly unlimited; NULL = fall back to the built-in default.
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS monthly_cost_limit NUMERIC DEFAULT 10;
ALTER TABLE resellers ALTER COLUMN monthly_cost_limit SET DEFAULT 10;
-- Email verification. The ADD backfills EXISTING rows to true (grandfathered);
-- the SET DEFAULT false makes NEW signups start unverified.
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE resellers ALTER COLUMN email_verified SET DEFAULT false;
-- Admin approval gate. The ADD backfills EXISTING rows to true (grandfathered);
-- the SET DEFAULT false makes NEW signups start pending until an admin approves.
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE resellers ALTER COLUMN approved SET DEFAULT false;

-- Single-use, hashed, expiring tokens for email verification + password reset.
-- Only sha256(rawToken) is stored; the emailed link carries the raw token.
CREATE TABLE IF NOT EXISTS auth_tokens (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  kind        TEXT NOT NULL,              -- 'verify' | 'reset'
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);

-- Audit log of authentication / account events.
CREATE TABLE IF NOT EXISTS auth_events (
  id          SERIAL PRIMARY KEY,
  email       TEXT,
  event       TEXT NOT NULL,             -- signup | login | login_failed | verify_sent | verify_ok | reset_requested | reset_ok | rate_limited
  ip          TEXT,
  user_agent  TEXT,
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_events_email ON auth_events(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_created ON auth_events(created_at DESC);

-- Outgoing quote-email log, for per-reseller daily send caps + monitoring.
CREATE TABLE IF NOT EXISTS email_sends (
  id             SERIAL PRIMARY KEY,
  reseller_email TEXT NOT NULL,
  to_email       TEXT,
  cc_count       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_sends_reseller ON email_sends(reseller_email, created_at DESC);

CREATE TABLE IF NOT EXISTS quotes (
  number         BIGINT PRIMARY KEY,
  reseller_email TEXT NOT NULL,
  customer_name  TEXT,
  customer_email TEXT,
  currency       TEXT NOT NULL DEFAULT 'USD',
  discount       NUMERIC NOT NULL,
  markup         NUMERIC NOT NULL DEFAULT 0,
  reseller_total NUMERIC NOT NULL,
  customer_total NUMERIC NOT NULL,
  margin         NUMERIC NOT NULL,
  selection      JSONB NOT NULL,
  logo           TEXT,            -- white-label logo (base64 data URL), optional
  status         TEXT NOT NULL DEFAULT 'draft',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add the logo column on databases created before it existed.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS logo TEXT;

CREATE TABLE IF NOT EXISTS quote_items (
  id             SERIAL PRIMARY KEY,
  quote_number   BIGINT NOT NULL REFERENCES quotes(number) ON DELETE CASCADE,
  item_key       TEXT NOT NULL,
  label          TEXT NOT NULL,
  meta           TEXT,
  list_total     NUMERIC NOT NULL,
  reseller_price NUMERIC NOT NULL,
  service        BOOLEAN NOT NULL DEFAULT false
);

-- Claude token usage & cost per recommendation (for admin reporting).
CREATE TABLE IF NOT EXISTS ai_usage (
  id             SERIAL PRIMARY KEY,
  reseller_email TEXT NOT NULL,
  quote_number   BIGINT,
  model          TEXT NOT NULL,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd       NUMERIC NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Groups all AI turns of one quoting session (incl. abandoned ones) for "Sessions" reporting.
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS session_id TEXT;
-- The advisor session that produced a quote; enforces one quote per session.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS session_id TEXT;
CREATE INDEX IF NOT EXISTS idx_quotes_session ON quotes(session_id);

-- Reseller-submitted requests to raise their AI spend limit (admin queue).
CREATE TABLE IF NOT EXISTS limit_requests (
  id             SERIAL PRIMARY KEY,
  reseller_email TEXT NOT NULL,
  period         TEXT,             -- 'monthly' | 'yearly' — which window was hit
  used           NUMERIC,          -- USD spent in that window at request time
  limit_value    NUMERIC,          -- the $ cap they hit
  reason         TEXT,             -- optional note from the reseller
  status         TEXT NOT NULL DEFAULT 'pending', -- pending | approved | dismissed
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_limit_requests_status ON limit_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_reseller ON ai_usage(reseller_email);
CREATE INDEX IF NOT EXISTS idx_ai_usage_session ON ai_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_products_series ON products(series, max_users);
CREATE INDEX IF NOT EXISTS idx_quote_items_number ON quote_items(quote_number);
