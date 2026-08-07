export function parseCreditNoteEaBody(raw: unknown): {
  originSaleId?: string;
  confirmed?: boolean;
  motiveCode?: string;
  series?: string;
} {
  if (raw === null || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const out: {
    originSaleId?: string;
    confirmed?: boolean;
    motiveCode?: string;
    series?: string;
  } = {};
  if (typeof o.originSaleId === 'string') out.originSaleId = o.originSaleId.trim();
  if (typeof o.confirmed === 'boolean') out.confirmed = o.confirmed;
  if (typeof o.motiveCode === 'string') out.motiveCode = o.motiveCode.trim();
  if (typeof o.series === 'string') out.series = o.series.trim();
  return out;
}
