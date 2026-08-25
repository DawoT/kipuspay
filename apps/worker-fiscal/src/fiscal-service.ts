/**
 * FiscalService — WorkerEntrypoint expuesto a worker-api vía service binding.
 * C6: centraliza el drain con el producer (produceFiscalXmlForSale) y el cron
 * self-healing. worker-api no toca R2/DB fiscales directamente; invoca
 * `drain`/`produceMissing` por RPC y el worker-fiscal hace el trabajo real.
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import {
  createTenantCertSigner,
  produceFiscalXmlForNonSale,
  produceFiscalXmlForSale,
  type D1DatabaseLike,
} from '@kipuspay/adapters-d1';
import {
  createSunatRcCdrPort,
  parseSunatBillChannel,
  resolveSunatBillEndpoint,
  SunatChannelError,
  type FiscalTransport,
} from '@kipuspay/adapters-sunat';
import { breakerDoName, bytesToBase64 } from '@kipuspay/domain-fiscal-pe';
import { readBreakerOpen } from './breaker-read-cache.js';
import { coalesceInfraFailure } from './breaker-coalesce.js';
import { drainFiscalOutbox, type FiscalDrainDb, type FiscalXmlR2 } from './fiscal-drain.js';
import { drainFiscalNonSaleOutbox } from './fiscal-non-sale-drain.js';
import { bootstrapBreakerCold } from './breaker-bootstrap.js';
import {
  isFiscalTransportPluginsEnabled,
  selectFiscalTransport,
  type FiscalTransportSelectEnv,
} from './select-transport.js';

export interface FiscalServiceEnv extends FiscalTransportSelectEnv {
  readonly DB?: FiscalDrainDb & D1DatabaseLike;
  readonly FISCAL_XML_R2?: FiscalXmlR2;
  readonly FEATURE_FISCAL_CIRCUIT_BREAKER?: string;
  readonly TENANT_CERT_ENVELOPE?: string;
  readonly BACKUP_KMS?: {
    unwrapDek(input: {
      readonly tenantId: string;
      readonly backupId: string;
      readonly wrappedDek: Uint8Array;
      readonly kekVersion: string;
    }): Promise<Uint8Array>;
    wrapDek?(input: {
      readonly tenantId: string;
      readonly backupId: string;
      readonly dek: Uint8Array;
    }): Promise<{ readonly wrappedDek: Uint8Array; readonly kekVersion: string }>;
  };
  readonly FISCAL_BREAKER_KV?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: unknown): Promise<void>;
  };
  readonly FISCAL_CIRCUIT_BREAKER_DO?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
  };
}

function isBreakerEnabled(env: FiscalServiceEnv): boolean {
  return (
    env.FEATURE_FISCAL_CIRCUIT_BREAKER === '1' || env.FEATURE_FISCAL_CIRCUIT_BREAKER === 'true'
  );
}

function selectTransport(env: FiscalServiceEnv): FiscalTransport {
  return selectFiscalTransport(env);
}

function xmlSigner(env: FiscalServiceEnv) {
  if (!env.DB || !env.BACKUP_KMS?.unwrapDek) return undefined;
  const envelope = env.TENANT_CERT_ENVELOPE;
  return createTenantCertSigner({
    db: env.DB,
    secrets: {
      get: (ref) => Promise.resolve(envelope && ref.includes('TENANT_CERT') ? envelope : null),
    },
    kms: env.BACKUP_KMS,
  });
}

const TENANT_CERT_BACKUP_ID = 'tenant-cert:SUNAT';

/** ¿El emisor exige certificado propio (firma obligatoria, sin mock)? */
async function tenantRequiresTenantCert(db: D1DatabaseLike, tenantId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT pse_mode FROM tenants WHERE id = ?`)
    .bind(tenantId)
    .first<{ readonly pse_mode?: string | null }>();
  return row?.pse_mode === 'TENANT_CERT';
}

export default class FiscalService extends WorkerEntrypoint<FiscalServiceEnv> {
  private async isBreakerOpen(): Promise<boolean> {
    const env = this.env;
    if (!isBreakerEnabled(env)) return false;
    const open = await readBreakerOpen(
      env.FISCAL_BREAKER_KV ?? null,
      'KIPUSPAY_PSE_DIRECT',
      'submit',
    );
    if (!open) return false;
    const bootstrapped = await bootstrapBreakerCold(env, 'KIPUSPAY_PSE_DIRECT', 'submit');
    return !bootstrapped;
  }

  private async onInfraFailure(): Promise<void> {
    const env = this.env;
    if (!isBreakerEnabled(env)) return;
    const key = breakerDoName('KIPUSPAY_PSE_DIRECT', 'submit');
    const count = coalesceInfraFailure(key, Date.now());
    if (count <= 0) return;
    const ns = env.FISCAL_CIRCUIT_BREAKER_DO;
    if (!ns) return;
    const stub = ns.get(ns.idFromName(key));
    const path =
      'https://breaker.local/increment?transport=' +
      'KIPUSPAY_PSE_DIRECT' +
      '&endpoint=' +
      'submit';
    await stub.fetch(new Request(path, { method: 'POST', body: JSON.stringify({ count }) }));
  }

  /** Drain completo: reclama filas y produce el XML que falte (self-healing). */
  async drain(options: { readonly limit?: number } = {}): Promise<unknown> {
    const env = this.env;
    if (!env.DB || !env.FISCAL_XML_R2) {
      return { error: 'FEATURE_OFF', code: 'FEATURE_OFF' };
    }
    const db = env.DB;
    const r2 = env.FISCAL_XML_R2;
    const transport = selectTransport(env);
    const shared = {
      db,
      r2,
      transport,
      isBreakerOpen: () => this.isBreakerOpen(),
      onInfraFailure: () => this.onInfraFailure(),
      ...(options.limit !== undefined ? { limit: options.limit } : {}),
    };
    const sale = await drainFiscalOutbox({
      ...shared,
      produceMissingXml: ({ tenantId, saleId }) => {
        const signer = xmlSigner(env);
        return tenantRequiresTenantCert(db, tenantId).then((needsCert) => {
          if (!signer && needsCert) return { outcome: 'MISSING_SIGNER' as const };
          return produceFiscalXmlForSale({
            db,
            r2,
            tenantId,
            saleId,
            ...(signer ? { signer } : {}),
          });
        });
      },
    });
    const nonSale = await drainFiscalNonSaleOutbox({
      ...shared,
      produceMissingXml: ({ tenantId, outboxId }) => {
        const signer = xmlSigner(env);
        return produceFiscalXmlForNonSale({
          db,
          r2,
          tenantId,
          outboxId,
          ...(signer ? { signer } : {}),
        });
      },
    });
    return {
      ...sale,
      processed: sale.processed + nonSale.processed,
      accepted: sale.accepted + nonSale.accepted,
    };
  }

  /**
   * Produce el XML de una venta individual (post-commit best-effort).
   * Fail-closed (§5.2): un emisor TENANT_CERT sin material KMS no emite XML
   * unsigned — MISSING_SIGNER, nunca PRODUCED sin firma.
   */
  async produceMissing(input: {
    readonly tenantId: string;
    readonly saleId: string;
  }): Promise<unknown> {
    const env = this.env;
    if (!env.DB || !env.FISCAL_XML_R2) {
      return { outcome: 'FEATURE_OFF' };
    }
    const signer = xmlSigner(env);
    if (!signer && (await tenantRequiresTenantCert(env.DB, input.tenantId))) {
      return { outcome: 'MISSING_SIGNER' };
    }
    return produceFiscalXmlForSale({
      db: env.DB,
      r2: env.FISCAL_XML_R2,
      tenantId: input.tenantId,
      saleId: input.saleId,
      ...(signer ? { signer } : {}),
    });
  }

  /**
   * Wrap del DEK de tenant vía KMS de backup (RPC consumido por
   * worker-api /v1/fiscal/tenant-cert/wrap). Sin KMS → MISSING_KMS fail-closed.
   */
  async wrapTenantDek(input: {
    readonly tenantId: string;
    readonly dek: Uint8Array;
    readonly backupId?: string;
  }): Promise<
    | { readonly wrappedDekB64: string; readonly kekVersion: string }
    | { readonly error: 'MISSING_KMS' }
  > {
    const kms = this.env.BACKUP_KMS;
    if (!kms?.wrapDek) return { error: 'MISSING_KMS' };
    const wrapped = await kms.wrapDek({
      tenantId: input.tenantId,
      backupId: input.backupId ?? TENANT_CERT_BACKUP_ID,
      dek: input.dek,
    });
    return { kekVersion: wrapped.kekVersion, wrappedDekB64: bytesToBase64(wrapped.wrappedDek) };
  }

  /**
   * Envía el Resumen Diario por SOAP sendSummary (ADR-FISCAL-007). Sin flag +
   * SOL → SOL_UNAVAILABLE (nunca mock, nunca ACCEPTED). El endpoint se resuelve
   * por canal (sunat-channel): staging default e-beta; producción solo URL
   * oficial — si no, 503 con el código del error tipado.
   */
  async submitRc(input: {
    readonly tenantId: string;
    readonly summaryId: string;
    readonly xml: string;
  }): Promise<{
    readonly accepted: boolean;
    readonly cdrCode: string;
    readonly cdrMessage: string;
  }> {
    const env = this.env;
    if (parseSunatBillChannel(env.SUNAT_BILL_CHANNEL) === 'production') {
      // Producción: emisión directa exige plugins + SOL propia; sin ellos,
      // rechazo tipado (nunca mock, nunca beta).
      if (!isFiscalTransportPluginsEnabled(env)) {
        return { accepted: false, cdrCode: '503', cdrMessage: 'SUNAT_PRODUCTION_PLUGINS_OFF' };
      }
      const prodSolUser = env.SUNAT_SOL_USER?.trim();
      if (!prodSolUser || !env.SUNAT_SOL_PASSWORD) {
        return { accepted: false, cdrCode: '503', cdrMessage: 'SUNAT_PRODUCTION_SOL_MISSING' };
      }
    }
    const solUser = env.SUNAT_SOL_USER?.trim();
    if (!isFiscalTransportPluginsEnabled(env) || !solUser || !env.SUNAT_SOL_PASSWORD) {
      return { accepted: false, cdrCode: '503', cdrMessage: 'SOL_UNAVAILABLE' };
    }
    let endpointUrl: string;
    try {
      ({ endpointUrl } = resolveSunatBillEndpoint({
        channel: env.SUNAT_BILL_CHANNEL,
        endpointUrl: env.SUNAT_BILL_ENDPOINT_URL,
      }));
    } catch (err) {
      if (err instanceof SunatChannelError) {
        return { accepted: false, cdrCode: '503', cdrMessage: err.code };
      }
      throw err;
    }
    const port = createSunatRcCdrPort({
      solUser,
      solPassword: env.SUNAT_SOL_PASSWORD,
      endpointUrl,
      channel: env.SUNAT_BILL_CHANNEL,
      ...(env.FISCAL_PSE_FETCH ? { fetchImpl: env.FISCAL_PSE_FETCH } : {}),
    });
    return port.submit({
      tenantId: input.tenantId,
      summaryId: input.summaryId,
      xml: input.xml,
    });
  }
}
