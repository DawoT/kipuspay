<script lang="ts">
  import { env } from '$env/dynamic/public';
  import { isAccountingExportEnabled, isCatalogImportEnabled, isIntegrationsApiEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
import { apiFetch } from '$lib/auth/api-client';

  const exportOn = isAccountingExportEnabled();
  const apiOn = isIntegrationsApiEnabled();
  const importOn = isCatalogImportEnabled();

  let fromDate = $state('2026-08-01');
  let toDate = $state('2026-08-05');
  let branchId = $state('b1');
  let target = $state<'contasis' | 'concar'>('contasis');
  let exportMessage = $state('');
  let exportPreview = $state('');

  let keysMessage = $state('');
  let createdKey = $state('');
  let keyCount = $state(0);
  let keysListed = $state(false);

  let webhookUrl = $state('https://hooks.example.com/kipus');
  let webhookMessage = $state('');
  let createdSecret = $state('');
  let webhookCount = $state(0);
  let webhooksListed = $state(false);

  let importRowsJson = $state('[{"sku":"SKU-1","name":"Producto de ejemplo","priceCents":100}]');
  let importMode = $state<'preview' | 'commit'>('preview');
  let importMessage = $state('');


  async function runExport() {
    exportMessage = '';
    exportPreview = '';
    const res = await apiFetch('/api/integrations/accounting/export', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fromDate, toDate, branchId, target }),
    });
    const text = await res.text();
    if (!res.ok) {
      try { const j = JSON.parse(text) as { error?: string }; exportMessage = j.error ?? text; }
      catch { exportMessage = text; }
      return;
    }
    exportMessage = `Exportado ${target === 'contasis' ? 'Contasis' : 'Concar'} · ${text.length} caracteres`;
    exportPreview = text.slice(0, 800);
  }

  async function createKey() {
    keysMessage = ''; createdKey = '';
    const res = await apiFetch('/api/integrations/api-keys', {
      method: 'POST', storage: localStorage,
      headers: { 'content-type': 'application/json' }, body: '{}',
    });
    const json = (await res.json()) as { apiKey?: string; error?: string };
    if (res.ok && json.apiKey) { createdKey = json.apiKey; keysMessage = 'Clave creada — guárdala ahora'; }
    else { keysMessage = json.error ?? 'error'; }
  }

  async function listKeys() {
    keysMessage = '';
    const res = await apiFetch('/api/integrations/api-keys', { storage: localStorage });
    const json = (await res.json()) as { items?: unknown[]; keys?: unknown[] };
    const items = json.items ?? json.keys ?? [];
    keyCount = Array.isArray(items) ? items.length : 0;
    keysListed = true;
    keysMessage = res.ok ? `${keyCount} clave(s)` : 'No se pudieron listar';
  }

  async function createWebhook() {
    webhookMessage = ''; createdSecret = '';
    const res = await apiFetch('/api/integrations/webhooks', {
      method: 'POST', storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, events: ['sale.created', 'cpe.accepted', 'cpe.rejected'] }),
    });
    const json = (await res.json()) as { secret?: string; id?: string; error?: string };
    if (res.ok && json.secret) { createdSecret = json.secret; webhookMessage = 'Destino registrado — guarda el secreto'; }
    else { webhookMessage = json.error ?? 'error'; }
  }

  async function listWebhooks() {
    webhookMessage = '';
    const res = await apiFetch('/api/integrations/webhooks', { storage: localStorage });
    const json = (await res.json()) as { items?: unknown[]; endpoints?: unknown[] };
    const items = json.items ?? json.endpoints ?? [];
    webhookCount = Array.isArray(items) ? items.length : 0;
    webhooksListed = true;
    webhookMessage = res.ok ? `${webhookCount} destino(s)` : 'No se pudieron listar';
  }

  async function runCatalogImport() {
    importMessage = '';
    let rows: unknown = [];
    try {
      rows = JSON.parse(importRowsJson) as unknown;
    } catch {
      importMessage = 'Las filas no se pudieron leer';
      return;
    }
    const res = await apiFetch('/api/integrations/catalog-import', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'csv', mode: importMode, rows }),
    });
    const json = (await res.json()) as { error?: string; code?: string; imported?: number };
    importMessage = res.ok
      ? `Importación ${importMode === 'preview' ? 'en vista previa' : 'confirmada'}${typeof json.imported === 'number' ? ` · ${json.imported}` : ''}`
      : (json.error ?? json.code ?? 'error');
  }
</script>

<svelte:head><title>Integraciones · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="admin-integraciones">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="link" size={12} /> Admin · Integraciones</p>
      <h1 class="page-title">Integraciones</h1>
      <p class="page-lede">Export contable, claves de acceso y avisos a otros sistemas — Cadena o superior.</p>
    </div>
  </div>

  {#if !exportOn && !apiOn && !importOn}
    <div class="feature-off-banner" data-testid="integrations-off">
      <Icon name="info" size={18} />
      <span>Las integraciones no están activas para este negocio.</span>
    </div>
  {:else}
    <div class="integ-grid">
      {#if exportOn}
        <!-- Export contable -->
        <section class="ledger-card section-pad" data-testid="export-block">
          <div class="card-header">
            <h2>Export contable</h2>
            <span class="section-tag">Contasis / Concar</span>
          </div>
          <p class="section-desc">Asientos por rango y sucursal (solo lectura).</p>
          <div class="two-col">
            <div class="field-group">
              <label for="int-from">Desde</label>
              <input id="int-from" type="date" bind:value={fromDate} />
            </div>
            <div class="field-group">
              <label for="int-to">Hasta</label>
              <input id="int-to" type="date" bind:value={toDate} />
            </div>
          </div>
          <div class="field-group">
            <label for="int-branch">Sucursal</label>
            <input id="int-branch" bind:value={branchId} />
          </div>
          <div class="field-group">
            <label for="int-target">Formato</label>
            <select id="int-target" bind:value={target}>
              <option value="contasis">Contasis (CSV)</option>
              <option value="concar">Concar (XML)</option>
            </select>
          </div>
          <Button variant="primary" icon="download" onclick={runExport}>
          Exportar
        </Button>
          {#if exportMessage}
            <p class="feedback-msg" data-testid="export-message">{exportMessage}</p>
          {/if}
          {#if exportPreview}
            <pre class="code-preview" data-testid="export-preview">{exportPreview}</pre>
          {/if}
        </section>
      {/if}

      {#if apiOn}
        <!-- API Keys -->
        <section class="ledger-card section-pad" data-testid="keys-block">
          <div class="card-header">
            <h2>Claves de acceso</h2>
            <Icon name="key" size={16} />
          </div>
          <p class="section-desc">La clave se muestra una sola vez al crear. Revócala para cortar el acceso de inmediato.</p>
          <div class="btn-row">
            <Button variant="primary" icon="plus" onclick={createKey}>
          Crear clave
        </Button>
            <Button variant="secondary" icon="list" onclick={listKeys}>
          Listar
        </Button>
          </div>
          {#if createdKey}
            <div class="secret-box" data-testid="created-api-key">
              <Icon name="key" size={14} />
              <code>{createdKey}</code>
            </div>
          {/if}
          {#if keysMessage}
            <p class="feedback-msg" data-testid="keys-message">{keysMessage}</p>
          {/if}
          {#if keysListed}
            <p class="feedback-msg">{keyCount} clave(s) registrada(s)</p>
          {/if}
        </section>

        <!-- Webhooks -->
        <section class="ledger-card section-pad" data-testid="webhooks-block">
          <div class="card-header">
            <h2>Webhooks</h2>
            <Icon name="link" size={16} />
          </div>
          <p class="section-desc">Solo direcciones seguras. Avisos: venta cobrada, comprobante aceptado o rechazado.</p>
          <div class="field-group">
            <label for="int-webhook-url">URL de destino</label>
            <input id="int-webhook-url" bind:value={webhookUrl} />
          </div>
          <div class="btn-row">
            <Button variant="primary" icon="plus" onclick={createWebhook}>
          Registrar destino
        </Button>
            <Button variant="secondary" icon="list" onclick={listWebhooks}>
          Listar
        </Button>
          </div>
          {#if createdSecret}
            <div class="secret-box" data-testid="created-webhook-secret">
              <Icon name="key" size={14} />
              <code>{createdSecret}</code>
            </div>
          {/if}
          {#if webhookMessage}
            <p class="feedback-msg" data-testid="webhook-message">{webhookMessage}</p>
          {/if}
          {#if webhooksListed}
            <p class="feedback-msg">{webhookCount} destino(s) registrado(s)</p>
          {/if}
        </section>
      {/if}
      {#if importOn}
        <section class="ledger-card section-pad" data-testid="catalog-import-block">
          <div class="card-header">
            <h2>Importar catálogo</h2>
            <span class="section-tag">CSV</span>
          </div>
          <p class="section-desc">Vista previa o commit del lote (solo admin/owner).</p>
          <div class="field-group">
            <label for="import-mode">Modo</label>
            <select id="import-mode" bind:value={importMode} data-testid="catalog-import-mode">
              <option value="preview">Vista previa</option>
              <option value="commit">Confirmar</option>
            </select>
          </div>
          <div class="field-group">
            <label for="import-rows">Filas a importar</label>
            <textarea id="import-rows" bind:value={importRowsJson} rows="4" data-testid="catalog-import-rows"></textarea>
          </div>
          <Button variant="primary" data-testid="catalog-import-run" onclick={() => void runCatalogImport()}>
            Importar
          </Button>
          {#if importMessage}
            <p class="feedback-msg" data-testid="catalog-import-message">{importMessage}</p>
          {/if}
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .integ-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    align-items: start;
  }


  .section-desc {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-bottom: 0.875rem;
  }



  select {
    width: 100%;
    padding: 0.5rem 0.625rem;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-glass);
    color: var(--text-main);
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
  }


  .secret-box {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    background: rgba(217, 154, 61, 0.1);
    border: 1px solid rgba(217, 154, 61, 0.3);
    border-radius: var(--radius-sm);
    margin-bottom: 0.5rem;
    color: var(--accent-primary);
  }

  .secret-box code {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    word-break: break-all;
    color: var(--text-main);
  }

  .feedback-msg {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin: 0.5rem 0;
  }

  .code-preview {
    margin-top: 0.5rem;
    padding: 0.75rem;
    background: var(--bg-primary);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    overflow: auto;
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    max-height: 14rem;
    white-space: pre-wrap;
    word-break: break-all;
  }

  @media (max-width: 600px) {
    .integ-grid { grid-template-columns: 1fr; }
    
  }
</style>
