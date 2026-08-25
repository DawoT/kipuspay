import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyCertTrafficLight,
  computeDaysUntilExpiry,
  validateClientCertificate,
  MAX_CERT_FILE_BYTES,
} from './cert-client-validator.js';

const RUC_BUSINESS = '20123456789';
const RUC_OTHER = '20987654321';

function cdtSubject(ruc: string, usoTributario = true): string {
  const ous = usoTributario ? `${ruc}/OU=USO TRIBUTARIO` : ruc;
  return `/CN=Empresa Prueba SAC/O=EMPRESA/organizationIdentifier=NTRPE-${ruc}/OU=${ous}/C=PE`;
}

let sharedKeyPem: string | null = null;
function getSharedKeyPem(): string {
  if (!sharedKeyPem) {
    const dir = mkdtempSync(join(tmpdir(), 'kp-test-rsa-'));
    const keyPath = join(dir, 'k.pem');
    try {
      execFileSync('openssl', ['genrsa', '-out', keyPath, '2048'], { stdio: 'pipe' });
      sharedKeyPem = readFileSync(keyPath, 'utf8');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return sharedKeyPem;
}

const certCache = new Map<string, Uint8Array>();

function createP12Fixture(
  subj: string,
  options?: {
    readonly password?: string;
    readonly notBefore?: string;
    readonly notAfter?: string;
    readonly days?: string;
  },
): Uint8Array {
  const password = options?.password ?? 'correct-pass';
  const cacheKey = `${subj}|${password}|${options?.notBefore ?? ''}|${options?.notAfter ?? ''}|${options?.days ?? '365'}`;
  const cached = certCache.get(cacheKey);
  if (cached) return cached;

  const dir = mkdtempSync(join(tmpdir(), 'kp-p12-fix-'));
  try {
    const key = join(dir, 'k.pem');
    const cert = join(dir, 'c.pem');
    const p12 = join(dir, 't.p12');
    writeFileSync(key, getSharedKeyPem(), 'utf8');

    const reqArgs = ['req', '-new', '-x509', '-key', key, '-out', cert];
    if (options?.notAfter) {
      reqArgs.push('-not_before', options.notBefore ?? '20260101000000Z');
      reqArgs.push('-not_after', options.notAfter);
    } else {
      reqArgs.push('-days', options?.days ?? '365');
    }
    reqArgs.push('-subj', subj);
    execFileSync('openssl', reqArgs, { stdio: 'pipe' });

    execFileSync(
      'openssl',
      [
        'pkcs12',
        '-export',
        '-inkey',
        key,
        '-in',
        cert,
        '-out',
        p12,
        '-passout',
        `pass:${password}`,
        '-keypbe',
        'PBE-SHA1-3DES',
        '-certpbe',
        'PBE-SHA1-RC2-40',
        '-legacy',
      ],
      { stdio: 'pipe' },
    );

    const bytes = new Uint8Array(readFileSync(p12));
    certCache.set(cacheKey, bytes);
    return bytes;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('validateClientCertificate', { timeout: 30_000 }, () => {
  it('valida exitosamente un certificado CDT válido con RUC coincidente', async () => {
    const p12Bytes = createP12Fixture(cdtSubject(RUC_BUSINESS));
    const file = new File([p12Bytes as unknown as BlobPart], 'cert.p12', {
      type: 'application/x-pkcs12',
    });

    const result = await validateClientCertificate(file, 'correct-pass', RUC_BUSINESS);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.ruc).toBe(RUC_BUSINESS);
      expect(result.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.daysUntilExpiry).toBeGreaterThan(30);
      expect(result.certChainPem).toContain('BEGIN CERTIFICATE');
    }
  });

  it('valida exitosamente cuando no se especifica expectedRuc', async () => {
    const p12Bytes = createP12Fixture(cdtSubject(RUC_BUSINESS));
    const file = new File([p12Bytes as unknown as BlobPart], 'cert.pfx', {
      type: 'application/x-pkcs12',
    });

    const result = await validateClientCertificate(file, 'correct-pass');

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.ruc).toBe(RUC_BUSINESS);
    }
  });

  it('acepta directamente Uint8Array o Blob', async () => {
    const p12Bytes = createP12Fixture(cdtSubject(RUC_BUSINESS));
    const blob = new Blob([p12Bytes as unknown as BlobPart]);

    const resFromBytes = await validateClientCertificate(p12Bytes, 'correct-pass', RUC_BUSINESS);
    expect(resFromBytes.valid).toBe(true);

    const resFromBlob = await validateClientCertificate(blob, 'correct-pass', RUC_BUSINESS);
    expect(resFromBlob.valid).toBe(true);
  });

  it('rechaza cuando el archivo es nulo o indefinido', async () => {
    const result = await validateClientCertificate(null, 'pass');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('FILE_REQUIRED');
      expect(result.errorMessage).toContain('seleccionar un archivo');
    }
  });

  it('rechaza cuando la contraseña está vacía', async () => {
    const p12Bytes = createP12Fixture(cdtSubject(RUC_BUSINESS));
    const file = new File([p12Bytes as unknown as BlobPart], 'cert.p12');

    const result = await validateClientCertificate(file, '   ');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('PASSWORD_REQUIRED');
      expect(result.errorMessage).toContain('contraseña');
    }
  });

  it('rechaza archivos menores a 32 bytes', async () => {
    const smallBytes = new Uint8Array(20);
    const file = new File([smallBytes], 'small.p12');

    const result = await validateClientCertificate(file, 'pass');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('CERT_TOO_SMALL');
    }
  });

  it('rechaza archivos mayores al límite de 48 KB', async () => {
    const largeBytes = new Uint8Array(MAX_CERT_FILE_BYTES + 100);
    const file = new File([largeBytes], 'large.p12');

    const result = await validateClientCertificate(file, 'pass');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('CERT_TOO_LARGE');
    }
  });

  it('rechaza cuando la contraseña es incorrecta', async () => {
    const p12Bytes = createP12Fixture(cdtSubject(RUC_BUSINESS));
    const file = new File([p12Bytes as unknown as BlobPart], 'cert.p12');

    const result = await validateClientCertificate(file, 'wrong-password', RUC_BUSINESS);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('CERT_DECRYPTION_FAILED');
      expect(result.errorMessage).toContain('contraseña');
    }
  });

  it('rechaza cuando los bytes están corruptos', async () => {
    const corruptBytes = new Uint8Array(100).fill(0x55);
    corruptBytes[0] = 0x30;
    const file = new File([corruptBytes], 'corrupt.p12');

    const result = await validateClientCertificate(file, 'pass', RUC_BUSINESS);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('CERT_DECRYPTION_FAILED');
    }
  });

  it('rechaza certificados vencidos (expiresAt <= now)', async () => {
    const p12Bytes = createP12Fixture(cdtSubject(RUC_BUSINESS));
    const file = new File([p12Bytes as unknown as BlobPart], 'expired.p12');
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 400 * 24 * 60 * 60 * 1000));
    const result = await validateClientCertificate(file, 'correct-pass', RUC_BUSINESS);
    vi.useRealTimers();
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('CERT_EXPIRED');
      expect(result.errorMessage).toContain('vencido');
    }
  });

  it('rechaza certificados sin RUC estructurado en el Subject', async () => {
    const p12Bytes = createP12Fixture('/CN=Mi Negocio/O=Empresa/C=PE');
    const file = new File([p12Bytes as unknown as BlobPart], 'no-ruc.p12');

    const result = await validateClientCertificate(file, 'correct-pass', RUC_BUSINESS);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('CERT_RUC_NOT_FOUND');
    }
  });

  it('rechaza certificados cuyo RUC no coincide con el esperado', async () => {
    const p12Bytes = createP12Fixture(cdtSubject(RUC_OTHER));
    const file = new File([p12Bytes as unknown as BlobPart], 'other-ruc.p12');

    const result = await validateClientCertificate(file, 'correct-pass', RUC_BUSINESS);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('CERT_RUC_MISMATCH');
      expect(result.ruc).toBe(RUC_OTHER);
      expect(result.errorMessage).toContain(RUC_BUSINESS);
      expect(result.errorMessage).toContain(RUC_OTHER);
    }
  });

  it('rechaza certificados sin el atributo USO TRIBUTARIO', async () => {
    const p12Bytes = createP12Fixture(cdtSubject(RUC_BUSINESS, false));
    const file = new File([p12Bytes as unknown as BlobPart], 'no-uso.p12');

    const result = await validateClientCertificate(file, 'correct-pass', RUC_BUSINESS);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('CERT_NOT_USO_TRIBUTARIO');
      expect(result.errorMessage).toContain('uso tributario');
    }
  });
});

describe('classifyCertTrafficLight', () => {
  const now = new Date('2026-08-25T12:00:00Z').getTime();

  it('retorna KIPUSPAY_SIGNATURE cuando no está cargado o no tiene fecha', () => {
    expect(classifyCertTrafficLight({ uploaded: false, nowMs: now })).toBe('KIPUSPAY_SIGNATURE');
    expect(classifyCertTrafficLight({ uploaded: false, expiresAt: null, nowMs: now })).toBe(
      'KIPUSPAY_SIGNATURE',
    );
    expect(classifyCertTrafficLight({ uploaded: true, expiresAt: null, nowMs: now })).toBe(
      'KIPUSPAY_SIGNATURE',
    );
  });

  it('retorna VALID cuando quedan más de 30 días (>30d)', () => {
    const expiresAt = '2026-10-25T12:00:00.000Z'; // 61 días
    expect(classifyCertTrafficLight({ uploaded: true, expiresAt, nowMs: now })).toBe('VALID');
  });

  it('retorna EXPIRING_SOON cuando quedan 30 días o menos pero más de 0 días (<=30d)', () => {
    const expiresAt = '2026-09-10T12:00:00.000Z'; // 16 días
    expect(classifyCertTrafficLight({ uploaded: true, expiresAt, nowMs: now })).toBe(
      'EXPIRING_SOON',
    );

    const expires30d = '2026-09-24T12:00:00.000Z'; // 30 días exactos
    expect(classifyCertTrafficLight({ uploaded: true, expiresAt: expires30d, nowMs: now })).toBe(
      'EXPIRING_SOON',
    );
  });

  it('retorna EXPIRED cuando la fecha está vencida o es igual a 0 días (<=0d)', () => {
    const expiresPast = '2026-08-20T12:00:00.000Z'; // vencido hace 5 días
    expect(classifyCertTrafficLight({ uploaded: true, expiresAt: expiresPast, nowMs: now })).toBe(
      'EXPIRED',
    );

    const expiresToday = '2026-08-25T10:00:00.000Z'; // venció hace 2 horas
    expect(classifyCertTrafficLight({ uploaded: true, expiresAt: expiresToday, nowMs: now })).toBe(
      'EXPIRED',
    );
  });
});

describe('computeDaysUntilExpiry', () => {
  it('calcula la diferencia en días correctamente', () => {
    const nowMs = new Date('2026-08-25T00:00:00Z').getTime();
    const expiresAt = '2026-08-30T00:00:00.000Z';
    expect(computeDaysUntilExpiry(expiresAt, nowMs)).toBe(5);
  });

  it('devuelve 0 si la fecha no es válida', () => {
    expect(computeDaysUntilExpiry('invalid-date')).toBe(0);
  });
});
