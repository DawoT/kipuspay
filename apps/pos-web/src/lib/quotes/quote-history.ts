/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/**
 * Taller premium — historial por placa.
 * Pure, zero-dependency, offline-first. Todo dinero en cents enteros.
 * Gating: usage via isSalesQuotesEnabled() en la UI (no switch vertical).
 */

export interface PlateHistoryEntry {
  readonly id: string;
  readonly plate: string;
  readonly dateIso: string;
  readonly concept: string;
  readonly totalCents: number;
}

export function normalizePlate(raw: string): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isValidPlate(plate: string): boolean {
  const n = normalizePlate(plate);
  if (n.length < 6 || n.length > 7) return false;
  return /^[A-Z0-9]+$/.test(n);
}

export function formatPlateDisplay(raw: string): string {
  const n = normalizePlate(raw);
  if (n.length === 6) return `${n.slice(0, 3)}-${n.slice(3)}`;
  if (n.length === 7) return `${n.slice(0, 3)}-${n.slice(3)}`;
  if (raw.includes('-')) {
    // ya formateada pero normalizamos por si viene con espacios
    const trimmed = raw.trim().toUpperCase();
    // si ya tiene guión y longitud válida, respetamos
    const withoutSpaces = trimmed.replace(/\s+/g, '');
    if (/^[A-Z0-9]{3}-[A-Z0-9]{3,4}$/.test(withoutSpaces)) return withoutSpaces;
  }
  return n.length >= 6 ? `${n.slice(0, 3)}-${n.slice(3)}` : n;
}

export function historyCacheKey(tenantId: string, plate: string): string {
  const n = normalizePlate(plate);
  const t = typeof tenantId === 'string' ? tenantId.trim() : '';
  return `taller_history/${t}/${n}`;
}

export function sortHistoryByDate(entries: readonly PlateHistoryEntry[]): PlateHistoryEntry[] {
  return [...entries].sort((a, b) => {
    const ta = Date.parse(a.dateIso);
    const tb = Date.parse(b.dateIso);
    const va = Number.isFinite(ta) ? ta : 0;
    const vb = Number.isFinite(tb) ? tb : 0;
    return vb - va;
  });
}

export function filterHistoryByPlate(
  entries: readonly PlateHistoryEntry[],
  plate: string,
): PlateHistoryEntry[] {
  const target = normalizePlate(plate);
  if (!target) return [];
  return entries.filter((e) => normalizePlate(e.plate) === target);
}

export function summarizeHistory(entries: readonly PlateHistoryEntry[]): {
  readonly count: number;
  readonly totalCents: number;
  readonly lastAt: string | null;
} {
  if (entries.length === 0) return { count: 0, totalCents: 0, lastAt: null };
  let totalCents = 0;
  let lastAt: string | null = null;
  let lastMs = -1;
  for (const e of entries) {
    if (Number.isSafeInteger(e.totalCents) && e.totalCents >= 0) totalCents += e.totalCents;
    const ms = Date.parse(e.dateIso);
    if (Number.isFinite(ms) && ms > lastMs) {
      lastMs = ms;
      lastAt = e.dateIso;
    }
  }
  return { count: entries.length, totalCents, lastAt };
}

// eslint-disable-next-line complexity
function isValidHistoryEntry(value: unknown): value is PlateHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id.trim()) return false;
  if (typeof r.plate !== 'string' || !r.plate.trim()) return false;
  if (typeof r.dateIso !== 'string' || !r.dateIso.trim()) return false;
  const ms = Date.parse(r.dateIso);
  if (!Number.isFinite(ms)) return false;
  if (typeof r.concept !== 'string') return false;
  if (typeof r.totalCents !== 'number') return false;
  if (!Number.isSafeInteger(r.totalCents) || r.totalCents < 0) return false;
  if (!isValidPlate(r.plate) && normalizePlate(r.plate).length < 3) return false;
  // allow any valid plate format for history, but at least normalized 3 chars
  return true;
}

export function parseHistoryPayload(raw: unknown): PlateHistoryEntry[] {
  if (!raw || typeof raw !== 'object') return [];
  const rec = raw as Record<string, unknown>;
  const arr = rec.items;
  if (!Array.isArray(arr)) return [];
  const out: PlateHistoryEntry[] = [];
  for (const item of arr) {
    if (isValidHistoryEntry(item)) {
      const entry = item as PlateHistoryEntry;
      out.push({
        id: entry.id,
        plate: normalizePlate(entry.plate),
        dateIso: entry.dateIso,
        concept: String(entry.concept),
        totalCents: entry.totalCents,
      });
    }
  }
  return out;
}
