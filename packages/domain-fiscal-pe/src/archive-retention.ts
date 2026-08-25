/**
 * H3 (auditoría 0031) — política de retención del archivo fiscal.
 *
 * Mínimo legal recomendado: 5 AÑOS para CPEs, CDRs y resúmenes diarios
 * (Código de Comercio art. 190, Ley 30056; Reglamento de Comprobantes de
 * Pago SUNAT). La constante es la fuente de verdad del dominio: un job
 * futuro de purga la consume para aplicar el borrador — NUNCA antes.
 */

export const FISCAL_ARCHIVE_RETENTION_YEARS = 5;

/** 5 años en ms (365 días/año convención civil; la purga es best-effort). */
export const FISCAL_ARCHIVE_RETENTION_MS = FISCAL_ARCHIVE_RETENTION_YEARS * 365 * 24 * 3600 * 1000;
