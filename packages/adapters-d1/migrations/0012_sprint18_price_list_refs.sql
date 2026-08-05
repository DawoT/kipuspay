-- Sprint 18 — refs de lista de precio Zero-Trust (sucursal → cliente → default)
ALTER TABLE branches ADD COLUMN price_list_id TEXT REFERENCES price_lists(id);
ALTER TABLE customers ADD COLUMN price_list_id TEXT REFERENCES price_lists(id);
