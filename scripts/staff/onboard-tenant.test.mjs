import { describe, expect, it } from 'vitest';
import {
  OnboardingError,
  applyOnboarding,
  assertTenantAbsent,
  buildKvSnapshot,
  buildOnboardingSql,
  buildPlan,
  buildPostVerifySql,
  buildPreflightSql,
  parseArgs,
  validateInputs,
} from './onboard-tenant.mjs';

/** Entrada canónica: RUC válido (checksum SUNAT OK, mismo algoritmo que Rosa Negra). */
const BASE_RAW = {
  tenantId: 'tenant_stg_prueba_001',
  ruc: '20612913251',
  nombre: 'PRUEBA EMISOR SAC',
};

function baseConfig(overrides = {}) {
  return validateInputs({ ...BASE_RAW, ...overrides });
}

describe('validaciones fail-closed', () => {
  it('acepta la entrada canónica y aplica defaults del camino A', () => {
    const cfg = baseConfig();
    expect(cfg.tenantId).toBe('tenant_stg_prueba_001');
    expect(cfg.ruc).toBe('20612913251');
    expect(cfg.businessName).toBe('PRUEBA EMISOR SAC');
    expect(cfg.taxRegime).toBe('RG');
    expect(cfg.docTypes).toEqual(['01', '03', '07', '08']);
    expect(cfg.env).toBe('staging');
    expect(cfg.apply).toBe(false); // default dry-run
  });

  it.each([
    ['sin prefijo tenant_', 'prueba_001'],
    ['con mayúsculas', 'tenant_STG_prueba'],
    ['con espacios', 'tenant_stg prueba'],
    ['vacío', ''],
    ['solo prefijo', 'tenant_'],
    ['con comillas (inyección)', "tenant_stg_x'; DROP TABLE tenants;--"],
  ])('rechaza tenant_id %s', (_label, bad) => {
    expect(() => baseConfig({ tenantId: bad })).toThrow(OnboardingError);
    try {
      baseConfig({ tenantId: bad });
    } catch (e) {
      expect(e.code).toBe('ERR_TENANT_ID_FORMAT');
    }
  });

  it.each([
    ['10 dígitos', '2061291325'],
    ['12 dígitos', '206129132512'],
    ['con letras', '20612913A51'],
    ['vacío', ''],
    ['con guiones', '20-6129132-5'],
  ])('rechaza RUC %s', (_label, bad) => {
    expect(() => baseConfig({ ruc: bad })).toThrow(OnboardingError);
    try {
      baseConfig({ ruc: bad });
    } catch (e) {
      expect(e.code).toBe('ERR_RUC_FORMAT');
    }
  });

  it('rechaza RUC con dígito verificador inválido (typo)', () => {
    expect(() => baseConfig({ ruc: '20612913252' })).toThrow(OnboardingError);
    try {
      baseConfig({ ruc: '20612913252' });
    } catch (e) {
      expect(e.code).toBe('ERR_RUC_CHECKSUM');
    }
  });

  it.each([
    ['Rosa Negra (emisor)', '20612913251'],
    ['Receptor prueba (RUC 10…)', '10715001701'],
  ])('acepta RUC real con checksum válido: %s', (_label, ruc) => {
    expect(baseConfig({ ruc }).ruc).toBe(ruc);
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
    ['ausente', undefined],
  ])('rechaza nombre %s', (_label, bad) => {
    expect(() => baseConfig({ nombre: bad })).toThrow(OnboardingError);
    try {
      baseConfig({ nombre: bad });
    } catch (e) {
      expect(e.code).toBe('ERR_BUSINESS_NAME_EMPTY');
    }
  });

  it('rechaza tipo de documento fuera del catálogo camino A', () => {
    expect(() => baseConfig({ docTypes: '01,99' })).toThrow(OnboardingError);
    try {
      baseConfig({ docTypes: '01,99' });
    } catch (e) {
      expect(e.code).toBe('ERR_DOC_TYPES_INVALID');
    }
  });

  it('rechaza régimen tributario fuera del CHECK de DDL', () => {
    expect(() => baseConfig({ taxRegime: 'ESPECIAL' })).toThrow(OnboardingError);
    try {
      baseConfig({ taxRegime: 'ESPECIAL' });
    } catch (e) {
      expect(e.code).toBe('ERR_TAX_REGIME_INVALID');
    }
  });

  it('fail-closed: solo staging hoy (canal productivo fiscal WAIT)', () => {
    expect(() => baseConfig({ env: 'production' })).toThrow(OnboardingError);
    try {
      baseConfig({ env: 'production' });
    } catch (e) {
      expect(e.code).toBe('ERR_ENV_UNSUPPORTED');
    }
  });

  it('normaliza doc-types con dedupe preservando orden', () => {
    const cfg = baseConfig({ docTypes: '03,01,03' });
    expect(cfg.docTypes).toEqual(['03', '01']);
  });
});

describe('generación de SQL', () => {
  it('contiene los INSERT esperados con ids derivados deterministas', () => {
    const cfg = baseConfig();
    const sql = buildOnboardingSql(cfg);
    expect(sql).toContain("INSERT INTO tenants (");
    expect(sql).toContain("'tenant_stg_prueba_001'");
    expect(sql).toContain("'20612913251'");
    expect(sql).toContain("'PRUEBA EMISOR SAC'");
    expect(sql).toContain(
      "INSERT INTO branches (id, tenant_id, code, name, address, is_active)",
    );
    expect(sql).toContain("'tenant_stg_prueba_001_branch_0001'");
    expect(sql).toContain(
      "INSERT INTO cash_registers (id, tenant_id, branch_id, name, is_active)",
    );
    expect(sql).toContain("'tenant_stg_prueba_001_register_0001'");
    expect(sql).toContain('INSERT INTO branch_document_series (');
    expect(sql).toContain('INSERT INTO payment_methods (tenant_id, id, code, name, is_active)');
  });

  it('mapea tipos de documento a series SUNAT (patrón Rosa Negra)', () => {
    const sql = buildOnboardingSql(baseConfig());
    expect(sql).toContain("'01', 'F001'");
    expect(sql).toContain("'03', 'B001'");
    expect(sql).toContain("'07', 'FC01'");
    expect(sql).toContain("'08', 'FD01'");
  });

  it('emite series AUTHORIZED con correlativo inicial 0', () => {
    const sql = buildOnboardingSql(baseConfig());
    expect(sql).toMatch(/'F001', 0, 'AUTHORIZED', 1\)/);
  });

  it('fija los campos del camino A emisor directo', () => {
    const sql = buildOnboardingSql(baseConfig());
    expect(sql).toContain("'ELECTRONIC_ISSUER'");
    expect(sql).toContain("'PENDING_UPLOAD'");
    expect(sql).toContain("'TENANT_CERT'");
    expect(sql).toContain(`'["01","03","07","08"]'`);
    expect(sql).toContain("'arranque'");
    expect(sql).toContain("'trial'");
  });

  it('escapa apóstrofes sin romper sentencias', () => {
    const cfg = baseConfig({ nombre: "MARIA'S EPPES SAC" });
    const sql = buildOnboardingSql(cfg);
    expect(sql).toContain("'MARIA''S EPPES SAC'");
    expect(sql).not.toContain("MARIA'S EPPES");
  });

  it('no usa INSERT OR IGNORE ni UPSERT: alta limpia o error tipado', () => {
    const sql = buildOnboardingSql(baseConfig());
    expect(sql).not.toMatch(/INSERT OR IGNORE/i);
    expect(sql).not.toMatch(/UPSERT/i);
    expect(sql).not.toMatch(/ON CONFLICT/i);
  });

  it('respeta docTypes recortados en series y JSON', () => {
    const cfg = baseConfig({ docTypes: '01,03' });
    const sql = buildOnboardingSql(cfg);
    expect(sql).toContain("'01', 'F001'");
    expect(sql).toContain("'03', 'B001'");
    expect(sql).not.toContain('FC01');
    expect(sql).toContain(`'["01","03"]'`);
  });
});

describe('preflight e idempotencia', () => {
  it('el preflight consulta existencia por id Y por RUC', () => {
    const sql = buildPreflightSql(baseConfig());
    expect(sql).toContain("FROM tenants WHERE id = 'tenant_stg_prueba_001'");
    expect(sql).toContain("FROM tenants WHERE ruc = '20612913251'");
    expect(sql).toContain('deleted_at IS NULL');
  });

  it('lanza TENANT_EXISTS si el tenant ya existe', () => {
    expect(() =>
      assertTenantAbsent([{ tenant_id_hits: 1, ruc_hits: 0 }]),
    ).toThrow(OnboardingError);
    try {
      assertTenantAbsent([{ tenant_id_hits: 1, ruc_hits: 0 }]);
    } catch (e) {
      expect(e.code).toBe('TENANT_EXISTS');
    }
  });

  it('lanza RUC_ALREADY_REGISTERED si el RUC vive en otro tenant', () => {
    try {
      assertTenantAbsent([
        {
          tenant_id_hits: 0,
          ruc_hits: 2,
          checked_tenant_id: 'tenant_stg_prueba_001',
          checked_ruc: '20612913251',
        },
      ]);
    } catch (e) {
      expect(e.code).toBe('RUC_ALREADY_REGISTERED');
      expect(e.message).toContain('20612913251');
    }
    expect.assertions(2);
  });

  it('pasa con contadores en cero', () => {
    expect(() =>
      assertTenantAbsent([{ tenant_id_hits: 0, ruc_hits: 0 }]),
    ).not.toThrow();
  });

  function fakeDeps({ preflightRows, postVerifyRows, calls = [] }) {
    return {
      writeFile: async (path, content) => {
        calls.push(['writeFile', path]);
        return path;
      },
      runWrangler: async (args) => {
        calls.push(['wrangler', args.join(' ')]);
        if (args.includes('--command') && args.some((a) => a.includes('tenant_id_hits'))) {
          return { stdout: JSON.stringify([{ results: preflightRows, success: true }]) };
        }
        if (args.includes('--command')) {
          return { stdout: JSON.stringify([{ results: postVerifyRows, success: true }]) };
        }
        return { stdout: '' };
      },
      calls,
    };
  }

  const POST_OK = [
    [{ tenants: 1, branches: 1, cash_registers: 1, series: 4, payment_methods: 1 }],
  ];

  it('apply aborta con TENANT_EXISTS antes de escribir o ejecutar nada', async () => {
    const deps = fakeDeps({
      preflightRows: [{ tenant_id_hits: 1, ruc_hits: 0 }],
      postVerifyRows: [],
    });
    await expect(
      applyOnboarding(baseConfig({ apply: true, kvNamespaceId: 'ns_x' }), deps),
    ).rejects.toMatchObject({ code: 'TENANT_EXISTS' });
    // Solo el preflight (SELECT read-only) ocurrió: ni archivo SQL, ni batch D1, ni KV.
    const kinds = deps.calls.map(([kind]) => kind);
    expect(kinds).toEqual(['wrangler']);
    expect(deps.calls[0][1]).toContain('tenant_id_hits');
  });

  it('apply feliz: preflight → SQL → D1 → KV → verificación, en ese orden', async () => {
    const deps = fakeDeps({
      preflightRows: [{ tenant_id_hits: 0, ruc_hits: 0 }],
      postVerifyRows: POST_OK[0],
    });
    const summary = await applyOnboarding(
      baseConfig({ apply: true, kvNamespaceId: 'ns_test_123' }),
      deps,
    );
    expect(summary.verified).toBe(true);
    const kinds = deps.calls.map(([kind]) => kind);
    expect(kinds[0]).toBe('wrangler'); // preflight
    expect(deps.calls[0][1]).toContain('tenant_id_hits');
    expect(kinds).toEqual([
      'wrangler', // preflight SELECT
      'writeFile', // sql file
      'wrangler', // d1 execute --file
      'writeFile', // kv json
      'wrangler', // kv key put
      'wrangler', // post-verify SELECT
    ]);
    expect(deps.calls[2][1]).toContain('--file');
    expect(deps.calls[4][1]).toMatch(/^kv key put tenant:tenant_stg_prueba_001/);
    expect(deps.calls[4][1]).toContain('--namespace-id=ns_test_123');
    expect(deps.calls[5][1]).toContain('payment_methods');
  });

  it('apply exige namespace KV explícito (fail-closed, sin default silencioso)', async () => {
    const deps = fakeDeps({
      preflightRows: [{ tenant_id_hits: 0, ruc_hits: 0 }],
      postVerifyRows: [],
    });
    await expect(
      applyOnboarding(baseConfig({ apply: true, kvNamespaceId: null }), deps),
    ).rejects.toMatchObject({ code: 'ERR_KV_NAMESPACE_REQUIRED' });
  });

  it('detecta aplicación parcial tras el batch (post-verificación)', async () => {
    const deps = fakeDeps({
      preflightRows: [{ tenant_id_hits: 0, ruc_hits: 0 }],
      postVerifyRows: [{ tenants: 1, branches: 1, cash_registers: 0, series: 2, payment_methods: 1 }],
    });
    await expect(
      applyOnboarding(baseConfig({ apply: true, kvNamespaceId: 'ns_x' }), deps),
    ).rejects.toMatchObject({ code: 'PARTIAL_APPLY' });
  });
});

describe('snapshot KV', () => {
  it('coincide con el patrón Rosa Negra (TENANT_KV)', () => {
    expect(buildKvSnapshot(baseConfig())).toEqual({
      id: 'tenant_stg_prueba_001',
      status: 'active',
      subscriptionStatus: 'trial',
      trialEndsAt: null,
      pastGracePeriod: false,
    });
  });
});

describe('verificación post-batch', () => {
  it('cuenta exactamente las filas esperadas por tabla', () => {
    const sql = buildPostVerifySql(baseConfig());
    expect(sql).toContain("WHERE id = 'tenant_stg_prueba_001'");
    expect(sql).toContain("WHERE tenant_id = 'tenant_stg_prueba_001'");
    expect(sql.match(/SELECT COUNT/g)).toHaveLength(5);
  });
});

describe('CLI', () => {
  it('default es dry-run: sin --apply no ejecuta', () => {
    const parsed = parseArgs([
      '--tenant-id', 'tenant_stg_prueba_001',
      '--ruc', '20612913251',
      '--nombre', 'PRUEBA EMISOR SAC',
    ]);
    expect(parsed.apply).toBe(false);
  });

  it('--apply activa ejecución', () => {
    const parsed = parseArgs([
      '--tenant-id', 'tenant_stg_prueba_001',
      '--ruc', '20612913251',
      '--nombre', 'X',
      '--apply',
    ]);
    expect(parsed.apply).toBe(true);
  });

  it('--dry-run y --apply juntos son rechazados', () => {
    try {
      parseArgs(['--tenant-id', 'tenant_a_001', '--ruc', '20612913251', '--nombre', 'X', '--dry-run', '--apply']);
    } catch (e) {
      expect(e.code).toBe('ERR_CONFLICTING_MODE');
    }
    expect.assertions(1);
  });

  it('flag desconocida es rechazada (fail-closed)', () => {
    try {
      parseArgs(['--magic']);
    } catch (e) {
      expect(e.code).toBe('ERR_UNKNOWN_FLAG');
    }
    expect.assertions(1);
  });

  it('faltan requeridos → error tipado con lista de faltantes', () => {
    try {
      parseArgs(['--tenant-id', 'tenant_a_001']);
    } catch (e) {
      expect(e.code).toBe('ERR_MISSING_REQUIRED');
      expect(e.message).toContain('--ruc');
      expect(e.message).toContain('--nombre');
    }
    expect.assertions(3);
  });

  it('el plan anuncia modo y tablas; dry-run visible', () => {
    const cfg = baseConfig();
    const plan = buildPlan(cfg, { apply: false });
    const text = plan.join('\n');
    expect(text).toContain('DRY-RUN');
    expect(text).toContain('tenants');
    expect(text).toContain('branch_document_series');
    expect(text).toContain('TENANT_KV');
  });

  it('el plan en modo apply exige namespace KV y lo muestra', () => {
    const plan = buildPlan(baseConfig({ apply: true, kvNamespaceId: 'ns_test_123' }), { apply: true });
    expect(plan.join('\n')).toContain('ns_test_123');
  });

  it('ninguna salida contiene material de secretos', () => {
    const cfg = baseConfig();
    const everything = [
      buildOnboardingSql(cfg),
      buildPreflightSql(cfg),
      buildPostVerifySql(cfg),
      JSON.stringify(buildKvSnapshot(cfg)),
      buildPlan(cfg, { apply: false }).join('\n'),
    ].join('\n');
    expect(everything).not.toMatch(/password|pin_hash|secret|BEGIN PRIVATE KEY/i);
  });
});
