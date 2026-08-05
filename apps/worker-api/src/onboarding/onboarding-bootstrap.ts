/**
 * Bootstrap de tenant + cambio de etapa — Sprint 11 / GTM §6.2 · §3.3.1.
 * Puro: sin D1; el adaptador de persistencia se cablea en la ruta HTTP.
 */

import {
  advanceFormalization,
  enabledDocumentTypesFor,
  type FormalizationMode,
} from '@kipuspay/domain-fiscal-pe';

export type VerticalType = 'restaurantes' | 'farmacias' | 'retail' | 'servicios' | 'cadenas';

export interface TenantBootstrapInput {
  readonly tradeName: string;
  readonly verticalType: VerticalType;
  readonly formalizationMode: FormalizationMode;
  readonly ruc: string | null;
}

export interface TenantBootstrapResult {
  readonly tenantId: string;
  readonly tradeName: string;
  readonly verticalType: VerticalType;
  readonly formalizationMode: FormalizationMode;
  readonly planId: 'arranque';
  readonly pseMode: 'KIPUSPAY_PSE';
  readonly enabledDocumentTypes: readonly string[];
  readonly ruc: string | null;
}

export function bootstrapTenant(
  input: TenantBootstrapInput,
  tenantId: string,
): TenantBootstrapResult {
  const tradeName = input.tradeName.trim();
  if (!tradeName) throw new Error('Nombre comercial requerido');
  const mode = input.formalizationMode;
  return {
    tenantId,
    tradeName,
    verticalType: input.verticalType,
    formalizationMode: mode,
    planId: 'arranque',
    pseMode: 'KIPUSPAY_PSE',
    enabledDocumentTypes: enabledDocumentTypesFor(mode),
    ruc: input.ruc,
  };
}

export interface StageChangeOpts {
  readonly confirmed: boolean;
}

export interface StageChangeResult {
  readonly formalizationMode: FormalizationMode;
  readonly enabledDocumentTypes: readonly string[];
  /** Siempre false: las NV históricas no se convierten. */
  readonly historicalNvConverted: false;
}

export function changeFormalizationStage(
  from: FormalizationMode,
  to: FormalizationMode,
  opts: StageChangeOpts,
): StageChangeResult {
  if (!opts.confirmed && from !== to) {
    throw new Error('Debes confirmar el cambio de etapa de formalizacion');
  }
  const mode = advanceFormalization(from, to);
  return {
    formalizationMode: mode,
    enabledDocumentTypes: enabledDocumentTypesFor(mode),
    historicalNvConverted: false,
  };
}
