-- S6: ligar boletas ACCEPTED huérfanas (daily_summary_id NULL) al RC del mismo día.
-- El RC complementary no debe re-listar estas filas (buildDailySummary filtra ACCEPTED).
-- Ejecutar contra D1 staging del piloto Rosa Negra; no toca correlativos.
UPDATE sales
SET daily_summary_id = (
  SELECT s.id
  FROM sunat_daily_summaries s
  WHERE s.tenant_id = sales.tenant_id
    AND s.summary_date = date(sales.issued_at_lima)
  ORDER BY CASE s.rc_type WHEN 'PRIMARY' THEN 0 ELSE 1 END, s.created_at
  LIMIT 1
)
WHERE tenant_id = 'tenant_stg_rosa_negra_001'
  AND document_type IN ('03', '12')
  AND sunat_status = 'ACCEPTED'
  AND daily_summary_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM sunat_daily_summaries s
    WHERE s.tenant_id = sales.tenant_id
      AND s.summary_date = date(sales.issued_at_lima)
  );
