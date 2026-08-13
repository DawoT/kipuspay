<script lang="ts">
  import { onMount } from 'svelte';
  import { isOwnerModeEnabled, isStockTransfersEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  const ownerOn = isOwnerModeEnabled();
  const xferOn = isStockTransfersEnabled();

  let status = $state('');
  let loading = $state(false);
  let pending = $state<
    { id: string; from_branch_id: string; to_branch_id: string; status: string; shipped_at: string | null }[]
  >([]);
  let discrepancies = $state<
    { transfer_id: string; product_id: string; qty_sent: number; qty_received: number; qty_shrink: number; shrink_reason: string | null }[]
  >([]);

  async function load() {
    loading = true;
    status = 'Cargando…';
    const apiBase = resolveApiBase(localStorage);
    const auth = resolveApiAuth(localStorage).authorization ?? '';
    try {
      const res = await fetch(`${apiBase}/api/owner/transfers/pending`, { headers: { authorization: auth } });
      const json = (await res.json()) as { pending?: typeof pending; discrepancies?: typeof discrepancies; error?: string };
      if (!res.ok) { status = json.error ?? 'error'; pending = []; discrepancies = []; loading = false; return; }
      pending = json.pending ?? [];
      discrepancies = json.discrepancies ?? [];
      status = `${pending.length} en tránsito · ${discrepancies.length} discrepancia(s)`;
    } catch { status = 'Sin conexión'; pending = []; discrepancies = []; }
    loading = false;
  }

  onMount(() => { if (ownerOn && xferOn) void load(); });
</script>

<svelte:head><title>Transferencias pendientes · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="owner-transferencias">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="truck" size={12} /> Modo Dueño · Transferencias</p>
      <h1 class="page-title">Transferencias pendientes</h1>
      <p class="page-lede">IN_TRANSIT y mermas en recepción — Cadena light.</p>
    </div>
    {#if ownerOn && xferOn}
      <Button variant="secondary" data-testid="owner-xfer-refresh" onclick={load} disabled={loading} icon="refresh">
        Actualizar
      </Button>
    {/if}
  </div>

  {#if !ownerOn || !xferOn}
    <div class="feature-off-banner" data-testid="owner-xfer-off">
      <Icon name="info" size={18} />
      <span>Las transferencias no están activas para este negocio.</span>
    </div>
  {:else}
    {#if status}
      <p class="status-line" data-testid="owner-xfer-status">{status}</p>
    {/if}

    <div class="xfer-grid">
      <!-- En tránsito -->
      <div class="glass-card section-pad">
        <div class="card-header">
          <h2>En tránsito</h2>
          <span class="badge {pending.length > 0 ? 'badge-warning' : 'badge-success'}">{pending.length}</span>
        </div>
        <ul class="item-list" data-testid="owner-xfer-pending">
          {#each pending as t}
            <li class="item-row">
              <span class="item-id">{t.id}</span>
              <span class="item-route">
                <Icon name="arrow-right" size={12} />
                {t.from_branch_id} → {t.to_branch_id}
              </span>
              {#if t.shipped_at}
                <span class="item-meta">{t.shipped_at}</span>
              {/if}
            </li>
          {:else}
            <li class="empty-row">Sin transferencias en tránsito</li>
          {/each}
        </ul>
      </div>

      <!-- Discrepancias -->
      <div class="glass-card section-pad">
        <div class="card-header">
          <h2>Discrepancias (merma)</h2>
          <span class="badge {discrepancies.length > 0 ? 'badge-danger' : 'badge-success'}">{discrepancies.length}</span>
        </div>
        <ul class="item-list" data-testid="owner-xfer-disc">
          {#each discrepancies as d}
            <li class="item-row disc-row">
              <span class="item-id">{d.transfer_id} · {d.product_id}</span>
              <span class="disc-detail">
                Enviado {d.qty_sent} / Recibido {d.qty_received} / Merma {d.qty_shrink}
              </span>
              {#if d.shrink_reason}
                <span class="item-meta">{d.shrink_reason}</span>
              {/if}
            </li>
          {:else}
            <li class="empty-row">Sin discrepancias recientes</li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}
</div>

<style>
  .xfer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; align-items: start; }
  .status-line { font-size: 0.875rem; color: var(--text-muted); margin-top: -0.5rem; }
  .item-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.375rem; }
  .item-row { display: flex; align-items: center; gap: 0.625rem; padding: 0.5rem 0.625rem; background: var(--bg-glass); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); flex-wrap: wrap; }
  .item-id { font-family: var(--font-mono); font-size: 0.8125rem; color: var(--text-main); font-weight: 600; }
  .item-route { display: flex; align-items: center; gap: 0.25rem; font-size: 0.8125rem; color: var(--accent-primary); }
  .item-meta { font-size: 0.75rem; color: var(--text-dim); width: 100%; }
  .disc-row { border-color: rgba(217, 106, 60, 0.2); }
  .disc-detail { font-size: 0.8125rem; color: var(--rose-red); font-family: var(--font-mono); }
  .empty-row { padding: 1rem; text-align: center; color: var(--text-dim); font-size: 0.875rem; }
  @media (max-width: 600px) { .xfer-grid { grid-template-columns: 1fr; } }
</style>
