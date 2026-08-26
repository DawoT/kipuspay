import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allVerticals } from '$lib/content/verticals';

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
const GAS_MOCK = readFileSync(
  new URL('./vertical-mocks/GasMock.svelte', import.meta.url),
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
  { name: 'GasMock', code: GAS_MOCK },
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

    it.each(ALL_MOCKS)(
      '$name incluye selector de vistas con role="tablist" y role="tab"',
      ({ code }) => {
        expect(code).toContain('role="tablist"');
        expect(code).toContain('role="tab"');
        expect(code).toContain('aria-selected');
      },
    );

    it('RestaurantMock configura título y badge reactivo de restaurante', () => {
      expect(RESTAURANT_MOCK).toContain('Restaurante · KipusPay');
      expect(RESTAURANT_MOCK).toContain('Salón');
      expect(RESTAURANT_MOCK).toContain('Mesa 04');
    });

    it('PharmacyMock configura título y badge reactivo de botica / farmacia', () => {
      expect(PHARMACY_MOCK).toContain('Botica & Farmacia · KipusPay');
      expect(PHARMACY_MOCK).toContain('Caja 1 · En línea');
    });

    it('RetailMock configura título y badge reactivo de minimarket y escáner', () => {
      expect(RETAIL_MOCK).toContain('Minimarket Express · KipusPay');
      expect(RETAIL_MOCK).toContain('Escáner activo');
    });

    it('ServicesMock configura título y badge reactivo de orden de servicio', () => {
      expect(SERVICES_MOCK).toContain('Servicios & Taller · KipusPay');
      expect(SERVICES_MOCK).toContain('Orden #OT-402');
    });

    it('ChainMock configura título y badge reactivo multi-local de cadenas', () => {
      expect(CHAIN_MOCK).toContain('Modo Dueño Cadenas · KipusPay');
      expect(CHAIN_MOCK).toContain('3 Locales en vivo');
    });

    it('GasMock configura título y badge reactivo de grifo y estación de servicio', () => {
      expect(GAS_MOCK).toContain('Grifo · KipusPay');
      expect(GAS_MOCK).toContain('Isleta 2 · Despachando');
    });
  });

  describe('2. Contenido Especializado y 3 Vistas Interactivas por Mockup', () => {
    describe('A. RestaurantMock (/para/restaurantes)', () => {
      it('contiene los tabs de las 3 vistas: [Comanda], [KDS Cocina], [Mapa Salón]', () => {
        expect(RESTAURANT_MOCK).toContain('[Comanda]');
        expect(RESTAURANT_MOCK).toContain('[KDS Cocina]');
        expect(RESTAURANT_MOCK).toContain('[Mapa Salón]');
      });

      it('Vista 1 [Comanda]: incluye mesas, platos en céntimos y división de cuenta', () => {
        expect(RESTAURANT_MOCK).toContain('Mesa 04');
        expect(RESTAURANT_MOCK).toContain('Ceviche clásico de pescado');
        expect(RESTAURANT_MOCK).toContain('3800');
        expect(RESTAURANT_MOCK).toContain('Lomo saltado criollo');
        expect(RESTAURANT_MOCK).toContain('4200');
        expect(RESTAURANT_MOCK).toContain('Cuenta completa');
        expect(RESTAURANT_MOCK).toContain('Dividir entre 2');
        expect(RESTAURANT_MOCK).toContain('data-testid="restaurant-charge-btn"');
        expect(RESTAURANT_MOCK).toContain('Mesa cobrada y liberada ✓');
      });

      it('Vista 2 [KDS Cocina]: incluye comandas en tiempo real y botón marcar listo', () => {
        expect(RESTAURANT_MOCK).toContain('#CMD-084 · Mesa 04');
        expect(RESTAURANT_MOCK).toContain('1x Ceviche clásico');
        expect(RESTAURANT_MOCK).toContain('1x Lomo saltado');
        expect(RESTAURANT_MOCK).toContain('En preparación');
        expect(RESTAURANT_MOCK).toContain('8 min');
        expect(RESTAURANT_MOCK).toContain('Marcar: Listo para servir ✓');

        expect(RESTAURANT_MOCK).toContain('#CMD-085 · Mesa 08');
        expect(RESTAURANT_MOCK).toContain('2x Menú criollo');
        expect(RESTAURANT_MOCK).toContain('En cola');
        expect(RESTAURANT_MOCK).toContain('2 min');

        expect(RESTAURANT_MOCK).toContain('#CMD-082 · Mesa 12');
        expect(RESTAURANT_MOCK).toContain('1x Tiradito');
        expect(RESTAURANT_MOCK).toContain('Servido ✓');
      });

      it('Vista 3 [Mapa Salón]: incluye plano visual de mesas y mozo asignado', () => {
        expect(RESTAURANT_MOCK).toContain('M-01 (Libre)');
        expect(RESTAURANT_MOCK).toContain('M-02 (Ocupada · S/ 65.00)');
        expect(RESTAURANT_MOCK).toContain('M-03 (Libre)');
        expect(RESTAURANT_MOCK).toContain('M-04 (Por cobrar · S/ 96.00)');
        expect(RESTAURANT_MOCK).toContain('M-05 (Reservada)');
        expect(RESTAURANT_MOCK).toContain('Mozo: Carlos M.');
      });
    });

    describe('B. PharmacyMock (/para/farmacias)', () => {
      it('contiene los tabs de las 3 vistas: [Despacho], [Control FEFO], [Fraccionamiento]', () => {
        expect(PHARMACY_MOCK).toContain('[Despacho]');
        expect(PHARMACY_MOCK).toContain('[Control FEFO]');
        expect(PHARMACY_MOCK).toContain('[Fraccionamiento]');
      });

      it('Vista 1 [Despacho]: incluye búsqueda por principio activo, receta y lotes FEFO', () => {
        expect(PHARMACY_MOCK).toContain('Buscar principio activo o marca...');
        expect(PHARMACY_MOCK).toContain('Amoxicilina');
        expect(PHARMACY_MOCK).toContain('Paciente: DNI 44892134 · Receta Dr. Mendoza');
        expect(PHARMACY_MOCK).toContain('Paracetamol 500mg x 20 tab');
        expect(PHARMACY_MOCK).toContain('850');
        expect(PHARMACY_MOCK).toContain('A24');
        expect(PHARMACY_MOCK).toContain('data-testid="pharmacy-charge-btn"');
        expect(PHARMACY_MOCK).toContain('Comprobante farmacia emitido ✓');
      });

      it('Vista 2 [Control FEFO]: incluye semáforo de lotes y descuento FEFO', () => {
        expect(PHARMACY_MOCK).toContain('48 Lotes vigentes');
        expect(PHARMACY_MOCK).toContain('3 Lotes próximos');
        expect(PHARMACY_MOCK).toContain('Ibuprofeno Lote X02');
        expect(PHARMACY_MOCK).toContain('1 Lote crítico');
        expect(PHARMACY_MOCK).toContain('Vence en 15 días · Alerta de rotación prioritaria');
        expect(PHARMACY_MOCK).toContain('Aplicar descuento FEFO automático');
      });

      it('Vista 3 [Fraccionamiento]: incluye venta por caja, blíster y pastillas sueltas', () => {
        expect(PHARMACY_MOCK).toContain('Paracetamol 500mg');
        expect(PHARMACY_MOCK).toContain('Caja x 100 tab');
        expect(PHARMACY_MOCK).toContain('3500');
        expect(PHARMACY_MOCK).toContain('Blíster x 10 tab');
        expect(PHARMACY_MOCK).toContain('400');
        expect(PHARMACY_MOCK).toContain('4 tabletas sueltas');
        expect(PHARMACY_MOCK).toContain('180');
        expect(PHARMACY_MOCK).toContain('Agregar fraccionado al ticket');
      });
    });

    describe('C. RetailMock (/para/retail)', () => {
      it('contiene los tabs de las 3 vistas: [Caja Express], [Balanza Digital], [Promociones]', () => {
        expect(RETAIL_MOCK).toContain('[Caja Express]');
        expect(RETAIL_MOCK).toContain('[Balanza Digital]');
        expect(RETAIL_MOCK).toContain('[Promociones]');
      });

      it('Vista 1 [Caja Express]: incluye escáner EAN-13, abarrotes y calculadora de vuelto', () => {
        expect(RETAIL_MOCK).toContain('EAN-13: 7751234567890 · Lectura 0.1s');
        expect(RETAIL_MOCK).toContain('Arroz Costeño Extra 5kg');
        expect(RETAIL_MOCK).toContain('2150');
        expect(RETAIL_MOCK).toContain('Paga con: S/');
        expect(RETAIL_MOCK).toContain('Vuelto a entregar:');
        expect(RETAIL_MOCK).toContain('data-testid="retail-charge-btn"');
        expect(RETAIL_MOCK).toContain('Venta cerrada · Caja abierta ✓');
      });

      it('Vista 2 [Balanza Digital]: incluye pesaje en tiempo real y cálculo exacto', () => {
        expect(RETAIL_MOCK).toContain('Balanza USB / Bluetooth · Peso estable: 1.450 kg');
        expect(RETAIL_MOCK).toContain('Pollo fresco eviscerado · Precio: S/ 9.80 / kg');
        expect(RETAIL_MOCK).toContain('1.450 kg × S/ 9.80 = S/ 14.21');
        expect(RETAIL_MOCK).toContain('1421');
        expect(RETAIL_MOCK).toContain('Tara / Pesar');
        expect(RETAIL_MOCK).toContain('Agregar pesado a caja');
      });

      it('Vista 3 [Promociones]: incluye combos 2x1 y packs automáticos', () => {
        expect(RETAIL_MOCK).toContain('Promo 2x1 Detergente Bolívar 1kg');
        expect(RETAIL_MOCK).toContain('Segunda unidad gratis · Ahorro S/ 6.50');
        expect(RETAIL_MOCK).toContain('Pack Abarrotes del Día');
        expect(RETAIL_MOCK).toContain('Arroz 5kg + Aceite 1L con 10% dto · Total: S/ 27.63');
        expect(RETAIL_MOCK).toContain('Aplicar promoción en caja');
      });
    });

    describe('D. ServicesMock (/para/servicios)', () => {
      it('contiene los tabs de las 3 vistas: [Orden #OT-402], [Historial Placa], [Detracción SUNAT]', () => {
        expect(SERVICES_MOCK).toContain('[Orden #OT-402]');
        expect(SERVICES_MOCK).toContain('[Historial Placa]');
        expect(SERVICES_MOCK).toContain('[Detracción SUNAT]');
      });

      it('Vista 1 [Orden #OT-402]: incluye orden B2B, mano de obra, repuestos y Factura SUNAT', () => {
        expect(SERVICES_MOCK).toContain('Vehículo: Toyota Hilux · Placa ABC-123');
        expect(SERVICES_MOCK).toContain('Transportes del Sur SAC (RUC 20601234567)');
        expect(SERVICES_MOCK).toContain('Mantenimiento preventivo 10k km');
        expect(SERVICES_MOCK).toContain('12000');
        expect(SERVICES_MOCK).toContain('OP. GRAVADA');
        expect(SERVICES_MOCK).toContain('I.G.V. (18%)');
        expect(SERVICES_MOCK).toContain('data-testid="services-charge-btn"');
        expect(SERVICES_MOCK).toContain('Factura electrónica emitida ✓');
      });

      it('Vista 2 [Historial Placa]: incluye consulta de placa, kilometraje y servicios previos', () => {
        expect(SERVICES_MOCK).toContain('Placa ABC-123 · Toyota Hilux 2022');
        expect(SERVICES_MOCK).toContain('15/04/2026');
        expect(SERVICES_MOCK).toContain('Cambio de pastillas de freno');
        expect(SERVICES_MOCK).toContain('18000');
        expect(SERVICES_MOCK).toContain('10/01/2026');
        expect(SERVICES_MOCK).toContain('Mantenimiento 5,000 km');
        expect(SERVICES_MOCK).toContain('9500');
        expect(SERVICES_MOCK).toContain('Transportes del Sur SAC · 8 servicios realizados');
        expect(SERVICES_MOCK).toContain('Cargar datos para nueva orden');
      });

      it('Vista 3 [Detracción SUNAT]: incluye cálculo de régimen SPOT del 12%', () => {
        expect(SERVICES_MOCK).toContain('Mantenimiento de flota · S/ 850.00');
        expect(SERVICES_MOCK).toContain('85000');
        expect(SERVICES_MOCK).toContain('Monto detracción SUNAT: S/ 102.00');
        expect(SERVICES_MOCK).toContain('10200');
        expect(SERVICES_MOCK).toContain('Neto a pagar: S/ 748.00');
        expect(SERVICES_MOCK).toContain('74800');
        expect(SERVICES_MOCK).toContain('Generar comprobante con código de detracción');
      });
    });

    describe('E. ChainMock (/para/cadenas)', () => {
      it('contiene los tabs de las 3 vistas: [Ventas Sedes], [Transferencias], [Ranking Locales]', () => {
        expect(CHAIN_MOCK).toContain('[Ventas Sedes]');
        expect(CHAIN_MOCK).toContain('[Transferencias]');
        expect(CHAIN_MOCK).toContain('[Ranking Locales]');
      });

      it('Vista 1 [Ventas Sedes]: incluye consolidado multi-sede y autorización', () => {
        expect(CHAIN_MOCK).toContain('Todas las sedes');
        expect(CHAIN_MOCK).toContain('1245000');
        expect(CHAIN_MOCK).toContain('Sede Miraflores');
        expect(CHAIN_MOCK).toContain('512000');
        expect(CHAIN_MOCK).toContain('data-testid="chain-transfer-btn"');
        expect(CHAIN_MOCK).toContain('Transferencia autorizada y sincronizada ✓');
      });

      it('Vista 2 [Transferencias]: incluye solicitudes de despacho y recepción entre locales', () => {
        expect(CHAIN_MOCK).toContain('Solicitud #TR-882');
        expect(CHAIN_MOCK).toContain('Sede Central');
        expect(CHAIN_MOCK).toContain('Miraflores');
        expect(CHAIN_MOCK).toContain('25 unid. Bebidas');

        expect(CHAIN_MOCK).toContain('Solicitud #TR-883');
        expect(CHAIN_MOCK).toContain('Sede San Isidro');
        expect(CHAIN_MOCK).toContain('Surco');
        expect(CHAIN_MOCK).toContain('10 unid. Insumos');

        expect(CHAIN_MOCK).toContain('Aprobar y despachar mercadería');
      });

      it('Vista 3 [Ranking Locales]: incluye ranking, metas diarias y consolidado', () => {
        expect(CHAIN_MOCK).toContain('1° Miraflores');
        expect(CHAIN_MOCK).toContain('512000');
        expect(CHAIN_MOCK).toContain('108% de la meta diaria 🏆');

        expect(CHAIN_MOCK).toContain('2° San Isidro');
        expect(CHAIN_MOCK).toContain('428000');
        expect(CHAIN_MOCK).toContain('95% de la meta diaria');

        expect(CHAIN_MOCK).toContain('3° Surco');
        expect(CHAIN_MOCK).toContain('305000');
        expect(CHAIN_MOCK).toContain('88% de la meta diaria');

        expect(CHAIN_MOCK).toContain('Total consolidado: S/ 12,450.00');
        expect(CHAIN_MOCK).toContain('98% meta global');
      });
    });

    describe('F. GasMock (/para/grifos)', () => {
      it('contiene los tabs de las 3 vistas: [Surtidor], [Precios], [Flota]', () => {
        expect(GAS_MOCK).toContain('[Surtidor]');
        expect(GAS_MOCK).toContain('[Precios]');
        expect(GAS_MOCK).toContain('[Flota]');
      });

      it('Vista 1 [Surtidor]: incluye selector de isletas, contador de galones y placa', () => {
        expect(GAS_MOCK).toContain('data-testid="gas-view-surtidor"');
        expect(GAS_MOCK).toContain('Isleta 1');
        expect(GAS_MOCK).toContain('Isleta 2');
        expect(GAS_MOCK).toContain('Isleta 3');
        expect(GAS_MOCK).toContain('ABC-456');
        expect(GAS_MOCK).toContain('Gasohol 95');
        expect(GAS_MOCK).toContain('gal');
        expect(GAS_MOCK).toContain('TOTAL DESPACHO');
      });

      it('Vista 2 [Precios]: incluye lista de combustibles y simulación de actualización', () => {
        expect(GAS_MOCK).toContain('data-testid="gas-view-precios"');
        expect(GAS_MOCK).toContain('Gasohol 90');
        expect(GAS_MOCK).toContain('Gasohol 95');
        expect(GAS_MOCK).toContain('Gasohol 97');
        expect(GAS_MOCK).toContain('Gasohol 98');
        expect(GAS_MOCK).toContain('Diésel B5');
        expect(GAS_MOCK).toContain('GLP');
        expect(GAS_MOCK).toContain('MÁS VENDIDO');
        expect(GAS_MOCK).toContain('DETRACCIÓN 10%');
        expect(GAS_MOCK).toContain('Simular actualización');
      });

      it('Vista 3 [Flota]: incluye clientes corporativos y cálculo de detracción SUNAT', () => {
        expect(GAS_MOCK).toContain('data-testid="gas-view-flota"');
        expect(GAS_MOCK).toContain('Transportes Lima S.A.C.');
        expect(GAS_MOCK).toContain('20112233441');
        expect(GAS_MOCK).toContain('Constructora Andina E.I.R.L.');
        expect(GAS_MOCK).toContain('20445566778');
        expect(GAS_MOCK).toContain('Almacenes Peru S.A.');
        expect(GAS_MOCK).toContain('20887766551');
        expect(GAS_MOCK).toContain('Detracción 10%');
        expect(GAS_MOCK).toContain('SUNAT SPOT');
        expect(GAS_MOCK).toContain('Neto a pagar');
      });
    });
  });

  describe('3. Integración en VerticalLandingView.svelte y Módulos de Dominio', () => {
    it('importa los 6 mockups especializados', () => {
      expect(VERTICAL_LANDING_VIEW).toContain(
        "import RestaurantMock from '$lib/components/vertical-mocks/RestaurantMock.svelte';",
      );
      expect(VERTICAL_LANDING_VIEW).toContain(
        "import PharmacyMock from '$lib/components/vertical-mocks/PharmacyMock.svelte';",
      );
      expect(VERTICAL_LANDING_VIEW).toContain(
        "import RetailMock from '$lib/components/vertical-mocks/RetailMock.svelte';",
      );
      expect(VERTICAL_LANDING_VIEW).toContain(
        "import ServicesMock from '$lib/components/vertical-mocks/ServicesMock.svelte';",
      );
      expect(VERTICAL_LANDING_VIEW).toContain(
        "import ChainMock from '$lib/components/vertical-mocks/ChainMock.svelte';",
      );
      expect(VERTICAL_LANDING_VIEW).toContain(
        "import GasMock from '$lib/components/vertical-mocks/GasMock.svelte';",
      );
    });

    it('renderiza el mockup correspondiente según landing.slug con fallback a CheckoutMock', () => {
      expect(VERTICAL_LANDING_VIEW).toMatch(
        /landing\.slug === 'restaurantes'[\s\S]*?<RestaurantMock/,
      );
      expect(VERTICAL_LANDING_VIEW).toMatch(/landing\.slug === 'farmacias'[\s\S]*?<PharmacyMock/);
      expect(VERTICAL_LANDING_VIEW).toMatch(/landing\.slug === 'retail'[\s\S]*?<RetailMock/);
      expect(VERTICAL_LANDING_VIEW).toMatch(/landing\.slug === 'servicios'[\s\S]*?<ServicesMock/);
      expect(VERTICAL_LANDING_VIEW).toMatch(/landing\.slug === 'cadenas'[\s\S]*?<ChainMock/);
      expect(VERTICAL_LANDING_VIEW).toMatch(/landing\.slug === 'grifos'[\s\S]*?<GasMock/);
      expect(VERTICAL_LANDING_VIEW).toMatch(/<CheckoutMock/);
    });

    it('incluye la sección dedicada data-testid="vertical-domain-modules"', () => {
      expect(VERTICAL_LANDING_VIEW).toContain('data-testid="vertical-domain-modules"');
      expect(VERTICAL_LANDING_VIEW).toContain('domain-modules-grid');
      expect(VERTICAL_LANDING_VIEW).toContain('domain-module-card');
    });

    it('las 6 verticales definen 3 módulos especializados de dominio en verticals.ts', () => {
      const verticals = allVerticals();
      expect(verticals).toHaveLength(6);
      for (const v of verticals) {
        expect(v.modules).toBeDefined();
        expect(v.modules).toHaveLength(3);
        for (const mod of v.modules!) {
          expect(mod.id).toBeTruthy();
          expect(mod.title).toBeTruthy();
          expect(mod.subtitle).toBeTruthy();
          expect(mod.tag).toBeTruthy();
          expect(mod.description).toBeTruthy();
          expect(mod.highlights.length).toBeGreaterThanOrEqual(3);
        }
      }
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

    it.each(ALL_MOCKS)(
      '$name tiene scroll interno estilizado con max-height y overflow-y: auto',
      ({ code }) => {
        expect(code).toMatch(/max-height:\s*\d+px;/);
        expect(code).toMatch(/overflow-y:\s*auto;/);
        expect(code).toContain('::-webkit-scrollbar');
      },
    );
  });
});
