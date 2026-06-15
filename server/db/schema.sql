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
  id         SERIAL PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  company    TEXT,
  logo_url   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  status         TEXT NOT NULL DEFAULT 'draft',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS idx_products_series ON products(series, max_users);
CREATE INDEX IF NOT EXISTS idx_quote_items_number ON quote_items(quote_number);
