import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROVIDER_INFO, RECLAMATIONS_PAGE } from '$lib/content/legal.js';

describe('Libro de Reclamaciones (AUD-01 & AUD-02 / Ley N° 31435 / D.S. 011-2011-PCM)', () => {
  const source = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

  it('el plazo de atención es de 15 días hábiles improrrogables conforme a Ley N° 31435', () => {
    const step3 = RECLAMATIONS_PAGE.steps[2];
    expect(step3.title).toContain('15 días hábiles');
    expect(step3.body).toMatch(/15 días hábiles improrrogables/i);
    expect(step3.body).toMatch(/Ley N° 31435/i);
    expect(step3.body).not.toMatch(/30 días/);
  });

  it('muestra la identificación del proveedor KipusPay S.A.C. con RUC y domicilio fiscal', () => {
    expect(PROVIDER_INFO.razonSocial).toBe('KipusPay S.A.C.');
    expect(PROVIDER_INFO.ruc).toMatch(/^\d{11}$/);
    expect(PROVIDER_INFO.domicilioFiscal).toContain('Lima, Perú');

    expect(source).toContain('PROVIDER_INFO.razonSocial');
    expect(source).toContain('PROVIDER_INFO.ruc');
    expect(source).toContain('PROVIDER_INFO.domicilioFiscal');
    expect(source).toContain('data-testid="provider-info"');
  });

  it('contiene los campos obligatorios del consumidor según D.S. 011-2011-PCM', () => {
    // 1. Identificación del consumidor
    expect(source).toContain('id="rec-name"');
    expect(source).toContain('id="rec-doc-type"');
    expect(source).toContain('id="rec-doc"');
    expect(source).toContain('id="rec-email"');
    expect(source).toContain('id="rec-phone"');

    // 2. Domicilio del consumidor
    expect(source).toContain('id="rec-address"');
    expect(source).toContain('id="rec-department"');
    expect(source).toContain('id="rec-province"');
    expect(source).toContain('id="rec-district"');

    // 3. Identificación del bien contratado
    expect(source).toContain('id="rec-good"');
    expect(source).toContain('id="rec-amount"');

    // 4. Detalle y pedido concreto
    expect(source).toContain('id="rec-kind"');
    expect(source).toContain('id="rec-detail"');
    expect(source).toContain('id="rec-request"');

    // 5. Botón de envío
    expect(source).toContain('id="rec-submit"');
  });

  it('todos los inputs, selects y textareas tienen etiqueta label con atributo for correspondiente', () => {
    const inputIds = [
      'rec-name',
      'rec-doc-type',
      'rec-doc',
      'rec-email',
      'rec-phone',
      'rec-address',
      'rec-department',
      'rec-province',
      'rec-district',
      'rec-good',
      'rec-amount',
      'rec-kind',
      'rec-detail',
      'rec-request',
    ];

    for (const id of inputIds) {
      expect(source, `Debe existir <label for="${id}">`).toContain(`for="${id}"`);
    }
  });

  it('posta a /v1/reclamaciones y procesa acuse con número de caso REC-', () => {
    expect(source).toContain('/v1/reclamaciones');
    expect(source).toContain('caseNumber');
    expect(source).toContain('data-testid="reclamacion-ack"');
  });
});
