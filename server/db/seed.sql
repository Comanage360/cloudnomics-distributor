-- Minimal defaults so the app boots before the pricelist import runs.
-- The XLSX importer overwrites `xdr` with the real value from the sheet.
INSERT INTO settings (key, value) VALUES
  ('currency', '"USD"'),
  ('xdr', '{"sku":"CORTEX-XDR-PRO","name":"Cortex XDR Pro","listPerUser":70}')
ON CONFLICT (key) DO NOTHING;
