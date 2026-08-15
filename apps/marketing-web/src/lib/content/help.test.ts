import { describe, expect, it } from 'vitest';
import { allHelpCategories, searchHelpItems } from './help.js';

describe('help.ts content module', () => {
  it('retorna categorias de ayuda pobladas', () => {
    const categories = allHelpCategories();
    expect(categories.length).toBeGreaterThan(0);
    for (const cat of categories) {
      expect(cat.title).toBeTruthy();
      expect(cat.items.length).toBeGreaterThan(0);
    }
  });

  it('permite buscar items por palabra clave', () => {
    const results = searchHelpItems('internet');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].question.toLowerCase()).toContain('internet');
  });

  it('retorna arreglo vacio si la consulta no coincide', () => {
    const results = searchHelpItems('termino_inexistente_xyz');
    expect(results).toHaveLength(0);
  });

  it('playbook del documento maestro (M4C): insights, WhatsApp retiro, membresías, balanza, 3-way, crédito y anonimización', () => {
    const all = allHelpCategories()
      .flatMap((c) => c.items)
      .map((i) => `${i.question} ${i.answer}`)
      .join(' ')
      .toLowerCase();
    for (const keyword of [
      'insights',
      'whatsapp',
      'membresía',
      'balanza',
      'recepción',
      'crédito',
      'cuenta por cobrar',
      'anonimiz',
      '5 años',
    ]) {
      expect(all).toContain(keyword);
    }
    expect(all).not.toMatch(/sprint\s+\d+/i);
    expect(all).not.toMatch(/gtm-\d+/);
  });

  it('sin jerga técnica en el playbook', () => {
    const all = allHelpCategories()
      .flatMap((c) => c.items)
      .map((i) => `${i.question} ${i.answer}`)
      .join(' ');
    expect(all).not.toMatch(/\b(PSE|CDR|UBL|ACID|D1|Edge|Workers|SEV-\d)\b/i);
  });

  it('F-11: claims congelados llevan availability preparing (guía Q1/Q7/§6)', () => {
    const items = allHelpCategories().flatMap((c) => c.items);
    const frozenIds = [
      'activar-facturacion',
      'sin-internet',
      'limite-offline',
      'insights-diario',
      'pedidos-whatsapp',
      'membresias',
    ];
    for (const id of frozenIds) {
      const item = items.find((i) => i.id === id);
      expect(item, `item ${id} debería existir`).toBeTruthy();
      expect(item?.availability).toBe('preparing');
    }
    // Live claims no se marcan en preparación.
    for (const id of ['nota-de-venta-vs-boleta', 'impresora-compatible', 'equipos-soporte']) {
      expect(items.find((i) => i.id === id)?.availability).toBeUndefined();
    }
  });
});
