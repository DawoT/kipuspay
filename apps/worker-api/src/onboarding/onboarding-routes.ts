import type { WorkerEnv } from '../auth/control-plane.js';
import {
  bootstrapTenant,
  changeFormalizationStage,
  type TenantBootstrapInput,
  type VerticalType,
} from './onboarding-bootstrap.js';
import type { FormalizationMode } from '@kipuspay/domain-fiscal-pe';

const VERTICALS: readonly VerticalType[] = [
  'restaurantes',
  'farmacias',
  'retail',
  'servicios',
  'cadenas',
];

const MODES: readonly FormalizationMode[] = [
  'INTERNAL_CONTROL',
  'FORMALIZING',
  'ELECTRONIC_ISSUER',
];

function isVertical(v: unknown): v is VerticalType {
  return typeof v === 'string' && (VERTICALS as readonly string[]).includes(v);
}

function isMode(v: unknown): v is FormalizationMode {
  return typeof v === 'string' && (MODES as readonly string[]).includes(v);
}

export function runBootstrapHttp(
  _env: WorkerEnv,
  raw: unknown,
): { status: number; body: Record<string, unknown> } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 400, body: { error: 'Invalid JSON', code: 'BAD_REQUEST' } };
  }
  const o = raw as Record<string, unknown>;
  if (
    typeof o.tradeName !== 'string' ||
    !isVertical(o.verticalType) ||
    !isMode(o.formalizationMode)
  ) {
    return {
      status: 422,
      body: { error: 'Campos de onboarding invalidos', code: 'INVALID_ONBOARDING' },
    };
  }
  const input: TenantBootstrapInput = {
    tradeName: o.tradeName,
    verticalType: o.verticalType,
    formalizationMode: o.formalizationMode,
    ruc: typeof o.ruc === 'string' && o.ruc.length > 0 ? o.ruc : null,
  };
  try {
    const tenantId =
      typeof o.tenantId === 'string' && o.tenantId.length > 0
        ? o.tenantId
        : `t_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const result = bootstrapTenant(input, tenantId);
    return { status: 201, body: { ...result } };
  } catch (err) {
    return {
      status: 422,
      body: {
        error: err instanceof Error ? err.message : 'bootstrap failed',
        code: 'BOOTSTRAP_REJECTED',
      },
    };
  }
}

export function runFormalizationStageHttp(
  _env: WorkerEnv,
  raw: unknown,
): { status: number; body: Record<string, unknown> } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 400, body: { error: 'Invalid JSON', code: 'BAD_REQUEST' } };
  }
  const o = raw as Record<string, unknown>;
  if (!isMode(o.from) || !isMode(o.to) || typeof o.confirmed !== 'boolean') {
    return { status: 422, body: { error: 'Cambio de etapa invalido', code: 'INVALID_STAGE' } };
  }
  try {
    const result = changeFormalizationStage(o.from, o.to, { confirmed: o.confirmed });
    return { status: 200, body: { ...result } };
  } catch (err) {
    return {
      status: 422,
      body: {
        error: err instanceof Error ? err.message : 'stage rejected',
        code: 'STAGE_REJECTED',
      },
    };
  }
}
