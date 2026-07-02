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
-- Per-reseller AI spend caps in USD (rolling 30d / 365d). NULL = inherit the
-- global default (settings.rates); 0 = explicitly unlimited; N = cap at $N.
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS monthly_cost_limit NUMERIC;
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS yearly_cost_limit  NUMERIC;

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
