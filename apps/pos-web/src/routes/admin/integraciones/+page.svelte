<script lang="ts">
  import {
    isAccountingExportEnabled,
    isIntegrationsApiEnabled,
  } from '$lib/features';

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

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

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
      try {
        const j = JSON.parse(text) as { error?: string };
        exportMessage = j.error ?? text;
      } catch {
        exportMessage = text;
      }
      return;
    }
    exportMessage = `Export ${target} OK (${text.length} bytes)`;
    exportPreview = text.slice(0, 800);
  }

  async function createKey() {
    keysMessage = '';
    createdKey = '';
    const res = await fetch(`${apiBase()}/api/integrations/api-keys`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: '{}',
    });
    const json = (await res.json()) as { apiKey?: string; error?: string };
    if (res.ok && json.apiKey) {
      createdKey = json.apiKey;
      keysMessage = 'API key creada — guárdala ahora';
    } else {
      keysMessage = json.error ?? 'error';
    }
  }

  async function listKeys() {
    keysMessage = '';
    const res = await fetch(`${apiBase()}/api/integrations/api-keys`, {
      headers: { authorization: auth() },
    });
    const json = await res.json();
    keysJson = JSON.stringify(json, null, 2);
    keysMessage = res.ok ? 'Keys listadas' : 'error';
  }

  async function createWebhook() {
    webhookMessage = '';
    createdSecret = '';
    const res = await fetch(`${apiBase()}/api/integrations/webhooks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        url: webhookUrl,
        events: ['sale.created', 'cpe.accepted', 'cpe.rejected'],
      }),
    });
    const json = (await res.json()) as { secret?: string; id?: string; error?: string };
    if (res.ok && json.secret) {
      createdSecret = json.secret;
      webhookMessage = `Endpoint ${json.id} creado — guarda el secret`;
    } else {
      webhookMessage = json.error ?? 'error';
    }
  }

  async function listWebhooks() {
    webhookMessage = '';
    const res = await fetch(`${apiBase()}/api/integrations/webhooks`, {
      headers: { authorization: auth() },
    });
    const json = await res.json();
    endpointsJson = JSON.stringify(json, null, 2);
    webhookMessage = res.ok ? 'Endpoints listados' : 'error';
  }
</script>

<section class="admin-integrations" data-testid="admin-integraciones">
  <h1>Admin · Integraciones</h1>
  <p class="lede">
    Export Contasis/Concar y API pública (Cadena+). Soft-launch detrás de flags.
  </p>

  {#if !exportOn && !apiOn}
    <p data-testid="integrations-off">Integraciones desactivadas (feature flags off).</p>
  {:else}
    {#if exportOn}
      <section data-testid="export-block">
        <h2>Export contable</h2>
        <p>Asientos por rango y sucursal (solo lectura).</p>
        <label>
          Desde
          <input bind:value={fromDate} type="date" />
        </label>
        <label>
          Hasta
          <input bind:value={toDate} type="date" />
        </label>
        <label>
          Sucursal
          <input bind:value={branchId} />
        </label>
        <label>
          Formato
          <select bind:value={target}>
            <option value="contasis">Contasis (CSV)</option>
            <option value="concar">Concar (XML)</option>
          </select>
        </label>
        <button type="button" onclick={runExport}>Exportar</button>
        {#if exportMessage}
          <p data-testid="export-message">{exportMessage}</p>
        {/if}
        {#if exportPreview}
          <pre data-testid="export-preview">{exportPreview}</pre>
        {/if}
      </section>
    {/if}

    {#if apiOn}
      <section data-testid="keys-block">
        <h2>API keys</h2>
        <p>Una sola vista del plaintext al crear. Revoca en servidor para corte inmediato.</p>
        <button type="button" onclick={createKey}>Crear API key</button>
        <button type="button" onclick={listKeys}>Listar</button>
        {#if createdKey}
          <p data-testid="created-api-key"><code>{createdKey}</code></p>
        {/if}
        {#if keysMessage}
          <p data-testid="keys-message">{keysMessage}</p>
        {/if}
        {#if keysJson}
          <pre>{keysJson}</pre>
        {/if}
      </section>

      <section data-testid="webhooks-block">
        <h2>Webhooks</h2>
        <p>HTTPS obligatorio. Eventos: sale.created, cpe.accepted, cpe.rejected.</p>
        <label>
          URL
          <input bind:value={webhookUrl} />
        </label>
        <button type="button" onclick={createWebhook}>Registrar endpoint</button>
        <button type="button" onclick={listWebhooks}>Listar</button>
        {#if createdSecret}
          <p data-testid="created-webhook-secret"><code>{createdSecret}</code></p>
        {/if}
        {#if webhookMessage}
          <p data-testid="webhook-message">{webhookMessage}</p>
        {/if}
        {#if endpointsJson}
          <pre>{endpointsJson}</pre>
        {/if}
      </section>
    {/if}
  {/if}
</section>

<style>
  .admin-integrations {
    max-width: 40rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
    font-family: 'Source Serif 4', 'Iowan Old Style', Georgia, serif;
    color: #1a1f16;
    background:
      radial-gradient(ellipse at 10% 0%, #e8f0e4 0%, transparent 55%),
      linear-gradient(180deg, #f7f5ef 0%, #efe8dc 100%);
    min-height: 100vh;
  }
  h1 {
    font-size: clamp(1.75rem, 4vw, 2.25rem);
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 0 0 0.35rem;
  }
  .lede {
    margin: 0 0 1.75rem;
    color: #4a5240;
    font-size: 1rem;
  }
  section + section {
    margin-top: 2rem;
    padding-top: 1.25rem;
    border-top: 1px solid #c9d0c0;
  }
  h2 {
    font-size: 1.15rem;
    margin: 0 0 0.35rem;
  }
  label {
    display: block;
    margin: 0.65rem 0;
    font-size: 0.9rem;
  }
  input,
  select {
    display: block;
    width: 100%;
    margin-top: 0.25rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid #a8b39a;
    border-radius: 0;
    background: #fffdf8;
    font: inherit;
  }
  button {
    margin: 0.4rem 0.4rem 0.4rem 0;
    padding: 0.5rem 0.9rem;
    border: 1px solid #2f3a28;
    background: #2f3a28;
    color: #f7f5ef;
    font: inherit;
    cursor: pointer;
  }
  pre {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: #1a1f16;
    color: #e8f0e4;
    overflow: auto;
    font-size: 0.75rem;
    max-height: 16rem;
  }
  code {
    word-break: break-all;
  }
</style>
