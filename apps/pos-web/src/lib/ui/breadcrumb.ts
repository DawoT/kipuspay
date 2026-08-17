/** Etiquetas humanas para el breadcrumb. Nunca el path crudo (GTM §6.5). */

const LABELS: Readonly<Record<string, string>> = {
  '': 'Terminal POS',
  caja: 'Cierre Z',
  'caja/historial': 'Historial del día',
  'caja/cobro': 'Cobro local',
  'caja/devolucion': 'Devolución',
  'caja/cotizacion': 'Cotizaciones',
  'caja/apartado': 'Apartados',
  'caja/cuotas': 'Cuotas',
  'caja/gastos': 'Gastos de caja',
  'caja/handoff': 'Cambio de turno',
  'caja/vale': 'Vales',
  'admin/catalogo': 'Catálogo',
  'admin/etiquetas': 'Etiquetas',
  'admin/series': 'Series',
  'admin/comisiones': 'Comisiones',
  'admin/promociones': 'Promociones',
  'admin/credito-tienda': 'Crédito tienda',
  'admin/membresias': 'Membresías',
  'admin/clientes': 'Clientes',
  'admin/inventario': 'Inventario',
  'admin/ubicaciones': 'Ubicaciones',
  'admin/transferencias': 'Transferencias',
  'admin/oc-recepcion': 'Recepción OC',
  'admin/factura-proveedor': 'Conciliar factura',
  'admin/devolucion-proveedor': 'Devolución a proveedor',
  'admin/diario': 'Diario',
  'admin/backups': 'Backups',
  'admin/configuracion': 'Configuración',
  'admin/integraciones': 'Integraciones',
  'admin/equipo': 'Equipo',
  owner: 'Hoy',
  'owner/finanzas': 'Finanzas',
  'owner/stock': 'Alertas de stock',
  'owner/alertas': 'Alertas',
  'owner/compras': 'Compras',
  'owner/pagos': 'Pagos',
  'owner/locales': 'Locales',
  'owner/yo': 'Mi perfil',
  'owner/previsiones': 'Previsiones',
  'owner/asistente': 'Asistente',
  salon: 'Salón',
  'salon/split': 'Dividir cuenta',
  kds: 'Cocina',
  kiosk: 'Kiosko',
  vitrina: 'Vitrina',
  mobile: 'Dispositivo móvil',
  login: 'Iniciar sesión',
  ayuda: 'Ayuda',
  'orders/customer': 'Pedidos retiro',
};

export function breadcrumbLabel(pathname: string): string {
  const key = pathname.replace(/^\//, '').replace(/\/$/, '');
  if (key in LABELS) return LABELS[key];
  const last = key.split('/').filter(Boolean).pop() ?? '';
  if (!last) return 'Terminal POS';
  return last.replace(/-/g, ' ');
}
