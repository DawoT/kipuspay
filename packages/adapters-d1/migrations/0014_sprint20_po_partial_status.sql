-- Sprint 20: formaliza PARTIALLY_RECEIVED en purchase_orders.status.
-- 0001 solo documentaba DRAFT/SENT/RECEIVED/CANCELED en comentario (sin CHECK).
-- La máquina de estados vive en domain-cash (planPartialReceive).

INSERT INTO schema_meta (key, value)
VALUES (
  'purchase_orders.status.partially_received',
  'Sprint 20 — PARTIALLY_RECEIVED formalizado'
);
