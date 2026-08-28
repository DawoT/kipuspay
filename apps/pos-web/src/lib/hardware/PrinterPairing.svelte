<script lang="ts">
  import { onMount } from 'svelte';
  import { createPrinterTransport } from '$lib/print/printer-transport';
  import {
    readTerminalPairing,
    validateWssUrl,
    pairWss,
    pairWebUsb,
    setPaperWidth,
    setTerminalId,
    testPrintWithCurrentLadder,
    persistTerminalToServer,
    type TerminalPairing,
  } from '$lib/print/printer-pairing';
  import { compileEscPosFromSnapshot, buildSaleTicketSnapshot } from '$lib/print/offload-compile';
  import { resolveLineWidth } from '@kipuspay/print-templates';
  import type { PrinterStrategy } from '@kipuspay/print-templates';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';
  import { currentUsbPrinterDevice } from '$lib/print/printer-runtime';

  let storage: Storage | null = $state(null);
  let pairing = $state<TerminalPairing>({
    terminalId: null,
    paperWidthMm: 58,
    printerStrategy: 'webusb',
  });
  let wssInput = $state('');
  let wssStatus = $state('');
  let wssError = $state('');
  let usbStatus = $state('');
  let paperStatus = $state('');
  let terminalInput = $state('');
  let testStatus = $state('');
  let testError = $state('');
  let available = $state<readonly PrinterStrategy[]>([]);
  let busyScan = $state(false);
  let busyTest = $state(false);
  let persistMsg = $state('');

  function refreshPairing() {
    if (!storage) return;
    pairing = readTerminalPairing(storage);
    wssInput = pairing.wssUrl ?? '';
    terminalInput = pairing.terminalId ?? '';
  }

  async function refreshAdapters() {
    if (!storage) return;
    const usb = currentUsbPrinterDevice();
    const wssUrl = pairing.wssUrl ?? null;
    const hosts = pairing.allowlistedHosts ?? [];
    const env: Record<string, unknown> = {};
    if (usb) (env as { usbDevice: unknown }).usbDevice = usb;
    if (wssUrl) {
      (env as { wssUrl: unknown }).wssUrl = wssUrl;
      (env as { allowlistedHosts: unknown }).allowlistedHosts = hosts;
      (env as { socketFactory: unknown }).socketFactory = (url: string) => new WebSocket(url) as unknown as { send: unknown; close: unknown };
    }
    try {
      const list = await createPrinterTransport(env as never).preflight();
      available = list;
    } catch {
      available = [];
    }
  }

  onMount(() => {
    storage = typeof localStorage !== 'undefined' ? localStorage : null;
    if (!storage) return;
    refreshPairing();
    void refreshAdapters();
  });

  async function scanWebUsb() {
    if (!storage || busyScan) return;
    busyScan = true;
    usbStatus = '';
    wssError = '';
    try {
      const nav = navigator as Navigator & { usb?: { requestDevice: (opts: { filters: unknown[] }) => Promise<unknown> } };
      if (!nav.usb?.requestDevice) {
        usbStatus = 'Este navegador no soporta WebUSB. Usa Chrome/Edge en escritorio.';
        busyScan = false;
        return;
      }
      const device = (await nav.usb.requestDevice({ filters: [] })) as unknown as import('$lib/printing/price-label-transports.js').UsbDevicePort;
      pairWebUsb(device);
      // persist strategy webusb + terminal
      if (storage) {
        const cur = readTerminalPairing(storage);
        // update strategy
        const { writeTerminalPairing } = await import('$lib/print/printer-pairing');
        writeTerminalPairing(storage, { ...cur, printerStrategy: 'webusb' });
        refreshPairing();
      }
      usbStatus = 'Impresora USB emparejada. Aparece en la lista.';
      await refreshAdapters();
      persistMsg = '';
      void persistTerminalToServer({ storage }).then((ok) => {
        persistMsg = ok ? 'Emparejamiento guardado en el servidor.' : '';
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('AbortError') || msg.includes('NotFoundError') || msg === '') {
        usbStatus = 'Emparejamiento cancelado.';
      } else {
        usbStatus = `No se pudo emparejar: ${msg}`;
      }
    } finally {
      busyScan = false;
    }
  }

  function saveWss() {
    if (!storage) return;
    wssStatus = '';
    wssError = '';
    const v = validateWssUrl(wssInput);
    if (!v.ok) {
      wssError = v.error === 'PRINTER_WSS_REQUIRED' ? 'Usa wss:// (seguro).' : 'URL no válida.';
      return;
    }
    const res = pairWss(storage, wssInput.trim());
    if (!res.ok) {
      wssError = res.error ?? 'No se pudo guardar.';
      return;
    }
    refreshPairing();
    void refreshAdapters();
    wssStatus = `Impresora en red guardada (${res.host}).`;
    persistMsg = '';
    void persistTerminalToServer({ storage }).then((ok) => {
      persistMsg = ok ? 'Emparejamiento guardado en el servidor.' : 'Guardado local. Se sincronizará al reconectar.';
    });
  }

  function onPaperWidthChange(event: Event) {
    if (!storage) return;
    const val = Number((event.target as HTMLSelectElement).value) as 58 | 80;
    const next: 58 | 80 = val === 80 ? 80 : 58;
    setPaperWidth(storage, next);
    const lw = resolveLineWidth(next);
    paperStatus = `Ancho ${next}mm → ${lw} columnas. Se aplicará al abrir caja.`;
    refreshPairing();
    void persistTerminalToServer({ storage }).then((ok) => {
      if (ok) paperStatus += ' Guardado en pos_terminals.';
    });
  }

  function onTerminalIdSave() {
    if (!storage) return;
    setTerminalId(storage, terminalInput);
    refreshPairing();
    void refreshAdapters();
    persistMsg = 'Terminal guardado local.';
    void persistTerminalToServer({ storage }).then((ok) => {
      persistMsg = ok ? 'Terminal sincronizado con pos_terminals.' : persistMsg;
    });
  }

  async function runTestPrint() {
    if (!storage || busyTest) return;
    busyTest = true;
    testStatus = '';
    testError = '';
    try {
      const cur = readTerminalPairing(storage);
      const lineWidth = resolveLineWidth(cur.paperWidthMm);
      const snap = buildSaleTicketSnapshot({
        enterprise: 'Negocio de prueba',
        ruc: '20123456789',
        documentType: 'NV',
        series: 'NV01',
        number: 1,
        totalCents: 1000,
        items: [{ name: 'Item de prueba', qty: 1, totalCents: 1000 }],
        lineWidth,
      });
      const { escPosBase64 } = compileEscPosFromSnapshot(snap);
      // elige adapter según pairing actual
      const preferred: PrinterStrategy | null = cur.printerStrategy === 'wss_lan' || cur.printerStrategy === 'webusb' ? cur.printerStrategy : null;
      const usb = currentUsbPrinterDevice();
      const result = await testPrintWithCurrentLadder({
        storage,
        ticket: snap,
        escPosBase64,
        preferredAdapter: preferred,
        usbDevice: usb,
      });
      if (result.ok) {
        testStatus = `Prueba enviada por ${result.adapter} (${cur.paperWidthMm}mm / ${lineWidth} col).`;
      } else {
        testError = result.error ?? 'La impresora no respondió. Revisa cable o red.';
      }
    } catch (e) {
      testError = e instanceof Error ? e.message : 'No se pudo imprimir.';
    } finally {
      busyTest = false;
    }
  }
</script>

<section class="ledger-card" aria-labelledby="printer-pairing-title" data-testid="printer-pairing-card">
  <div class="card-head">
    <Icon name="printer" size={22} class="icon-amber" />
    <div>
      <p class="instrument-label">Hardware · Impresoras de tickets</p>
      <h2 id="printer-pairing-title">Emparejamiento y ancho de papel</h2>
    </div>
  </div>
  <p class="hint">
    Empareja tu ticketera por cable (WebUSB) o en red (WSS). El ancho 58/80mm queda en
    <code>pos_terminals.paper_width_mm</code> y define 32/48 columnas.
  </p>

  <div class="pairing-grid">
    <Field label="ID de terminal (pos_terminals.id)" id="pairing-terminal-id">
      <div class="row">
        <Input id="pairing-terminal-id" bind:value={terminalInput} placeholder="Caja 1" data-testid="pairing-terminal-id" />
        <Button variant="secondary" size="sm" onclick={onTerminalIdSave} data-testid="pairing-terminal-save">Guardar terminal</Button>
      </div>
    </Field>

    <Field label="Ancho de papel del terminal" id="pairing-paper-width">
      <select id="pairing-paper-width" data-testid="pairing-paper-width" value={pairing.paperWidthMm} onchange={onPaperWidthChange}>
        <option value={58}>58 mm — 32 columnas (térmica angosta)</option>
        <option value={80}>80 mm — 48 columnas (térmica ancha)</option>
      </select>
      {#if paperStatus}<p class="hint" data-testid="pairing-paper-status">{paperStatus}</p>{/if}
    </Field>

    <Field label="Impresoras disponibles (preflight)" id="pairing-list-field">
      <div class="preflight" data-testid="pairing-list">
        {#if available.length}
          <span class="mono">{available.join(' → ')}</span>
        {:else}
          <span class="mono muted">Detectando… (system_print siempre disponible)</span>
        {/if}
      </div>
    </Field>
  </div>

  <div class="pairing-grid" style="margin-top:1rem">
    <Field label="Impresora por cable — WebUSB" id="pairing-usb-field">
      <div class="row">
        <Button variant="secondary" onclick={scanWebUsb} busy={busyScan} data-testid="pairing-webusb-scan">
          {busyScan ? 'Emparejando…' : 'Escanear USB'}
        </Button>
        <span class="hint" data-testid="pairing-webusb-status">{usbStatus || 'Requiere gesto del usuario.'}</span>
      </div>
    </Field>

    <Field label="Impresora en red — WSS LAN" id="pairing-wss-field">
      <div class="row">
        <Input id="pairing-wss-input" bind:value={wssInput} placeholder="wss://192.168.1.50:8080" data-testid="pairing-wss-input" />
        <Button variant="secondary" onclick={saveWss} data-testid="pairing-wss-save">Guardar WSS</Button>
      </div>
      {#if wssStatus}<p class="hint ok" data-testid="pairing-wss-status">{wssStatus}</p>{/if}
      {#if wssError}<p class="hint err" data-testid="pairing-wss-error">{wssError}</p>{/if}
    </Field>
  </div>

  <div class="pairing-grid" style="margin-top:1rem">
    <Field label="Prueba de impresión" id="pairing-test-field">
      <div class="row">
        <Button variant="primary" size="sm" onclick={runTestPrint} busy={busyTest} data-testid="pairing-test-print">
          {busyTest ? 'Imprimiendo…' : 'Imprimir prueba'}
        </Button>
        {#if testStatus}<StatusMessage tone="info" data-testid="pairing-test-status">{testStatus}</StatusMessage>{/if}
        {#if testError}<StatusMessage tone="danger" data-testid="pairing-test-error">{testError}</StatusMessage>{/if}
      </div>
      {#if persistMsg}<p class="hint" data-testid="pairing-persist-status">{persistMsg}</p>{/if}
    </Field>
  </div>

  <p class="terminal-hint">
    <Icon name="shield" size={14} />
    <span>La impresión nunca bloquea el cobro (outbox IndexedDB). Pos_terminals es autoritativo al abrir caja.</span>
  </p>
</section>

<style>
  .ledger-card { background: var(--bg-ledger-card); }
  .card-head { display:flex; align-items:center; gap:0.65rem; margin-bottom:0.85rem; }
  .card-head h2 { margin:0; font-size:1.05rem; font-weight:700; }
  .instrument-label { font:700 0.72rem/1.2 var(--font-mono, monospace); color:var(--amber-gold); letter-spacing:0.08em; text-transform:uppercase; margin:0; }
  .hint { font-size:0.86rem; color:var(--text-muted); line-height:1.45; margin:0.35rem 0 0; }
  .hint.ok { color: var(--emerald-green); }
  .hint.err { color: var(--rose-red); }
  .pairing-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:1rem; align-items:end; }
  .row { display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; }
  .mono { font-family: var(--font-mono, monospace); font-size:0.82rem; }
  .muted { color: var(--text-muted); }
  .terminal-hint { display:flex; align-items:center; gap:0.35rem; font-size:0.8rem; color:var(--text-muted); margin:0.75rem 0 0; }
  .preflight { padding:0.5rem 0.65rem; background: var(--bg-glass); border-radius: var(--radius-sm, 8px); }
  :global(.icon-amber) { color: var(--amber-gold); }
  select { width:100%; padding:0.5rem; border:1px solid var(--border-subtle); border-radius: var(--radius-sm, 8px); background: var(--bg-input); color: var(--text-main); }
</style>
