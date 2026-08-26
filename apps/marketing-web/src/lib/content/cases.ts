/**
 * Casos de éxito y simulaciones operativas — GTM §7.3 / GTM-12.
 * Solo `permissionGranted: true` puede mostrarse como testimonio vivo.
 * Campo `rubro` (content slug) — no fork UI por vertical (ADR-ARCH-002 / V-07).
 */

import type { VerticalSlug } from './types.js';

export interface SuccessCase {
  readonly id: string;
  readonly rubro: VerticalSlug;
  readonly businessName: string;
  readonly quote: string;
  readonly permissionGranted: boolean;
  readonly published: boolean;
}

export interface SimulationMetric {
  readonly label: string;
  readonly before: string;
  readonly withKipus: string;
  readonly improvement: string;
}

export interface CaseStudySimulation {
  readonly id: string;
  readonly rubro: VerticalSlug;
  readonly archetype: string;
  readonly location: string;
  readonly dailyTransactions: string;
  readonly headline: string;
  readonly operationalChallenge: string;
  readonly kipusSolution: string;
  readonly metrics: readonly SimulationMetric[];
  readonly ownerTakeaway: string;
}

/** Soft-launch: sin permisos reales -> lista publicable vacía (empty state honesto GTM-12). */
export const SUCCESS_CASES: readonly SuccessCase[] = [];

/**
 * Simulaciones de impacto operativo en mostrador peruano.
 * Comparativas antes vs con KipusPay basadas en tiempos y flujos reales de atención.
 */
export const CASE_STUDY_SIMULATIONS: readonly CaseStudySimulation[] = [
  {
    id: 'cafeteria-especialidad',
    rubro: 'restaurantes',
    archetype: 'Cafetería de Especialidad y Brunch',
    location: 'Miraflores, Lima',
    dailyTransactions: '180 tickets/día',
    headline: 'De colas de 12 minutos en hora punta a despacho ágil en 45 segundos',
    operationalChallenge:
      'En las mañanas, la fila de clientes para café y tostadas colapsaba la caja. El sistema anterior demoraba 35 segundos por comanda y cuando el wifi fallaba, se paralizaba todo el mostrador.',
    kipusSolution:
      'Caja rápida con catálogo visual de alta frecuencia, notas de cocina al instante y cobro continuo que sincroniza en segundo plano sin interrumpir el servicio.',
    metrics: [
      {
        label: 'Tiempo de emisión de ticket',
        before: '35 s',
        withKipus: '6 s',
        improvement: '-83% tiempo en caja',
      },
      {
        label: 'Tiempo de cuadre de turno',
        before: '45 min',
        withKipus: '3 min',
        improvement: '-93% tiempo de cierre',
      },
      {
        label: 'Ventas perdidas por caídas de red',
        before: '8 a 12 tickets/semana',
        withKipus: '0 tickets perdidos',
        improvement: '100% continuidad de cobro',
      },
    ],
    ownerTakeaway:
      'El personal aprende a usar la caja en 5 minutos y no volvemos a perder una venta cuando el internet del local parpadea.',
  },
  {
    id: 'minimarket-barrio',
    rubro: 'retail',
    archetype: 'Minimarket y Tienda de Abarrotes',
    location: 'Los Olivos, Lima',
    dailyTransactions: '320 tickets/día',
    headline:
      'Control exacto de caja multicanal (Efectivo, Billeteras Digitales y Tarjetas) sin descuadres al cierre',
    operationalChallenge:
      'Dos turnos de cajeros distintos. Al final del día, cuadrar los cobros de billeteras digitales, efectivo y tarjetas tomaba más de una hora con constantes descuadres acumulados en el mes.',
    kipusSolution:
      'Arqueo de caja por turnos con separación automática de medios de pago, Modo Dueño en el celular para monitorear ingresos en vivo y comprobantes emitidos en segundos.',
    metrics: [
      {
        label: 'Tiempo de cierre de caja por turno',
        before: '60 min',
        withKipus: '4 min',
        improvement: '-93% tiempo de arqueo',
      },
      {
        label: 'Descuadre promedio mensual',
        before: 'S/ 450 en mermas y errores',
        withKipus: 'S/ 0 en caja',
        improvement: 'Cero descuadres de efectivo',
      },
      {
        label: 'Tiempo de registro con código de barras',
        before: '8 s por producto',
        withKipus: '1.5 s por producto',
        improvement: '5x más rápido en cola',
      },
    ],
    ownerTakeaway:
      'Desde mi teléfono sé cuánto vendió cada cajero antes de que cierren la reja del minimarket.',
  },
  {
    id: 'botica-independiente',
    rubro: 'farmacias',
    archetype: 'Botica de Barrio y Cuidado Personal',
    location: 'Trujillo, La Libertad',
    dailyTransactions: '210 tickets/día',
    headline: 'Venta fraccionada por pastilla y emisión electrónica inmediata con cero trabas',
    operationalChallenge:
      'Cobrar blísteres y pastillas sueltas requería cálculos manuales en calculadora. La emisión de boleta electrónica demoraba demasiado por lentitud del sistema anterior.',
    kipusSolution:
      'Búsqueda rápida por nombre comercial o principio activo, soporte nativo para fracción y caja optimizada para impresión de ticket térmico al instante.',
    metrics: [
      {
        label: 'Búsqueda y selección de medicamento',
        before: '20 s',
        withKipus: '3 s',
        improvement: '-85% tiempo de búsqueda',
      },
      {
        label: 'Emisión y entrega de comprobante',
        before: '40 s',
        withKipus: '5 s',
        improvement: '-87% tiempo de emisión',
      },
      {
        label: 'Capacitación de nuevo personal',
        before: '4 días',
        withKipus: '30 minutos',
        improvement: 'Adopción inmediata',
      },
    ],
    ownerTakeaway:
      'El mostrador no se traba ni cuando atendemos recetas largas en horas pico de la tarde.',
  },
  {
    id: 'taller-automotriz',
    rubro: 'servicios',
    archetype: 'Taller Mecánico y Centro de Diagnóstico',
    location: 'Surquillo, Lima',
    dailyTransactions: '35 tickets/día',
    headline:
      'De presupuestos en papel a facturación electrónica y control de anticipos en segundos',
    operationalChallenge:
      'El taller emitía cotizaciones en papel y al finalizar el servicio se demoraban 15 minutos digitando la factura electrónica a empresas con RUC. Los cobros de anticipos se registraban en una libreta con frecuentes confusiones de saldo.',
    kipusSolution:
      'Presupuesto digital convertido a factura en un solo toque, registro ordenado de anticipos y cobro ágil con Yape, tarjetas o efectivo.',
    metrics: [
      {
        label: 'Tiempo de emisión de factura con RUC',
        before: '15 min',
        withKipus: '20 s',
        improvement: '-97% tiempo administrativo',
      },
      {
        label: 'Control de anticipos y saldos',
        before: 'Libreta manual',
        withKipus: 'Historial digital en vivo',
        improvement: '100% trazabilidad de cobros',
      },
      {
        label: 'Errores en datos de clientes',
        before: '4 a 6 rechazos al mes',
        withKipus: '0 rechazos',
        improvement: 'Validación SUNAT inmediata',
      },
    ],
    ownerTakeaway:
      'Facturo a empresas en segundos y los clientes particulares pagan felices con Yape desde el celular sin demoras.',
  },
  {
    id: 'cadena-panaderias',
    rubro: 'cadenas',
    archetype: 'Cadena de Panaderías y Cafés (4 Locales)',
    location: 'Arequipa y Cusco',
    dailyTransactions: '650 tickets/día',
    headline:
      'Supervisión en vivo de 4 locales desde el celular y transferencias de mercadería sin descuadres',
    operationalChallenge:
      'Monitorear las ventas requería llamar a los 4 locales al cierre de turno. Las transferencias de pan y pasteles entre sucursales generaban constantes mermas sin rastreo.',
    kipusSolution:
      'Panel centralizado en Modo Dueño para comparar ventas en tiempo real, permisos por sede y control estricto de transferencias entre locales.',
    metrics: [
      {
        label: 'Tiempo de consolidación de reportes',
        before: '2 horas cada noche',
        withKipus: 'Tiempo real en celular',
        improvement: '-100% demora en reportes',
      },
      {
        label: 'Trazabilidad de transferencias',
        before: 'Notas en papel',
        withKipus: 'Registro digital por local',
        improvement: 'Cero mercadería perdida',
      },
      {
        label: 'Cierres de caja estandarizados',
        before: 'Formatos dispersos',
        withKipus: 'Mismo proceso automático',
        improvement: 'Cierres 100% alineados',
      },
    ],
    ownerTakeaway:
      'Desde mi celular veo las ventas de los cuatro locales en vivo como si estuviera parado en cada mostrador.',
  },
  {
    id: 'grifo-estacion-servicio',
    rubro: 'grifos',
    archetype: 'Estación de Servicio y Grifo de Combustibles',
    location: 'Carretera Central, Lima',
    dailyTransactions: '580 despachos/día',
    headline:
      'Cero colas en pista, facturación de diésel con detracción automática y cuadre de turno en 3 minutos',
    operationalChallenge:
      'En hora punta la cola de vehículos bloqueaba la pista. El cálculo manual de detracción del 10% en despachos de diésel a flotas generaba errores con SUNAT, y cuadrar las ventas de 6 surtidores tomaba casi una hora al cambio de guardia.',
    kipusSolution:
      'Registro de despacho en pista por monto o volumen, cálculo automático de detracción para facturas a empresas y reporte de turno por isleta en tiempo real desde el celular.',
    metrics: [
      {
        label: 'Tiempo de despacho y cobro en pista',
        before: '90 s',
        withKipus: '18 s',
        improvement: '-80% tiempo por vehículo',
      },
      {
        label: 'Emisión de factura a flotas con detracción',
        before: '8 min',
        withKipus: '25 s',
        improvement: '-95% tiempo administrativo',
      },
      {
        label: 'Cuadre de turno multi-isleta',
        before: '45 min',
        withKipus: '3 min',
        improvement: '-93% tiempo de cierre',
      },
    ],
    ownerTakeaway:
      'Los choferes de empresas salen con su factura y detracción listas en segundos y la pista nunca se embotella.',
  },
];

export function publishedCases(cases: readonly SuccessCase[] = SUCCESS_CASES): SuccessCase[] {
  return cases.filter((c) => c.permissionGranted && c.published);
}

export function casesForRubro(
  rubro: VerticalSlug,
  cases: readonly SuccessCase[] = SUCCESS_CASES,
): SuccessCase[] {
  return publishedCases(cases).filter((c) => c.rubro === rubro);
}

export function simulationForRubro(
  rubro: VerticalSlug,
  simulations: readonly CaseStudySimulation[] = CASE_STUDY_SIMULATIONS,
): CaseStudySimulation | null {
  return simulations.find((s) => s.rubro === rubro) ?? null;
}

export function allSimulations(): CaseStudySimulation[] {
  return [...CASE_STUDY_SIMULATIONS];
}
