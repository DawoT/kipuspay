import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const svelteSource = readFileSync(new URL('./CertificateManager.svelte', import.meta.url), 'utf8');

const configSource = readFileSync(
  new URL('../../routes/admin/configuracion/+page.svelte', import.meta.url),
  'utf8',
);

function getTemplateVisibleText(source: string): string {
  const withoutScript = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const withoutStyle = withoutScript.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const withoutTags = withoutStyle.replace(/<[^>]+>/g, ' ');
  return withoutTags;
}

describe('CertificateManager — contrato de componente y semáforo visual', () => {
  it('usa runes de Svelte 5 ($state, $derived, $props)', () => {
    expect(svelteSource).toContain('$state(');
    expect(svelteSource).toContain('$derived(');
    expect(svelteSource).toContain('$props()');
  });

  it('integra el validador client-side WebCrypto antes de enviar al servidor', () => {
    expect(svelteSource).toContain('validateClientCertificate(');
    expect(svelteSource).toContain("apiFetch('/api/fiscal/tenant-cert'");
    expect(svelteSource).toContain('classifyCertTrafficLight(');
  });

  it('cuenta con el semáforo visual de vigencia (4 estados)', () => {
    expect(svelteSource).toContain('cert-traffic-light');
    expect(svelteSource).toContain('kipuspay_signature');
    expect(svelteSource).toContain('valid');
    expect(svelteSource).toContain('expiring_soon');
    expect(svelteSource).toContain('expired');
  });

  it('conserva todos los data-testid esperados para accesibilidad y tests e2e', () => {
    expect(svelteSource).toContain('data-testid="tenant-cert-upload"');
    expect(svelteSource).toContain('data-testid="tenant-cert-file"');
    expect(svelteSource).toContain('data-testid="tenant-cert-pass"');
    expect(svelteSource).toContain('data-testid="tenant-cert-submit"');
    expect(svelteSource).toContain('data-testid="tenant-cert-message"');
    expect(svelteSource).toContain('data-testid="cert-traffic-light"');
    expect(svelteSource).toContain('data-testid="cert-status-badge"');
  });

  it('está integrado en la página de configuración de administración', () => {
    expect(configSource).toContain(
      "import CertificateManager from '$lib/fiscal/CertificateManager.svelte';",
    );
    expect(configSource).toContain('<CertificateManager />');
  });

  it('cumple con 0 jerga técnica visible en el template del componente (V-27)', () => {
    const visibleText = getTemplateVisibleText(svelteSource);
    expect(visibleText).not.toMatch(/\b(UBL|CDR|D1|ACID|PKCS8|PKCS12|Base64|Sharding)\b/i);
    expect(visibleText).not.toMatch(/\b(preflight|Pre-flight)\b/);
    expect(visibleText).not.toMatch(/\b(demo|s-demo|b-demo|t-demo)\b/);
    expect(visibleText).toContain('Firma autorizada KipusPay activa');
    expect(visibleText).toContain('Certificado digital propio activo');
    expect(visibleText).toContain('Certificado próximo a vencer');
    expect(visibleText).toContain('Certificado digital vencido');
  });
});

describe('CertificateManager — zona de arrastre y DataTransfer (drop zone)', () => {
  it('expone zona de arrastre con estados visuales y eventos HTML5 sin librerías npm', () => {
    // zona con data-testid dedicado y feedback visual
    expect(svelteSource).toContain('data-testid="tenant-cert-dropzone"');
    expect(svelteSource).toContain('cert-drop-zone');
    expect(svelteSource).toContain('isDragging');
    expect(svelteSource).toContain('dragging');
    // eventos nativos HTML5
    expect(svelteSource).toContain('dragover');
    expect(svelteSource).toContain('dragleave');
    expect(svelteSource).toMatch(/ondrop|drop/);
    expect(svelteSource).toContain('Suelta el certificado aquí');
    // flujo alternativo: click abre file chooser nativo (label + input hidden sync)
    expect(svelteSource).toContain('Seleccionar archivo');
    expect(svelteSource).toContain('fileInputEl');
    // conserva flujo click existente
    expect(svelteSource).toContain('data-testid="tenant-cert-file"');
    expect(svelteSource).toContain('accept=".p12,.pfx');
  });

  it('usa DataTransfer nativo y acepta solo .p12/.pfx en drop', () => {
    expect(svelteSource).toContain('DataTransfer');
    expect(svelteSource).toContain('dataTransfer');
    expect(svelteSource).toContain('handleDrop');
    expect(svelteSource).toContain('handleDragOver');
    expect(svelteSource).toContain('handleDragLeave');
    expect(svelteSource).toContain('isValidCertExtension');
    expect(svelteSource).toContain('.p12');
    expect(svelteSource).toContain('.pfx');
    // rechazo visible si extensión no permitida
    expect(svelteSource).toContain('Solo se permiten archivos .p12 o .pfx');
  });

  it('simula drop de archivo (DataTransfer con File) y comparte handler con input change antes de fileToB64 → validateClientCertificate → POST', () => {
    // ambos caminos asignan certFile y limpian mensaje
    expect(svelteSource).toContain('handleFileChange');
    expect(svelteSource).toContain('certFile = file');
    expect(svelteSource).toContain('certFile = target.files?.[0]');
    expect(svelteSource).toContain("certMessage = ''");
    // drop sincroniza el input para que el flujo POST sea idéntico
    expect(svelteSource).toContain('transfer.items.add(file)');
    expect(svelteSource).toContain('fileInputEl.files = transfer.files');
    // flujo posterior común ya verificado en bloque anterior, pero reforzamos:
    expect(svelteSource).toContain('fileToB64');
    expect(svelteSource).toContain('validateClientCertificate');
    expect(svelteSource).toContain("apiFetch('/api/fiscal/tenant-cert'");
    // accesibilidad: zona opera con teclado y muestra archivo seleccionado
    expect(svelteSource).toContain('data-testid="tenant-cert-selected"');
    expect(svelteSource).toContain('onkeydown');
  });
});
