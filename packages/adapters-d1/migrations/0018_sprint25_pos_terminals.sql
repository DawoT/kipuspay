-- Sprint 25: pos_terminals — paper 58/80 + printer_strategy (§5.3 / §7.5)

CREATE TABLE IF NOT EXISTS pos_terminals (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    label TEXT,
    paper_width_mm INTEGER NOT NULL DEFAULT 58,
    line_width INTEGER NOT NULL DEFAULT 32,
    printer_strategy TEXT NOT NULL DEFAULT 'webusb',
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, branch_id, id),
    CHECK (paper_width_mm IN (58, 80)),
    CHECK (line_width IN (32, 48)),
    CHECK (printer_strategy IN ('webusb','wss_lan','bluetooth','system_print')),
    CHECK (active IN (0, 1)),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE INDEX IF NOT EXISTS idx_pos_terminals_branch
  ON pos_terminals(tenant_id, branch_id, active);

INSERT INTO schema_meta (key, value)
VALUES (
  'pos_terminals.sprint25',
  'Sprint 25 — pos_terminals printRouter 58/80'
);
