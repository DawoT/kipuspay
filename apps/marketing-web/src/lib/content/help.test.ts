import { describe, expect, it } from 'vitest';
import { allHelpCategories, HELP_CATEGORIES, HELP_SECTIONS, searchHelpItems } from './help.js';

describe('help.ts content module', () => {
  it('retorna exactamente 6 categorias completas de ayuda', () => {
    const categories = allHelpCategories();
    expect(categories).toHaveLength(6);
    expect(HELP_SECTIONS).toHaveLength(6);
    expect(HELP_CATEGORIES).toHaveLength(6);

    const expectedCategoryIds = ['inicio', 'hardware', 'sunat', 'caja', 'inventario', 'planes'];
    expect(categories.map((c) => c.id)).toEqual(expectedCategoryIds);

    for (const cat of categories) {
      expect(cat.title.length).toBeGreaterThan(5);
      expect(cat.description.length).toBeGreaterThan(15);
      expect(cat.items.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('cuenta con más de 28 preguntas frecuentes catalogadas', () => {
    const totalItems = allHelpCategories().flatMap((c) => c.items);
    expect(totalItems.length).toBeGreaterThanOrEqual(28);
  });

  it('incluye las 5 preguntas críticas de hardware y exportación contable', () => {
    const hardwareSection = allHelpCategories().find((c) => c.id === 'hardware');
    expect(hardwareSection).toBeDefined();

    const hardwareText = hardwareSection!.items
      .map((i) => `${i.question} ${i.answer}`)
      .join(' ')
      .toLowerCase();

    // 1. Impresoras térmicas Epson/Xprinter 58/80mm
    expect(hardwareText).toMatch(/58mm|80mm/);
    expect(hardwareText).toMatch(/epson|xprinter/);

    // 2. Gavetas de dinero RJ11
    expect(hardwareText).toMatch(/rj11/);
    expect(hardwareText).toMatch(/gaveta/);

    // 3. Balanzas digitales
    expect(hardwareText).toMatch(/balanza/);

    // 4. Lectores de código de barras
    expect(hardwareText).toMatch(/código de barras|lector/);

    // 5. Exportación contable SIRE/Concar/Contasis
    const planesSection = allHelpCategories().find((c) => c.id === 'planes');
    expect(planesSection).toBeDefined();
    const planesText = planesSection!.items
      .map((i) => `${i.question} ${i.answer}`)
      .join(' ')
      .toLowerCase();
    expect(planesText).toMatch(/concar/);
    expect(planesText).toMatch(/sire/);
    expect(planesText).toMatch(/contasis/);
  });

  it('permite buscar items por palabra clave en pregunta o respuesta', () => {
    const results = searchHelpItems('internet');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.question.toLowerCase().includes('internet'))).toBe(true);

    const printerResults = searchHelpItems('epson');
    expect(printerResults.length).toBeGreaterThan(0);

    const rj11Results = searchHelpItems('rj11');
    expect(rj11Results.length).toBeGreaterThan(0);
  });

  it('retorna arreglo vacio si la consulta no coincide', () => {
    const results = searchHelpItems('termino_inexistente_xyz');
    expect(results).toHaveLength(0);
  });

  it('retorna arreglo vacio para query en blanco', () => {
    expect(searchHelpItems('')).toHaveLength(0);
    expect(searchHelpItems('   ')).toHaveLength(0);
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

  it('sin jerga técnica en el playbook (V-26 / GTM §1)', () => {
    const all = allHelpCategories()
      .flatMap((c) => c.items)
      .map((i) => `${i.question} ${i.answer}`)
      .join(' ');
    expect(all).not.toMatch(/\b(PSE|CDR|UBL|ACID|D1|Edge|Workers|SEV-\d)\b/i);
  });

  it('F-11: claims congelados llevan availability preparing (guía Q1/Q7/§6)', () => {
    const items = allHelpCategories().flatMap((c) => c.items);
    const frozenIds = ['activar-facturacion', 'insights-diario', 'pedidos-whatsapp', 'membresias'];
    for (const id of frozenIds) {
      const item = items.find((i) => i.id === id);
      expect(item, `item ${id} debería existir`).toBeTruthy();
      expect(item?.availability).toBe('preparing');
    }
    // Live claims no se marcan en preparación (offline 100% disponible desde Arranque).
    for (const id of [
      'primeros-pasos',
      'sin-internet',
      'limite-offline',
      'nota-de-venta-vs-boleta',
      'impresora-compatible',
      'equipos-soporte',
      'gaveta-dinero',
      'balanza-digital',
      'lector-codigos',
    ]) {
      expect(items.find((i) => i.id === id)?.availability).toBeUndefined();
    }
  });
});
