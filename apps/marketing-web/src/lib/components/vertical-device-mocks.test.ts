import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const RESTAURANT_MOCK = readFileSync(
  new URL('./vertical-mocks/RestaurantMock.svelte', import.meta.url),
  'utf8',
);
const PHARMACY_MOCK = readFileSync(
  new URL('./vertical-mocks/PharmacyMock.svelte', import.meta.url),
  'utf8',
);
const RETAIL_MOCK = readFileSync(
  new URL('./vertical-mocks/RetailMock.svelte', import.meta.url),
  'utf8',
);
const SERVICES_MOCK = readFileSync(
  new URL('./vertical-mocks/ServicesMock.svelte', import.meta.url),
  'utf8',
);
const CHAIN_MOCK = readFileSync(
  new URL('./vertical-mocks/ChainMock.svelte', import.meta.url),
  'utf8',
);
const VERTICAL_LANDING_VIEW = readFileSync(
  new URL('./VerticalLandingView.svelte', import.meta.url),
  'utf8',
);

const ALL_MOCKS = [
  { name: 'RestaurantMock', code: RESTAURANT_MOCK },
  { name: 'PharmacyMock', code: PHARMACY_MOCK },
  { name: 'RetailMock', code: RETAIL_MOCK },
  { name: 'ServicesMock', code: SERVICES_MOCK },
  { name: 'ChainMock', code: CHAIN_MOCK },
];

// Lista canónica de jerga técnica prohibida en copy de cara al cliente (V-26 / GTM §1)
const FORBIDDEN_JARGON = [
  /\bPSE\b/i,
  /\bCDR\b/i,
  /\bUBL\b/i,
  /\bD1\b/i,
  /\bWorkers\b/i,
  /\bEdge\b/i,
  /\bACID\b/i,
  /\bSOAP\b/i,
  /\bendpoint\b/i,
  /\bsharding\b/i,
  /\bDurable\s*Object\b/i,
  /\bCloudflare\b/i,
];

describe('Suite de Mockups de Dispositivos Interactivos por Vertical (KipusPay)', () => {
  describe('1. Encapsulación y Chasis Universal PhoneMockFrame (theme="dark")', () => {
    it.each(ALL_MOCKS)('$name encapsula PhoneMockFrame con theme="dark"', ({ code }) => {
      expect(code).toContain('PhoneMockFrame');
      expect(code).toContain('theme');
      expect(code).toMatch(/statusTone="live"/);
    });

    it('RestaurantMock configura título y badge de mesa de restaurante', () => {
      expect(RESTAURANT_MOCK).toContain('Restaurante · KipusPay');
      expect(RESTAURANT_MOCK).toContain('Salón');
      expect(RESTAURANT_MOCK).toContain('Mesa 04');
    });

    it('PharmacyMock configura título y badge de botica / farmacia', () => {
      expect(PHARMACY_MOCK).toContain('Botica & Farmacia · KipusPay');
      expect(PHARMACY_MOCK).toContain('Caja 1 · En línea');
    });

    it('RetailMock configura título y badge de minimarket y escáner', () => {
      expect(RETAIL_MOCK).toContain('Minimarket Express · KipusPay');
      expect(RETAIL_MOCK).toContain('Escáner activo');
    });

    it('ServicesMock configura título y badge de orden de servicio', () => {
      expect(SERVICES_MOCK).toContain('Servicios & Taller · KipusPay');
      expect(SERVICES_MOCK).toContain('Orden #OT-402');
    });

    it('ChainMock configura título y badge multi-local de cadenas', () => {
      expect(CHAIN_MOCK).toContain('Modo Dueño Cadenas · KipusPay');
      expect(CHAIN_MOCK).toContain('3 Locales en vivo');
    });
  });

  describe('2. Contenido Especializado de Cada Vertical', () => {
    describe('A. RestaurantMock (/para/restaurantes)', () => {
      it('incluye selector de mesas y comanda rápida (Mesa 04, Mesa 08, Mesa 12, Para Llevar)', () => {
        expect(RESTAURANT_MOCK).toContain('Mesa 04');
        expect(RESTAURANT_MOCK).toContain('Mesa 08');
        expect(RESTAURANT_MOCK).toContain('Mesa 12');
        expect(RESTAURANT_MOCK).toContain('Para Llevar');
      });

      it('incluye estado KDS de cocina en preparación', () => {
        expect(RESTAURANT_MOCK).toContain('Cocina: En preparación ✓');
      });

      it('incluye platos emblemáticos con sus montos en céntimos enteros (CAL-01)', () => {
        expect(RESTAURANT_MOCK).toContain('Ceviche clásico de pescado');
        expect(RESTAURANT_MOCK).toContain('3800');
        expect(RESTAURANT_MOCK).toContain('Lomo saltado criollo');
        expect(RESTAURANT_MOCK).toContain('4200');
        expect(RESTAURANT_MOCK).toContain('Jarra chicha morada 1L');
        expect(RESTAURANT_MOCK).toContain('1600');
      });

      it('soporta selector interactivo de división de cuenta (Cuenta completa vs Dividir entre 2)', () => {
        expect(RESTAURANT_MOCK).toContain('Cuenta completa');
        expect(RESTAURANT_MOCK).toContain('Dividir entre 2');
      });

      it('cuenta con botón de cobro interactivo con feedback "Mesa cobrada y liberada ✓"', () => {
        expect(RESTAURANT_MOCK).toContain('data-testid="restaurant-charge-btn"');
        expect(RESTAURANT_MOCK).toContain('Mesa cobrada y liberada ✓');
      });
    });

    describe('B. PharmacyMock (/para/farmacias)', () => {
      it('incluye barra de búsqueda por principio activo o marca', () => {
        expect(PHARMACY_MOCK).toContain('Buscar principio activo o marca...');
        expect(PHARMACY_MOCK).toContain('Amoxicilina');
      });

      it('incluye identificación de paciente y receta médica', () => {
        expect(PHARMACY_MOCK).toContain('Paciente: DNI 44892134 · Receta Dr. Mendoza');
      });

      it('incluye medicamentos con trazabilidad de lotes y vencimiento FEFO', () => {
        expect(PHARMACY_MOCK).toContain('Paracetamol 500mg x 20 tab');
        expect(PHARMACY_MOCK).toContain('850');
        expect(PHARMACY_MOCK).toContain('A24');
        expect(PHARMACY_MOCK).toContain('12/27');

        expect(PHARMACY_MOCK).toContain('Amoxicilina 500mg x 12 cap');
        expect(PHARMACY_MOCK).toContain('1400');
        expect(PHARMACY_MOCK).toContain('P18');
        expect(PHARMACY_MOCK).toContain('09/28');

        expect(PHARMACY_MOCK).toContain('Alcohol medicinal 70° 1L');
        expect(PHARMACY_MOCK).toContain('900');
        expect(PHARMACY_MOCK).toContain('L02');
      });

      it('cuenta con botón de cobro interactivo con feedback "Comprobante farmacia emitido ✓"', () => {
        expect(PHARMACY_MOCK).toContain('data-testid="pharmacy-charge-btn"');
        expect(PHARMACY_MOCK).toContain('Comprobante farmacia emitido ✓');
      });
    });

    describe('C. RetailMock (/para/retail)', () => {
      it('incluye indicador de escáner de código de barras a alta velocidad', () => {
        expect(RETAIL_MOCK).toContain('EAN-13: 7751234567890 · Lectura 0.1s');
      });

      it('incluye productos de mostrador y abarrotes con montos en céntimos', () => {
        expect(RETAIL_MOCK).toContain('Arroz Costeño Extra 5kg');
        expect(RETAIL_MOCK).toContain('2150');
        expect(RETAIL_MOCK).toContain('Aceite Vegetal Primor 1L');
        expect(RETAIL_MOCK).toContain('920');
        expect(RETAIL_MOCK).toContain('Detergente Bolívar 1kg');
        expect(RETAIL_MOCK).toContain('650');
      });

      it('incluye calculadora interactiva de vuelto en tiempo real', () => {
        expect(RETAIL_MOCK).toContain('Paga con: S/');
        expect(RETAIL_MOCK).toContain('Vuelto a entregar:');
        expect(RETAIL_MOCK).toContain('5000');
      });

      it('cuenta con botón de cobro interactivo con feedback "Venta cerrada · Caja abierta ✓"', () => {
        expect(RETAIL_MOCK).toContain('data-testid="retail-charge-btn"');
        expect(RETAIL_MOCK).toContain('Venta cerrada · Caja abierta ✓');
      });
    });

    describe('D. ServicesMock (/para/servicios)', () => {
      it('incluye orden de trabajo con datos de vehículo y cliente RUC B2B', () => {
        expect(SERVICES_MOCK).toContain('Vehículo: Toyota Hilux · Placa ABC-123');
        expect(SERVICES_MOCK).toContain('Transportes del Sur SAC (RUC 20601234567)');
      });

      it('incluye desglose de mano de obra y repuestos en céntimos', () => {
        expect(SERVICES_MOCK).toContain('Mantenimiento preventivo 10k km');
        expect(SERVICES_MOCK).toContain('12000');
        expect(SERVICES_MOCK).toContain('Aceite sintético 5W-30');
        expect(SERVICES_MOCK).toContain('14000');
        expect(SERVICES_MOCK).toContain('Filtro de aire motor');
        expect(SERVICES_MOCK).toContain('4500');
      });

      it('incluye desglose contable de Factura electrónica (OP. GRAVADA, IGV 18%, TOTAL)', () => {
        expect(SERVICES_MOCK).toContain('OP. GRAVADA');
        expect(SERVICES_MOCK).toContain('I.G.V. (18%)');
        expect(SERVICES_MOCK).toContain('TOTAL FACTURA');
      });

      it('cuenta con botón de cobro interactivo con feedback "Factura electrónica emitida ✓"', () => {
        expect(SERVICES_MOCK).toContain('data-testid="services-charge-btn"');
        expect(SERVICES_MOCK).toContain('Factura electrónica emitida ✓');
      });
    });

    describe('E. ChainMock (/para/cadenas)', () => {
      it('incluye selector multi-sede con montos consolidados de ventas', () => {
        expect(CHAIN_MOCK).toContain('Todas las sedes');
        expect(CHAIN_MOCK).toContain('1245000');
        expect(CHAIN_MOCK).toContain('Sede Miraflores');
        expect(CHAIN_MOCK).toContain('512000');
        expect(CHAIN_MOCK).toContain('Sede San Isidro');
        expect(CHAIN_MOCK).toContain('428000');
        expect(CHAIN_MOCK).toContain('Sede Surco');
        expect(CHAIN_MOCK).toContain('305000');
      });

      it('incluye módulo interactivo de transferencia de stock entre locales', () => {
        expect(CHAIN_MOCK).toContain('Transferencia #TR-882: Central → Miraflores');
        expect(CHAIN_MOCK).toContain('25 unidades de Bebidas 500ml transferidas');
      });

      it('cuenta con botón de aprobación interactivo con feedback "Transferencia autorizada y sincronizada ✓"', () => {
        expect(CHAIN_MOCK).toContain('data-testid="chain-transfer-btn"');
        expect(CHAIN_MOCK).toContain('Transferencia autorizada y sincronizada ✓');
      });
    });
  });

  describe('3. Integración en VerticalLandingView.svelte', () => {
    it('importa los 5 mockups especializados', () => {
      expect(VERTICAL_LANDING_VIEW).toContain("import RestaurantMock from '$lib/components/vertical-mocks/RestaurantMock.svelte';");
      expect(VERTICAL_LANDING_VIEW).toContain("import PharmacyMock from '$lib/components/vertical-mocks/PharmacyMock.svelte';");
      expect(VERTICAL_LANDING_VIEW).toContain("import RetailMock from '$lib/components/vertical-mocks/RetailMock.svelte';");
      expect(VERTICAL_LANDING_VIEW).toContain("import ServicesMock from '$lib/components/vertical-mocks/ServicesMock.svelte';");
      expect(VERTICAL_LANDING_VIEW).toContain("import ChainMock from '$lib/components/vertical-mocks/ChainMock.svelte';");
    });

    it('renderiza el mockup correspondiente según landing.slug con fallback a CheckoutMock', () => {
      expect(VERTICAL_LANDING_VIEW).toMatch(/landing\.slug === 'restaurantes'[\s\S]*?<RestaurantMock/);
      expect(VERTICAL_LANDING_VIEW).toMatch(/landing\.slug === 'farmacias'[\s\S]*?<PharmacyMock/);
      expect(VERTICAL_LANDING_VIEW).toMatch(/landing\.slug === 'retail'[\s\S]*?<RetailMock/);
      expect(VERTICAL_LANDING_VIEW).toMatch(/landing\.slug === 'servicios'[\s\S]*?<ServicesMock/);
      expect(VERTICAL_LANDING_VIEW).toMatch(/landing\.slug === 'cadenas'[\s\S]*?<ChainMock/);
      expect(VERTICAL_LANDING_VIEW).toMatch(/<CheckoutMock/);
    });
  });

  describe('4. Invariantes del Proyecto (CAL-01, V-26, Accesibilidad, Performance)', () => {
    it.each(ALL_MOCKS)('$name respeta CAL-01 (formatCents, cero toFixed)', ({ code }) => {
      expect(code).toContain('formatCents(');
      expect(code).not.toMatch(/\.to[F]ixed\s*\(/);
      expect(code).not.toMatch(/\bparseFloat\s*\(/);
      expect(code).not.toMatch(/\bNumber\s*\(/);
    });

    it.each(ALL_MOCKS)('$name tiene cero jerga técnica visible (V-26)', ({ code }) => {
      for (const pattern of FORBIDDEN_JARGON) {
        expect(code).not.toMatch(pattern);
      }
    });

    it.each(ALL_MOCKS)('$name cumple touch targets >= 44px en botones principales', ({ code }) => {
      expect(code).toMatch(/min-height:\s*44px;/);
    });

    it.each(ALL_MOCKS)('$name soporta prefers-reduced-motion', ({ code }) => {
      expect(code).toContain('@media (prefers-reduced-motion: reduce)');
    });

    it.each(ALL_MOCKS)('$name tiene scroll interno estilizado con max-height y overflow-y: auto', ({ code }) => {
      expect(code).toMatch(/max-height:\s*\d+px;/);
      expect(code).toMatch(/overflow-y:\s*auto;/);
      expect(code).toContain('::-webkit-scrollbar');
    });
  });
});
