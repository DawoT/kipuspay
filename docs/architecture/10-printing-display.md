---
doc_id: arch-10-printing-display
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "10"
---

## **10. Impresión Adaptativa WSS Dinámica & Modo Vitrina (Customer Display)**

// src/hardware/printRouter.ts  
// Adaptabilidad de ticketera: el ancho es config del DISPOSITIVO (pos_terminals), resuelto
// por el servidor al abrir la sesión de caja. 58mm => 32 chars (maxNameLen 14); 80mm => 48 (26).
// lineWidth en TicketData es SOLO fallback: el servidor impone 32/48 según paper_width_mm.
export interface TicketData {  
  enterprise: string;  
  ruc: string;  
  total_cents: number;  
  lineWidth?: number; // fallback 32/48; el servidor lo resuelve desde pos_terminals.paper_width_mm
  items: Array<{ name: string; qty: number; total_cents: number }>;  
}

// Resolución server-side (fetch al abrir sesión de caja): nunca confía en el cliente.
function resolveLineWidth(terminal: { paper_width_mm: number; line_width: number }): number {
  if (terminal.paper_width_mm === 80) return 48;
  if (terminal.paper_width_mm === 58) return 32;
  return terminal.line_width === 48 ? 48 : 32; // coherencia con paper_width_mm desconocida
}

export class LanWssPrinterStrategy {  
  constructor(private wssPrinterUrl: string) {}

  async print(data: TicketData): Promise<boolean> {  
    const url = new URL(this.wssPrinterUrl);
    if (url.protocol !== 'wss:') throw new Error('PRINTER_WSS_REQUIRED');
    return new Promise((resolve, reject) => {  
      const socket = new WebSocket(url);  
      const timeout = setTimeout(() => { socket.close(); reject(new Error('PRINTER_ACK_TIMEOUT')); }, 5000);
      socket.onopen = () => {  
        const bytes = buildEscPosPayload(data);  
        socket.send(bytes);  
      };  
      socket.onmessage = (event) => {
        if (event.data === 'ACK') { clearTimeout(timeout); socket.close(); resolve(true); }
      };
      socket.onerror = (err) => { clearTimeout(timeout); reject(err); };  
    });  
  }  
}

function buildEscPosPayload(data: TicketData): Uint8Array {  
  const encoder = new TextEncoder();  
  const cmd: number[] = [];  
  // Resuelto por resolveLineWidth(terminal) al abrir sesión; fallback conservador 58mm (32).
  const lineWidth = data.lineWidth || 32;  
  const separator = '-'.repeat(lineWidth) + '\n';

  cmd.push(0x1B, 0x40); // Reset  
  cmd.push(0x1B, 0x61, 0x01); // Center  
  cmd.push(...encoder.encode(`${sanitizePrinterText(data.enterprise)}\nRUC: ${sanitizePrinterText(data.ruc)}\n${separator}`));  
  cmd.push(0x1B, 0x61, 0x00);

  const maxNameLen = lineWidth > 32 ? 26 : 14;  
  for (const item of data.items) {  
    const nameTrunc = sanitizePrinterText(item.name).substring(0, maxNameLen);  
     cmd.push(...encoder.encode(`${item.qty} x ${nameTrunc} S/ ${formatCents(item.total_cents)}\n`));  
  }

  cmd.push(0x1B, 0x45, 0x01);  
  cmd.push(...encoder.encode(`\nTOTAL: S/ ${formatCents(data.total_cents)}\n\n`));  
  cmd.push(0x1B, 0x45, 0x00);  
  cmd.push(0x1D, 0x56, 0x42, 0x00);  
  return new Uint8Array(cmd);  
}

function formatCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error('INVALID_TICKET_CENTS');
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function sanitizePrinterText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120);
}

