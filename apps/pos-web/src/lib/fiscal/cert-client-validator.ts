/**
 * Validador local (client-side) de certificados tributarios SUNAT (.p12 / .pfx).
 * Ejecuta validación completa en microsegundos usando Web Crypto nativo
 * del navegador antes de enviar los datos al servidor.
 *
 * Cero dependencias npm externas (SEC-03, CAL-06).
 */
import {
  parsePkcs12,
  parseX509Subject,
  subjectHasUsoTributario,
  sunatCertRuc,
  type ParsedPkcs12,
} from '@kipuspay/domain-fiscal-pe';

export const MAX_CERT_FILE_BYTES = 48 * 1024; // 48 KB
export const MIN_CERT_FILE_BYTES = 32;

export type CertValidationErrorCode =
  | 'FILE_REQUIRED'
  | 'PASSWORD_REQUIRED'
  | 'CERT_TOO_SMALL'
  | 'CERT_TOO_LARGE'
  | 'CERT_DECRYPTION_FAILED'
  | 'CERT_EXPIRED'
  | 'CERT_INVALID_STRUCTURE'
  | 'CERT_RUC_NOT_FOUND'
  | 'CERT_RUC_MISMATCH'
  | 'CERT_NOT_USO_TRIBUTARIO';

export interface CertValidationSuccess {
  readonly valid: true;
  readonly expiresAt: string;
  readonly daysUntilExpiry: number;
  readonly ruc: string;
  readonly fingerprintSha256: string;
  readonly certChainPem: string;
  readonly issuerName?: string;
}

export interface CertValidationFailure {
  readonly valid: false;
  readonly code: CertValidationErrorCode;
  readonly errorMessage: string;
  readonly expiresAt?: string;
  readonly daysUntilExpiry?: number;
  readonly ruc?: string;
  readonly fingerprintSha256?: string;
}

export type CertValidationResult = CertValidationSuccess | CertValidationFailure;

export type CertTrafficLightStatus = 'KIPUSPAY_SIGNATURE' | 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';

/**
 * Calcula los días restantes hasta la fecha de expiración.
 */
export function computeDaysUntilExpiry(expiresAt: string, nowMs = Date.now()): number {
  const expMs = Date.parse(expiresAt);
  if (isNaN(expMs)) return 0;
  return Math.floor((expMs - nowMs) / (1000 * 60 * 60 * 24));
}

/**
 * Clasifica el estado del certificado en el semáforo visual:
 * - KIPUSPAY_SIGNATURE: Sin certificado cargado (Firma KipusPay activa, azul/gris)
 * - VALID: Certificado cargado con más de 30 días de vigencia (verde)
 * - EXPIRING_SOON: Certificado cargado con 30 días o menos de vigencia (amarillo preventivo)
 * - EXPIRED: Certificado vencido (0 días o menos, rojo)
 */
export function classifyCertTrafficLight(input: {
  readonly uploaded: boolean;
  readonly expiresAt?: string | null;
  readonly nowMs?: number;
}): CertTrafficLightStatus {
  if (!input.uploaded || !input.expiresAt) {
    return 'KIPUSPAY_SIGNATURE';
  }
  const days = computeDaysUntilExpiry(input.expiresAt, input.nowMs);
  if (days <= 0) {
    return 'EXPIRED';
  }
  if (days <= 30) {
    return 'EXPIRING_SOON';
  }
  return 'VALID';
}

/**
 * Valida un archivo de certificado digital en el navegador de manera inmediata.
 *
 * Pasos de validación:
 * 1. Presencia de archivo y contraseña
 * 2. Límite de tamaño (entre 32 B y 48 KB)
 * 3. Desencriptación y lectura de contenedor PKCS#12
 * 4. Vigencia temporal (no vencido)
 * 5. Extracción y presencia de RUC estructurado (patrón CDT: organizationIdentifier / OU)
 * 6. Coincidencia con el RUC esperado del negocio (si se provee)
 * 7. Atributo de uso tributario SUNAT (OU=USO TRIBUTARIO)
 */
// eslint-disable-next-line complexity
export async function validateClientCertificate(
  file: File | Blob | Uint8Array | null | undefined,
  password: string,
  expectedRuc?: string,
): Promise<CertValidationResult> {
  if (!file) {
    return {
      valid: false,
      code: 'FILE_REQUIRED',
      errorMessage: 'Debes seleccionar un archivo de certificado digital (.p12 o .pfx).',
    };
  }

  if (typeof password !== 'string' || !password.trim()) {
    return {
      valid: false,
      code: 'PASSWORD_REQUIRED',
      errorMessage: 'Debes ingresar la contraseña del certificado.',
    };
  }

  let bytes: Uint8Array;
  if (file instanceof Uint8Array) {
    bytes = file;
  } else if (typeof file.arrayBuffer === 'function') {
    const buffer = await file.arrayBuffer();
    bytes = new Uint8Array(buffer);
  } else {
    return {
      valid: false,
      code: 'FILE_REQUIRED',
      errorMessage: 'El archivo seleccionado no es válido.',
    };
  }

  if (bytes.byteLength < MIN_CERT_FILE_BYTES) {
    return {
      valid: false,
      code: 'CERT_TOO_SMALL',
      errorMessage: 'El archivo seleccionado es demasiado pequeño para ser un certificado válido.',
    };
  }

  if (bytes.byteLength > MAX_CERT_FILE_BYTES) {
    return {
      valid: false,
      code: 'CERT_TOO_LARGE',
      errorMessage: 'El archivo del certificado no debe superar los 48 KB.',
    };
  }

  let parsed: ParsedPkcs12;
  try {
    parsed = await parsePkcs12(bytes, password);
  } catch {
    return {
      valid: false,
      code: 'CERT_DECRYPTION_FAILED',
      errorMessage: 'No se pudo abrir el archivo. Revisa la contraseña y que sea .p12 o .pfx.',
    };
  }

  const expiresAtMs = Date.parse(parsed.expiresAt);
  const now = Date.now();
  if (isNaN(expiresAtMs) || expiresAtMs <= now) {
    return {
      valid: false,
      code: 'CERT_EXPIRED',
      errorMessage:
        'El certificado digital está vencido. Necesitas un certificado vigente para emitir.',
      expiresAt: parsed.expiresAt,
      daysUntilExpiry: 0,
      fingerprintSha256: parsed.fingerprintSha256,
    };
  }

  let subject;
  try {
    subject = parseX509Subject(parsed.certDer);
  } catch {
    return {
      valid: false,
      code: 'CERT_INVALID_STRUCTURE',
      errorMessage: 'No se pudo leer la estructura del certificado digital.',
      expiresAt: parsed.expiresAt,
      fingerprintSha256: parsed.fingerprintSha256,
    };
  }

  const certRuc = sunatCertRuc(subject);
  if (!certRuc) {
    return {
      valid: false,
      code: 'CERT_RUC_NOT_FOUND',
      errorMessage: 'El certificado no contiene un RUC estructurado para comprobantes de pago.',
      expiresAt: parsed.expiresAt,
      fingerprintSha256: parsed.fingerprintSha256,
    };
  }

  const cleanExpectedRuc = expectedRuc?.trim();
  if (cleanExpectedRuc && certRuc !== cleanExpectedRuc) {
    return {
      valid: false,
      code: 'CERT_RUC_MISMATCH',
      errorMessage: `El RUC del certificado (${certRuc}) no coincide con el RUC de tu negocio (${cleanExpectedRuc}).`,
      expiresAt: parsed.expiresAt,
      ruc: certRuc,
      fingerprintSha256: parsed.fingerprintSha256,
    };
  }

  if (!subjectHasUsoTributario(subject)) {
    return {
      valid: false,
      code: 'CERT_NOT_USO_TRIBUTARIO',
      errorMessage: 'El certificado no tiene el atributo de uso tributario requerido por SUNAT.',
      expiresAt: parsed.expiresAt,
      ruc: certRuc,
      fingerprintSha256: parsed.fingerprintSha256,
    };
  }

  const daysUntilExpiry = Math.floor((expiresAtMs - now) / (1000 * 60 * 60 * 24));

  return {
    valid: true,
    expiresAt: parsed.expiresAt,
    daysUntilExpiry,
    ruc: certRuc,
    fingerprintSha256: parsed.fingerprintSha256,
    certChainPem: parsed.certChainPem,
    issuerName: parsed.issuerSerial?.issuerName,
  };
}
