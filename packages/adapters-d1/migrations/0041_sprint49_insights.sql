-- Sprint 49 — analytics.agentic_insights (Arquitectura §5.3 regla 33 / PERF-12).
-- Pipeline determinista: insight_log append-only (auditable) + ai_usage_counters
-- (metering por tenant/día, cupo por plan). D1 es la única calculadora (Principio 9).
-- El LLM nunca calcula ni decide: en insight_log quedan la consulta exacta, los
-- hechos tipados (facts_json) y el texto final (data de output, jamás se re-ejecuta).
-- Triggers de epoch (tabla BUSINESS del registry): cada insert invalida el snapshot.
CREATE TABLE insight_log (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,        -- UUID del mensaje por tenant; reenvío devuelve respuesta cacheada
    interaction_type TEXT NOT NULL,       -- 'chat_query' | 'briefing_generated' | 'briefing_viewed'
    status TEXT NOT NULL DEFAULT 'OK',    -- 'OK' | 'LIMIT_CAPPED' | 'PII_BLOCKED' | 'TOO_WIDE'
    sql_executed TEXT NOT NULL,           -- SELECT exacto ejecutado en D1 (auditable, append-only)
    facts_json TEXT NOT NULL,             -- hechos tipados que el NLG recibió verbatim
    response_text TEXT NOT NULL,          -- prosa generada (data de output, jamás se re-ejecuta)
    model_version TEXT NOT NULL,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    CHECK (status IN ('OK','LIMIT_CAPPED','PII_BLOCKED','TOO_WIDE')),
    CHECK (interaction_type IN ('chat_query','briefing_generated','briefing_viewed')),
    CHECK (tokens_in >= 0),
    CHECK (tokens_out >= 0),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX idx_insight_log_tenant ON insight_log(tenant_id, created_at);
CREATE UNIQUE INDEX uq_insight_log_tenant_idem ON insight_log(tenant_id, idempotency_key);

CREATE TRIGGER backup_epoch_insight_log_insert AFTER INSERT ON "insight_log" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_insight_log_update AFTER UPDATE ON "insight_log" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_insight_log_delete BEFORE DELETE ON "insight_log" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;

CREATE TABLE ai_usage_counters (
    tenant_id TEXT NOT NULL,
    usage_date DATE NOT NULL,
    queries INTEGER NOT NULL DEFAULT 0,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    quota_queries INTEGER NOT NULL,        -- cupo diario de consultas según plan (metering)
    PRIMARY KEY (tenant_id, usage_date),
    CHECK (queries >= 0),
    CHECK (tokens_in >= 0),
    CHECK (tokens_out >= 0),
    CHECK (quota_queries >= 0),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
-- Nota: el briefing diario (cron 3:30 AM) consume ai_usage_counters como 1 query + tokens_out.

INSERT INTO schema_meta(key, value)
VALUES ('analytics.agentic_insights.sprint49', '1');
