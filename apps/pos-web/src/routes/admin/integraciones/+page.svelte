<script lang="ts">
  import { env } from '$env/dynamic/public';
  import { isAccountingExportEnabled, isIntegrationsApiEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';

  const exportOn = isAccountingExportEnabled();
  const apiOn = isIntegrationsApiEnabled();

  let fromDate = $state('2026-08-01');
  let toDate = $state('2026-08-05');
  let branchId = $state('b1');
  let target = $state<'contasis' | 'concar'>('contasis');
  let exportMessage = $state('');
  let exportPreview = $state('');

  let keysMessage = $state('');
  let createdKey = $state('');
  let keysJson = $state('');

  let webhookUrl = $state('https://hooks.example.com/kipus');
  let webhookMessage = $state('');
  let createdSecret = $state('');
  let endpointsJson = $state('');

  const apiBase = () => env.PUBLIC_API_BASE?.replace(/\/$/, '') || 'https://api.kipuspay.local';
  const auth = () => env.PUBLIC_DEV_AUTH ?? 'Bearer demo';

  async function runExport() {
    exportMessage = '';
    exportPreview = '';
    const res = await fetch(`${apiBase()}/api/integrations/accounting/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ fromDate, toDate, branchId, target }),
    });
    const text = await res.text();
    if (!res.ok) {
      try { const j = JSON.parse(text) as { error?: string }; exportMessage = j.error ?? text; }
      catch { exportMessage = text; }
      return;
    }
    exportMessage = `Export ${target} OK (${text.length} bytes)`;
    exportPreview = text.slice(0, 800);
  }

  async function createKey() {
    keysMessage = ''; createdKey = '';
    const res = await fetch(`${apiBase()}/api/integrations/api-keys`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: auth() }, body: '{}',
    });
    const json = (await res.json()) as { apiKey?: string; error?: string };
    if (res.ok && json.apiKey) { createdKey = json.apiKey; keysMessage = 'API key creada — guárdala ahora'; }
    else { keysMessage = json.error ?? 'error'; }
  }

  async function listKeys() {
    keysMessage = '';
    const res = await fetch(`${apiBase()}/api/integrations/api-keys`, { headers: { authorization: auth() } });
    const json = await res.json();
    keysJson = JSON.stringify(json, null, 2);
    keysMessage = res.ok ? 'Keys listadas' : 'error';
  }

  async function createWebhook() {
    webhookMessage = ''; createdSecret = '';
    const res = await fetch(`${apiBase()}/api/integrations/webhooks`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ url: webhookUrl, events: ['sale.created', 'cpe.accepted', 'cpe.rejected'] }),
    });
    const json = (await res.json()) as { secret?: string; id?: string; error?: string };
    if (res.ok && json.secret) { createdSecret = json.secret; webhookMessage = `Endpoint ${json.id} creado — guarda el secret`; }
    else { webhookMessage = json.error ?? 'error'; }
  }

  async function listWebhooks() {
    webhookMessage = '';
    const res = await fetch(`${apiBase()}/api/integrations/webhooks`, { headers: { authorization: auth() } });
    const json = await res.json();
    endpointsJson = JSON.stringify(json, null, 2);
    webhookMessage = res.ok ? 'Endpoints listados' : 'error';
  }
</script>

<svelte:head><title>Integraciones · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="admin-integraciones">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="link" size={12} /> Admin · Integraciones</p>
      <h1 class="page-title">Integraciones</h1>
      <p class="page-lede">Export contable Contasis/Concar, API keys y Webhooks — Cadena+.</p>
    </div>
  </div>

  {#if !exportOn && !apiOn}
    <div class="feature-off-banner" data-testid="integrations-off">
      <Icon name="info" size={18} />
      <span>Integraciones desactivadas (feature flags off).</span>
    </div>
  {:else}
    <div class="integ-grid">
      {#if exportOn}
        <!-- Export contable -->
        <section class="glass-card section-pad" data-testid="export-block">
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
          <button type="button" class="primary" onclick={runExport}>
            <Icon name="download" size={14} />
            Exportar
          </button>
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
        <section class="glass-card section-pad" data-testid="keys-block">
          <div class="card-header">
            <h2>API Keys</h2>
            <Icon name="key" size={16} />
          </div>
          <p class="section-desc">Una sola vista del plaintext al crear. Revoca en servidor para corte inmediato.</p>
          <div class="btn-row">
            <button type="button" class="primary" onclick={createKey}>
              <Icon name="plus" size={14} />
              Crear API key
            </button>
            <button type="button" class="secondary" onclick={listKeys}>
              <Icon name="list" size={14} />
              Listar
            </button>
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
          {#if keysJson}
            <pre class="code-preview">{keysJson}</pre>
          {/if}
        </section>

        <!-- Webhooks -->
        <section class="glass-card section-pad" data-testid="webhooks-block">
          <div class="card-header">
            <h2>Webhooks</h2>
            <Icon name="link" size={16} />
          </div>
          <p class="section-desc">HTTPS obligatorio. Eventos: sale.created, cpe.accepted, cpe.rejected.</p>
          <div class="field-group">
            <label for="int-webhook-url">URL del endpoint</label>
            <input id="int-webhook-url" bind:value={webhookUrl} />
          </div>
          <div class="btn-row">
            <button type="button" class="primary" onclick={createWebhook}>
              <Icon name="plus" size={14} />
              Registrar endpoint
            </button>
            <button type="button" class="secondary" onclick={listWebhooks}>
              <Icon name="list" size={14} />
              Listar
            </button>
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
          {#if endpointsJson}
            <pre class="code-preview">{endpointsJson}</pre>
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

  .section-pad { padding: 1.25rem; }

  .section-desc {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-bottom: 0.875rem;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 0.875rem;
  }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
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

  .btn-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.875rem;
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
    .two-col { grid-template-columns: 1fr; }
  }
</style>
