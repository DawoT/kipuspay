/**
 * Backlog v10 P1b — cliente de la Guía de Remisión `31` (ADR-FISCAL-004).
 * El servidor es la única autoridad del correlativo y del guard.
 */
import { resolveApiAuth, resolveApiBase, applyApiAuthHeaders } from '../auth/api-client.js';

export interface RemissionGuideInput {
  readonly branchId: string;
  readonly series: string;
  readonly transferReasonCode: string;
  readonly transportModeCode: string;
  readonly vehiclePlate: string;
  readonly carrierDocumentType: string;
  readonly carrierDocumentNumber: string;
  readonly carrierName: string;
  readonly originUbigeo: string;
  readonly originAddress: string;
  readonly destinationUbigeo: string;
  readonly destinationAddress: string;
  readonly transferStartedAt: string;
  readonly items: readonly { productId: string; quantityMicrounits: number; uomCode: string }[];
}

export interface RemissionGuideIssued {
  readonly ok: true;
  readonly remissionGuideId: string;
  readonly series: string;
  readonly number: number;
  readonly transferReasonCode: string;
  readonly sunatStatus: string;
}

export async function issueRemissionGuide(
  input: RemissionGuideInput,
): Promise<RemissionGuideIssued | { ok: false; message: string }> {
  const apiBase = resolveApiBase();
  const auth = resolveApiAuth().authorization ?? '';
  if (!input.branchId.trim() || !input.series.trim() || input.items.length === 0) {
    return { ok: false, message: 'Sucursal, serie y al menos un ítem son requeridos.' };
  }
  try {
    const headers = new Headers({
      'content-type': 'application/json',
      authorization: auth,
    });
    applyApiAuthHeaders(headers);
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/inventory/remission-guides`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        branchId: input.branchId,
        series: input.series,
        transferReasonCode: input.transferReasonCode,
        transportModeCode: input.transportModeCode,
        vehiclePlate: input.vehiclePlate,
        carrier: {
          documentType: input.carrierDocumentType,
          documentNumber: input.carrierDocumentNumber,
          name: input.carrierName,
        },
        origin: { ubigeo: input.originUbigeo, address: input.originAddress },
        destination: { ubigeo: input.destinationUbigeo, address: input.destinationAddress },
        transferStartedAt: input.transferStartedAt,
        items: input.items,
      }),
    });
    const data = (await res.json()) as {
      code?: string;
      error?: string;
      remissionGuideId?: string;
      series?: string;
      number?: number;
      transferReasonCode?: string;
      sunatStatus?: string;
    };
    if (!res.ok)
      return { ok: false, message: data.error ?? data.code ?? 'No se pudo emitir la guía.' };
    return {
      ok: true,
      remissionGuideId: String(data.remissionGuideId ?? ''),
      series: String(data.series ?? ''),
      number: Number(data.number ?? 0),
      transferReasonCode: String(data.transferReasonCode ?? ''),
      sunatStatus: String(data.sunatStatus ?? ''),
    };
  } catch {
    return { ok: false, message: 'Sin conexión con el servidor.' };
  }
}
