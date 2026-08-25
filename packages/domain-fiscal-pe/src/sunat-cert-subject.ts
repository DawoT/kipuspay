/**
 * Identidad fiscal del subject de un certificado SUNAT (patrón del CDT real):
 * organizationIdentifier con prefijo NTRPE y el RUC, y/o OU igual al RUC.
 * El CN es libre (razón social) y NUNCA es fuente de identidad — SEC-03,
 * anti-spoofing.
 */
import type { X509Subject } from './x509-der.js';

const RUC_11 = /^\d{11}$/;

/**
 * RUC del certificado SOLO desde marcadores estructurados:
 * 1) organizationIdentifier «NTRPE-<RUC>» (prioritario), 2) OU «<RUC>».
 * Devuelve null si no hay marcador verificable → el route hace fail-closed.
 */
export function sunatCertRuc(subject: X509Subject): string | null {
  for (const attr of subject.attrs) {
    if (attr.key !== 'organizationIdentifier') continue;
    const match = /^NTRPE-(\d{11})$/.exec(attr.value.trim());
    if (match?.[1]) return match[1];
  }
  for (const attr of subject.attrs) {
    if (attr.key === 'OU' && RUC_11.test(attr.value.trim())) return attr.value.trim();
  }
  return null;
}

/** Marcador de uso tributario en cualquier valor del subject. */
export function subjectHasUsoTributario(subject: X509Subject): boolean {
  return subject.attrs.some((attr) =>
    attr.value.replace(/\s+/g, ' ').trim().toUpperCase().includes('USO TRIBUTARIO'),
  );
}
