-- Game Day 001 / E3 — integridad de auditoría EN VIVO
-- Base: kipuspay-staging (D1 id f23d7b8b-be71-483b-9489-2c7c4ebd73df), solo lectura.
-- Ejecutadas vía API D1 query el 2026-08-23.

-- Q1: inventario por tenant
SELECT t.id AS tenant_id, COUNT(a.id) AS audit_rows,
       MIN(a.created_at) AS first_event, MAX(a.created_at) AS last_event
FROM tenants t LEFT JOIN audit_events a ON a.tenant_id = t.id
GROUP BY t.id ORDER BY audit_rows DESC;

-- Q2: filas de cadena por tenant (insumo de la caminata DAG; resultado crudo en
-- staging-audit-events.raw.json)
SELECT tenant_id, id, prev_hash, row_hash, rowid FROM audit_events
ORDER BY tenant_id, rowid;

-- Q3: cabeza registrada vs fila más reciente por rowid
SELECT h.tenant_id, h.last_hash,
  (SELECT row_hash FROM audit_events a WHERE a.tenant_id = h.tenant_id
    ORDER BY a.rowid DESC LIMIT 1) AS latest_row_hash_by_rowid,
  (SELECT COUNT(*) FROM audit_events a2 WHERE a2.tenant_id = h.tenant_id
    AND a2.row_hash = h.last_hash) AS head_exists_as_row_hash
FROM audit_chain_heads h ORDER BY h.tenant_id;

-- Q4: caracterización del fork histórico (hijos del prev compartido)
SELECT rowid, action, entity_type, entity_id, actor_user_id, created_at
FROM audit_events WHERE tenant_id='tenant_stg_phase0_001' AND rowid BETWEEN 19 AND 27
ORDER BY rowid;

-- Resultado esperado de la caminata (e3-dag-walk.json):
--  tenant_stg_phase0_001: 40 filas, génesis 1, alcanzables 40/40, huérfanos 0,
--    forks 1 (prev 5154ce0a..., hijos rowid 22 y 23), duplicados 0, hex ok.
--  tenant_stg_rosa_negra_001: 6 filas, génesis 1, alcanzables 6/6, huérfanos 0,
--    forks 0, duplicados 0, hex ok.
--  audit_chain_heads.last_hash == row_hash más reciente por rowid en AMBOS tenants.
