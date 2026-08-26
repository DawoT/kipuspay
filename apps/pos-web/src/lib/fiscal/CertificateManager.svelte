<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { apiFetch } from '$lib/auth/api-client';
  import {
    classifyCertTrafficLight,
    computeDaysUntilExpiry,
    validateClientCertificate,
    type CertTrafficLightStatus,
  } from './cert-client-validator.js';

  interface Props {
    readonly expectedRuc?: string;
    readonly onUpdated?: () => void;
  }

  let { expectedRuc = '', onUpdated }: Props = $props();

  let certUploaded = $state(false);
  let certExpiresAt = $state('');
  let certForbidden = $state(false);
  let loading = $state(true);

  let certFile = $state<File | null>(null);
  let certPassword = $state('');
  let certBusy = $state(false);
  let certMessage = $state('');
  let certMessageType = $state<'info' | 'danger' | 'success'>('info');
  let isDragging = $state(false);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  let daysRemaining = $derived(
    certExpiresAt ? computeDaysUntilExpiry(certExpiresAt) : 0,
  );

  let trafficStatus = $derived<CertTrafficLightStatus>(
    classifyCertTrafficLight({
      uploaded: certUploaded,
      expiresAt: certExpiresAt,
    }),
  );

  function fileToB64(file: File): Promise<string> {
    return file.arrayBuffer().then((buf) => {
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    });
  }

  function handleFileChange(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    certFile = target.files?.[0] ?? null;
    certMessage = '';
  }

  function isValidCertExtension(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    return lower.endsWith('.p12') || lower.endsWith('.pfx');
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    // DataTransfer API — HTML5 drag and drop sin librerías
    const dt: DataTransfer | null = event.dataTransfer;
    if (dt) dt.dropEffect = 'copy';
    isDragging = true;
  }

  function handleDragLeave(event: DragEvent): void {
    event.preventDefault();
    isDragging = false;
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    isDragging = false;
    const dt: DataTransfer | null = event.dataTransfer;
    const file = dt?.files?.[0] ?? null;
    if (!file) return;
    if (!isValidCertExtension(file.name)) {
      certMessage = 'Solo se permiten archivos .p12 o .pfx.';
      certMessageType = 'danger';
      return;
    }
    certFile = file;
    certMessage = '';
    // Sincroniza el input nativo para que el flujo click + drop compartan estado
    if (fileInputEl) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      fileInputEl.files = transfer.files;
    }
  }

  export async function loadTenantCert(): Promise<void> {
    loading = true;
    certForbidden = false;
    try {
      const res = await apiFetch('/api/fiscal/tenant-cert', { storage: localStorage });
      if (res.status === 403) {
        certForbidden = true;
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        uploaded?: boolean;
        expiresAt?: string;
      } | null;
      certUploaded = Boolean(body?.uploaded);
      certExpiresAt = typeof body?.expiresAt === 'string' ? body.expiresAt : '';
    } catch {
      certMessage = 'Sin conexión con el servidor. Inténtalo de nuevo.';
      certMessageType = 'danger';
    } finally {
      loading = false;
    }
  }

  async function handleVerifyAndSave(): Promise<void> {
    if (certBusy || !certFile || !certPassword) return;
    certBusy = true;
    certMessage = '';

    // 1. Preflight Client-Side WebCrypto
    const localValidation = await validateClientCertificate(certFile, certPassword, expectedRuc);
    if (!localValidation.valid) {
      certBusy = false;
      certMessage = localValidation.errorMessage;
      certMessageType = 'danger';
      return;
    }

    // 2. Local validation passed -> send payload to server
    try {
      const p12B64 = await fileToB64(certFile);
      const res = await apiFetch('/api/fiscal/tenant-cert', {
        method: 'POST',
        storage: localStorage,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ p12B64, password: certPassword }),
      });
      const body = (await res.json().catch(() => null)) as {
        uploaded?: boolean;
        expiresAt?: string;
        code?: string;
        error?: string;
      } | null;

      certPassword = '';
      if (res.ok && body?.uploaded) {
        certUploaded = true;
        certExpiresAt = typeof body.expiresAt === 'string' ? body.expiresAt : localValidation.expiresAt;
        certFile = null;
        certMessage = 'Certificado digital actualizado.';
        certMessageType = 'success';
        onUpdated?.();
      } else if (res.status === 403) {
        certForbidden = true;
        certMessage = 'Solo el dueño o un administrador puede cargar el certificado.';
        certMessageType = 'danger';
      } else {
        certMessage =
          body?.error ||
          'No se pudo abrir el archivo. Revisa la contraseña y que sea .p12 o .pfx.';
        certMessageType = 'danger';
      }
    } catch {
      certMessage = 'Sin conexión con el servidor. Inténtalo de nuevo.';
      certMessageType = 'danger';
    } finally {
      certBusy = false;
    }
  }

  onMount(() => {
    void loadTenantCert();
  });
</script>

{#if !certForbidden}
  <div class="field" data-testid="tenant-cert-upload">
    <div class="cert-header">
      <h3>Certificado digital y firma de comprobantes</h3>
    </div>

    <!-- Semáforo de vigencia -->
    <div class="cert-traffic-light {trafficStatus.toLowerCase()}" data-testid="cert-traffic-light">
      <div class="light-indicator">
        <span class="light-dot"></span>
      </div>
      <div class="light-content">
        {#if trafficStatus === 'KIPUSPAY_SIGNATURE'}
          <div class="light-title" data-testid="cert-status-badge">
            <Icon name="shield" size={16} />
            <strong>Firma autorizada KipusPay activa</strong>
          </div>
          <p class="light-desc">
            Tus comprobantes se firman automáticamente con la firma de KipusPay. No necesitas un
            certificado propio, salvo que prefieras usar el de tu negocio.
          </p>
        {:else if trafficStatus === 'VALID'}
          <div class="light-title" data-testid="cert-status-badge">
            <Icon name="check" size={16} />
            <strong>Certificado digital propio activo</strong>
          </div>
          <p class="light-desc">
            Vigente hasta el {certExpiresAt.slice(0, 10)} (quedan {daysRemaining} días).
            Tus comprobantes se firman con tu certificado.
          </p>
        {:else if trafficStatus === 'EXPIRING_SOON'}
          <div class="light-title" data-testid="cert-status-badge">
            <Icon name="alert" size={16} />
            <strong>Certificado próximo a vencer</strong>
          </div>
          <p class="light-desc">
            Vence el {certExpiresAt.slice(0, 10)} (quedan {daysRemaining} días).
            Te sugerimos renovarlo pronto para no interrumpir la emisión de comprobantes.
          </p>
        {:else if trafficStatus === 'EXPIRED'}
          <div class="light-title" data-testid="cert-status-badge">
            <Icon name="alert" size={16} />
            <strong>Certificado digital vencido</strong>
          </div>
          <p class="light-desc">
            Venció el {certExpiresAt.slice(0, 10)}. Debes cargar un certificado renovado
            para continuar emitiendo comprobantes.
          </p>
        {/if}
      </div>
    </div>

    <p class="hint">
      {#if certUploaded}
        Puedes renovar o reemplazar tu certificado subiendo un nuevo archivo .p12 o .pfx.
        La contraseña se usa una sola vez para verificar y no se guarda.
      {:else}
        Carga el archivo .p12 o .pfx que te entregó tu proveedor. La contraseña
        se usa una sola vez y no se guarda.
      {/if}
    </p>

    <div class="form-group">
      <label for="tenant-cert-file">Archivo .p12 / .pfx</label>
      <div
        class="cert-drop-zone"
        class:dragging={isDragging}
        data-testid="tenant-cert-dropzone"
        role="button"
        aria-label="Zona para arrastrar certificado — arrastra un archivo .p12 o .pfx o presiona para seleccionar"
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}
        onclick={(e: MouseEvent) => {
          const t = e.target as HTMLElement | null;
          if (t?.closest('input[type="file"]')) return;
          fileInputEl?.click();
        }}
        onkeydown={(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputEl?.click();
          }
        }}
        tabindex="0"
      >
        <div class="drop-content">
          <Icon name="upload" size={20} />
          {#if isDragging}
            <p class="drop-text drop-active" data-testid="tenant-cert-drop-hint">
              Suelta el certificado aquí
            </p>
          {:else}
            <p class="drop-text">Arrastra tu certificado .p12 o .pfx aquí</p>
            <p class="drop-or">o</p>
            <span class="drop-browse" role="button" tabindex="-1">Seleccionar archivo</span>
          {/if}
          {#if certFile}
            <p class="drop-file" data-testid="tenant-cert-selected">
              Archivo seleccionado: {certFile.name}
            </p>
          {/if}
        </div>
        <input
          bind:this={fileInputEl}
          id="tenant-cert-file"
          data-testid="tenant-cert-file"
          type="file"
          accept=".p12,.pfx,application/x-pkcs12"
          onchange={handleFileChange}
        />
      </div>
    </div>

    <div class="form-group">
      <label for="tenant-cert-pass">Contraseña del certificado</label>
      <input
        id="tenant-cert-pass"
        data-testid="tenant-cert-pass"
        type="password"
        autocomplete="off"
        placeholder="Contraseña del archivo"
        bind:value={certPassword}
      />
    </div>

    <div class="cert-actions">
      <Button
        variant="primary"
        size="sm"
        data-testid="tenant-cert-submit"
        disabled={certBusy || !certFile || !certPassword}
        onclick={() => void handleVerifyAndSave()}
      >
        {certBusy ? 'Verificando y guardando…' : 'Verificar y guardar'}
      </Button>
    </div>

    {#if certMessage}
      <p
        class="hint cert-feedback-msg"
        class:msg-danger={certMessageType === 'danger'}
        class:msg-success={certMessageType === 'success'}
        data-testid="tenant-cert-message"
      >
        {certMessage}
      </p>
    {/if}
  </div>
{/if}

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-subtle);
  }

  .cert-header h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--text-main);
  }

  .cert-traffic-light {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    border-radius: var(--radius-sm, 0);
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    transition: all 0.2s ease;
  }

  .light-indicator {
    padding-top: 0.2rem;
  }

  .light-dot {
    display: block;
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    background: var(--text-muted);
  }

  .light-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }

  .light-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.88rem;
  }

  .light-desc {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.4;
    color: var(--text-muted);
  }

  /* Estados del semáforo */
  .cert-traffic-light.kipuspay_signature {
    background: rgba(112, 120, 232, 0.08);
    border-color: rgba(112, 120, 232, 0.3);
    color: var(--indigo-blue);
  }
  .cert-traffic-light.kipuspay_signature .light-dot {
    background: var(--indigo-blue);
    box-shadow: 0 0 8px rgba(112, 120, 232, 0.4);
  }

  .cert-traffic-light.valid {
    background: rgba(61, 187, 134, 0.08);
    border-color: rgba(61, 187, 134, 0.3);
    color: var(--emerald-green);
  }
  .cert-traffic-light.valid .light-dot {
    background: var(--emerald-green);
    box-shadow: 0 0 8px rgba(61, 187, 134, 0.4);
  }

  .cert-traffic-light.expiring_soon {
    background: rgba(217, 154, 61, 0.08);
    border-color: rgba(217, 154, 61, 0.3);
    color: var(--amber-gold);
  }
  .cert-traffic-light.expiring_soon .light-dot {
    background: var(--amber-gold);
    box-shadow: 0 0 8px rgba(217, 154, 61, 0.4);
  }

  .cert-traffic-light.expired {
    background: rgba(232, 122, 94, 0.08);
    border-color: rgba(232, 122, 94, 0.3);
    color: var(--rose-red);
  }
  .cert-traffic-light.expired .light-dot {
    background: var(--rose-red);
    box-shadow: 0 0 8px rgba(232, 122, 94, 0.4);
  }

  .hint {
    font-size: 0.84rem;
    color: var(--text-muted);
    line-height: 1.45;
    margin: 0;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .form-group label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .form-group input {
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-sm, 0);
    border: 1px solid var(--border-subtle);
    background: var(--bg-input);
    color: var(--text-main);
    font-size: 0.88rem;
  }

  .cert-actions {
    margin-top: 0.25rem;
  }

  .cert-feedback-msg.msg-danger {
    color: var(--rose-red);
  }

  .cert-feedback-msg.msg-success {
    color: var(--emerald-green);
  }

  .cert-drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.25rem 1rem;
    border: 2px dashed var(--border-subtle);
    border-radius: var(--radius-sm, 0);
    background: var(--bg-surface);
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      box-shadow 0.15s ease;
    text-align: center;
    outline: none;
    min-height: 44px;
  }

  .cert-drop-zone:focus-visible {
    outline: 3px solid rgba(217, 154, 61, 0.55);
    outline-offset: 2px;
    border-color: var(--amber-gold);
  }

  .cert-drop-zone.dragging {
    border-color: var(--indigo-blue);
    background: rgba(112, 120, 232, 0.08);
    box-shadow: 0 0 0 3px rgba(112, 120, 232, 0.2);
  }

  .cert-drop-zone input[type='file'] {
    width: 100%;
    max-width: 100%;
    margin-top: 0.35rem;
    font-size: 0.82rem;
  }

  .drop-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    pointer-events: none;
  }

  .drop-content :global(svg) {
    color: var(--text-muted);
  }

  .cert-drop-zone.dragging .drop-content :global(svg) {
    color: var(--indigo-blue);
  }

  .drop-text {
    margin: 0;
    font-size: 0.88rem;
    color: var(--text-main);
    line-height: 1.4;
  }

  .drop-text.drop-active {
    color: var(--indigo-blue);
    font-weight: 700;
    font-size: 0.92rem;
  }

  .drop-or {
    margin: 0;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .drop-browse {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    min-width: 44px;
    padding: 0.5rem 1rem;
    border-radius: var(--radius-sm, 0);
    border: 1px solid var(--border-subtle);
    background: var(--bg-input);
    color: var(--text-main);
    font-size: 0.84rem;
    font-weight: 600;
    pointer-events: auto;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }

  .drop-browse:hover {
    background: var(--bg-glass-hover, rgba(0, 0, 0, 0.04));
    border-color: var(--border-strong);
  }

  .drop-file {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: var(--emerald-green);
    word-break: break-all;
  }
</style>
