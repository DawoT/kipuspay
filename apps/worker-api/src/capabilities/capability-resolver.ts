import { isCanonicalCapability } from '../platform/platform-capabilities-routes.js';

/**
 * Authoritative tenant capability guard.
 *
 * Session snapshots are intentionally not consulted here: they are discovery
 * data for the client only. Every mutation, job and WebSocket entry point must
 * re-read this state so a revocation takes effect without waiting for a client
 * refresh.
 */
export interface CapabilityResolverEnv {
  readonly DB?: D1Database;
  /** A global deployment kill switch may disable a capability, never enable it. */
  readonly FEATURE_FUEL_STATION?: string;
  readonly FEATURE_CATALOG_PRICE_LABELS?: string;
  readonly FEATURE_CATALOG_SELLABLE?: string;
  readonly FEATURE_CATALOG_QUICK_ADD?: string;
  readonly FEATURE_CATALOG_VARIANTS?: string;
  readonly FEATURE_CATALOG_UOM?: string;
  readonly FEATURE_PRICING_PROMOTIONS?: string;
  readonly FEATURE_PRICING_LISTS?: string;
  readonly FEATURE_PAYMENTS_QR_WALLETS?: string;
  readonly FEATURE_PAYMENTS_CARD_ACQUIRER?: string;
  readonly FEATURE_STOCK_TRANSFERS?: string;
  readonly FEATURE_PURCHASING_PARTIAL_RECEIVE?: string;
  readonly FEATURE_PURCHASING_THREE_WAY?: string;
  readonly FEATURE_PURCHASING_RETURNS?: string;
  readonly FEATURE_SALES_RETURNS?: string;
  readonly FEATURE_SALES_LAYAWAY?: string;
  readonly FEATURE_SALES_INSTALLMENTS?: string;
  readonly FEATURE_SALES_COMMISSIONS?: string;
  readonly FEATURE_SALES_RECURRING?: string;
  readonly FEATURE_HARDWARE_DIAGNOSTICS?: string;
  readonly FEATURE_ANALYTICS_FORECASTING?: string;
  readonly FEATURE_ANALYTICS_AGENTIC_INSIGHTS?: string;
  readonly FEATURE_ORDERS_KDS?: string;
  readonly FEATURE_ORDERS_CUSTOMER_ORDERS?: string;
  readonly FEATURE_MESSAGING_WHATSAPP?: string;
  readonly FEATURE_LEDGER_STORE_CREDIT?: string;
  readonly FEATURE_CASH_BLIND_Z?: string;
  readonly FEATURE_LOYALTY_POINTS?: string;
  readonly FEATURE_LEDGER_AR_AP?: string;
  readonly FEATURE_LEDGER_CHART_OF_ACCOUNTS?: string;
  readonly FEATURE_REPORTING_CATALOG?: string;
  readonly FEATURE_REPORTING_EXPORT?: string;
  readonly FEATURE_LPDP?: string;
  readonly FEATURE_OWNER_PUSH?: string;
  readonly FEATURE_MOBILE_PUSH?: string;
  readonly FEATURE_CLIENT_MOBILE_POS?: string;
  readonly FEATURE_CATALOG_IMPORT?: string;
  readonly FEATURE_INTEGRATIONS_API?: string;
  readonly FEATURE_ACCOUNTING_EXPORT?: string;
  readonly FEATURE_INVENTORY_LOCATIONS?: string;
  readonly FEATURE_INVENTORY_SERIALS?: string;
  readonly FEATURE_INVENTORY_SCALE?: string;
  readonly FEATURE_INVENTORY_BATCHES?: string;
  readonly FEATURE_INVENTORY_BOM?: string;
  readonly FEATURE_TEAM_INVITE?: string;
  readonly FEATURE_SHIFT_HANDOFF?: string;
  readonly FEATURE_ONBOARDING_TOUR?: string;
  readonly FEATURE_POS_CHECKOUT?: string;
  readonly FEATURE_DATA_BACKUP?: string;
  readonly FEATURE_PLATFORM_DR?: string;
  readonly FEATURE_GRE?: string;
  readonly FEATURE_SALES_DEBIT_NOTE?: string;
  readonly FEATURE_SALES_QUOTES?: string;
  readonly FEATURE_FISCAL_RC?: string;
  readonly FEATURE_CPE_PORTAL?: string;
  readonly FEATURE_FISCAL_WITHHOLDINGS?: string;
  readonly FEATURE_AUTH_CASHIER_LOGIN?: string;
  readonly FEATURE_REPORTING_ROLLUPS?: string;
  readonly FEATURE_PURCHASING_ORDERS?: string;
  readonly FEATURE_CASH_EXPENSES?: string;
  readonly FEATURE_SALE_TIP?: string;
  readonly FEATURE_CASH_DRAWER?: string;
  readonly FEATURE_BILLING_USAGE_OVERAGE?: string;
  readonly FEATURE_OWNER_MODE?: string;
}

export interface RequiredCapability {
  readonly capability: string;
  readonly config: CapabilityConfig;
  readonly epoch: number;
}

/** Configuración ya validada por capability; nunca se entrega JSON crudo al dominio. */
export type CapabilityConfig = Readonly<Record<string, unknown>> & {
  readonly version?: number;
  readonly source?: string;
};

export interface RequireCapabilityOptions {
  /** Epoch from a session snapshot; a mismatch requires the caller to refresh. */
  readonly expectedEpoch?: number;
}

export class CapabilityError extends Error {
  readonly status: 404 | 409 | 503;
  readonly code: 'CAPABILITY_DISABLED' | 'CAPABILITY_EPOCH_STALE' | 'CAPABILITIES_UNAVAILABLE';

  constructor(
    status: 404 | 409 | 503,
    code: 'CAPABILITY_DISABLED' | 'CAPABILITY_EPOCH_STALE' | 'CAPABILITIES_UNAVAILABLE',
  ) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

interface CapabilityRow {
  readonly enabled: number;
  readonly config_json: string;
  readonly epoch: number | null;
}

function requestIsInvalid(
  env: CapabilityResolverEnv,
  tenantId: string,
  capability: string,
): boolean {
  return (
    !tenantId.trim() ||
    !capability.trim() ||
    !isCanonicalCapability(capability) ||
    !killSwitchAllows(env, capability)
  );
}

const CAPABILITY_KILL_SWITCH: Readonly<
  Record<string, keyof CapabilityResolverEnv | readonly (keyof CapabilityResolverEnv)[]>
> = {
  'fuel.dispatch': 'FEATURE_FUEL_STATION',
  'fuel.island_shift': 'FEATURE_FUEL_STATION',
  'catalog.price_labels': 'FEATURE_CATALOG_PRICE_LABELS',
  'catalog.sellable': 'FEATURE_CATALOG_SELLABLE',
  'catalog.quick_add': 'FEATURE_CATALOG_QUICK_ADD',
  'catalog.variants': 'FEATURE_CATALOG_VARIANTS',
  'catalog.uom': 'FEATURE_CATALOG_UOM',
  'pricing.promotions': 'FEATURE_PRICING_PROMOTIONS',
  'pricing.lists': 'FEATURE_PRICING_LISTS',
  'payments.qr_wallets': 'FEATURE_PAYMENTS_QR_WALLETS',
  'payments.card_acquirer': 'FEATURE_PAYMENTS_CARD_ACQUIRER',
  'stock.transfers': 'FEATURE_STOCK_TRANSFERS',
  'purchasing.partial_receive': 'FEATURE_PURCHASING_PARTIAL_RECEIVE',
  'purchasing.three_way': 'FEATURE_PURCHASING_THREE_WAY',
  'purchasing.returns': 'FEATURE_PURCHASING_RETURNS',
  'sales.returns': 'FEATURE_SALES_RETURNS',
  'sales.layaway': 'FEATURE_SALES_LAYAWAY',
  'sales.installments': 'FEATURE_SALES_INSTALLMENTS',
  'sales.commissions': 'FEATURE_SALES_COMMISSIONS',
  'sales.recurring': 'FEATURE_SALES_RECURRING',
  'hardware.diagnostics': 'FEATURE_HARDWARE_DIAGNOSTICS',
  'analytics.forecasting': 'FEATURE_ANALYTICS_FORECASTING',
  'analytics.agentic_insights': 'FEATURE_ANALYTICS_AGENTIC_INSIGHTS',
  'orders.kds': 'FEATURE_ORDERS_KDS',
  'orders.customer_orders': 'FEATURE_ORDERS_CUSTOMER_ORDERS',
  'messaging.whatsapp': 'FEATURE_MESSAGING_WHATSAPP',
  'messaging.whatsapp_receipt': 'FEATURE_MESSAGING_WHATSAPP',
  'loyalty.points': 'FEATURE_LOYALTY_POINTS',
  'ledger.store_credit': 'FEATURE_LEDGER_STORE_CREDIT',
  'cash.blind_z': 'FEATURE_CASH_BLIND_Z',
  'ledger.accounts_receivable': 'FEATURE_LEDGER_AR_AP',
  'ledger.accounts_payable': 'FEATURE_LEDGER_AR_AP',
  'ledger.chart_of_accounts': 'FEATURE_LEDGER_CHART_OF_ACCOUNTS',
  'reporting.catalog': 'FEATURE_REPORTING_CATALOG',
  'reporting.export': 'FEATURE_REPORTING_EXPORT',
  'compliance.lpdp': 'FEATURE_LPDP',
  'owner.push_alerts': 'FEATURE_OWNER_PUSH',
  'mobile.push': 'FEATURE_MOBILE_PUSH',
  'client.mobile_pos': 'FEATURE_CLIENT_MOBILE_POS',
  'integrations.catalog_import': 'FEATURE_CATALOG_IMPORT',
  'integrations.api': 'FEATURE_INTEGRATIONS_API',
  'integrations.accounting_export': 'FEATURE_ACCOUNTING_EXPORT',
  'inventory.locations': 'FEATURE_INVENTORY_LOCATIONS',
  'inventory.serials': 'FEATURE_INVENTORY_SERIALS',
  'inventory.scale': 'FEATURE_INVENTORY_SCALE',
  'inventory.batches': 'FEATURE_INVENTORY_BATCHES',
  'inventory.bom': 'FEATURE_INVENTORY_BOM',
  'ops.team_invite': 'FEATURE_TEAM_INVITE',
  'ops.shift_handoff': 'FEATURE_SHIFT_HANDOFF',
  'onboarding.tour': 'FEATURE_ONBOARDING_TOUR',
  'pos.checkout': 'FEATURE_POS_CHECKOUT',
  'data.backup': 'FEATURE_DATA_BACKUP',
  'platform.dr': 'FEATURE_PLATFORM_DR',
  'fiscal.gre': 'FEATURE_GRE',
  'fiscal.debit_note': 'FEATURE_SALES_DEBIT_NOTE',
  'sales.quotes': 'FEATURE_SALES_QUOTES',
  'fiscal.rc': 'FEATURE_FISCAL_RC',
  'fiscal.cpe_portal': 'FEATURE_CPE_PORTAL',
  'fiscal.withholdings': 'FEATURE_FISCAL_WITHHOLDINGS',
  'auth.cashier_login': 'FEATURE_AUTH_CASHIER_LOGIN',
  'reporting.daily_rollups': 'FEATURE_REPORTING_ROLLUPS',
  'purchasing.orders': 'FEATURE_PURCHASING_ORDERS',
  'cash.register_expenses': 'FEATURE_CASH_EXPENSES',
  'cash.policy': ['FEATURE_SALE_TIP', 'FEATURE_CASH_DRAWER'],
  'billing.usage_overage': 'FEATURE_BILLING_USAGE_OVERAGE',
  'owner.mode': 'FEATURE_OWNER_MODE',
};

function killSwitchAllows(env: CapabilityResolverEnv, capability: string): boolean {
  // Global flags are kill switches only: absent/"1"/"true" leave the
  // decision to tenant_capabilities; only an explicit "0" takes service
  // away. This prevents deployment configuration from granting access.
  const configured = CAPABILITY_KILL_SWITCH[capability];
  if (configured === undefined) return true;
  const keys = (
    Array.isArray(configured) ? configured : [configured]
  ) as readonly (keyof CapabilityResolverEnv)[];
  return keys.every((key) => env[key] !== '0');
}

// eslint-disable-next-line complexity -- discriminated capability schemas are fail-closed
function parseConfig(capability: string, value: string): CapabilityConfig | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const config = parsed as Record<string, unknown>;
    if (
      (config.version !== undefined &&
        (!Number.isSafeInteger(config.version) || (config.version as number) < 1)) ||
      (config.source !== undefined &&
        (typeof config.source !== 'string' || config.source.trim().length === 0))
    ) {
      return null;
    }
    const integerFieldValid = (
      key: string,
      minimum = 0,
      maximum = Number.MAX_SAFE_INTEGER,
    ): boolean => {
      const field = config[key];
      return (
        field === undefined ||
        (typeof field === 'number' &&
          Number.isSafeInteger(field) &&
          field >= minimum &&
          field <= maximum)
      );
    };
    if (
      (capability === 'fuel.dispatch' || capability === 'fuel.island_shift') &&
      (!integerFieldValid('priceCentsPerGallon', 1) ||
        !integerFieldValid('igvRateBps', 0, 10_000) ||
        !integerFieldValid('detractionRateBps', 0, 10_000) ||
        !integerFieldValid('stockMicrounits'))
    ) {
      return null;
    }
    if (capability === 'inventory.batches') {
      const mode = config.mode;
      if (mode !== undefined && mode !== 'fefo' && mode !== 'fifo' && mode !== 'manual') {
        return null;
      }
    }
    if (config.catalog !== undefined) {
      if (!Array.isArray(config.catalog)) return null;
      for (const rawItem of config.catalog) {
        if (typeof rawItem !== 'object' || rawItem === null || Array.isArray(rawItem)) return null;
        const item = rawItem as Record<string, unknown>;
        if (typeof item.code !== 'string' || item.code.trim() === '') return null;
        if (item.name !== undefined && typeof item.name !== 'string') return null;
        if (
          (item.priceCentsPerGallon !== undefined &&
            (typeof item.priceCentsPerGallon !== 'number' ||
              !Number.isSafeInteger(item.priceCentsPerGallon) ||
              item.priceCentsPerGallon <= 0)) ||
          (item.igvRateBps !== undefined &&
            (typeof item.igvRateBps !== 'number' ||
              !Number.isSafeInteger(item.igvRateBps) ||
              item.igvRateBps < 0 ||
              item.igvRateBps > 10_000)) ||
          (item.detractionRateBps !== undefined &&
            (typeof item.detractionRateBps !== 'number' ||
              !Number.isSafeInteger(item.detractionRateBps) ||
              item.detractionRateBps < 0 ||
              item.detractionRateBps > 10_000)) ||
          (item.stockMicrounits !== undefined &&
            (typeof item.stockMicrounits !== 'number' ||
              !Number.isSafeInteger(item.stockMicrounits) ||
              item.stockMicrounits < 0))
        ) {
          return null;
        }
      }
    }
    return config;
  } catch {
    return null;
  }
}

export function validateCapabilityConfig(
  capability: string,
  configJson: string,
): CapabilityConfig | null {
  return parseConfig(capability, configJson);
}

export class CapabilityResolver {
  private readonly env: CapabilityResolverEnv;

  constructor(env: CapabilityResolverEnv) {
    this.env = env;
  }

  async require(
    tenantId: string,
    capability: string,
    options: RequireCapabilityOptions = {},
  ): Promise<RequiredCapability> {
    if (requestIsInvalid(this.env, tenantId, capability)) {
      throw new CapabilityError(404, 'CAPABILITY_DISABLED');
    }
    if (!this.env.DB) {
      throw new CapabilityError(503, 'CAPABILITIES_UNAVAILABLE');
    }

    let row: CapabilityRow | null;
    try {
      row = await this.env.DB.prepare(
        `SELECT tc.enabled, tc.config_json, e.epoch
           FROM tenant_capabilities tc
           LEFT JOIN tenant_data_epochs e ON e.tenant_id = tc.tenant_id
           WHERE tc.tenant_id = ? AND tc.capability = ?`,
      )
        .bind(tenantId, capability)
        .first<CapabilityRow>();
    } catch {
      throw new CapabilityError(503, 'CAPABILITIES_UNAVAILABLE');
    }

    if (!row || row.enabled !== 1) throw new CapabilityError(404, 'CAPABILITY_DISABLED');
    const config = parseConfig(capability, row.config_json);
    if (!config) throw new CapabilityError(503, 'CAPABILITIES_UNAVAILABLE');
    if (!Number.isInteger(row.epoch) || (row.epoch ?? -1) < 0) {
      throw new CapabilityError(503, 'CAPABILITIES_UNAVAILABLE');
    }
    const epoch = row.epoch as number;
    if (options.expectedEpoch !== undefined && options.expectedEpoch !== epoch) {
      throw new CapabilityError(409, 'CAPABILITY_EPOCH_STALE');
    }
    return { capability, config, epoch };
  }
}

/** Optional dependency lookup: tenant revocation is false, unavailable state propagates. */
export async function isCapabilityEnabled(
  env: CapabilityResolverEnv,
  tenantId: string,
  capability: string,
): Promise<boolean> {
  try {
    await new CapabilityResolver(env).require(tenantId, capability);
    return true;
  } catch (error) {
    if (error instanceof CapabilityError && error.status === 404) return false;
    throw error;
  }
}
