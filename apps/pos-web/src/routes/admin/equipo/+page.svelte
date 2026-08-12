<script lang="ts">
  import { isTeamInviteEnabled } from '$lib/features';
  import { inviteTeamMember } from '$lib/cash/shift-handoff';
  import Icon from '$lib/ui/Icon.svelte';

  const teamOn = isTeamInviteEnabled();

  let email = $state('');
  let role = $state('cashier');
  let branchId = $state('');
  let status = $state('');
  let resultMsg = $state('');
  let credentials = $state<{ badgeBarcode: string; cashierPin: string } | null>(null);

  async function onInvite() {
    status = 'enviando';
    resultMsg = '';
    credentials = null;
    const res = await inviteTeamMember(email, role, branchId.trim() || null);
    if (!res.ok) {
      status = 'error';
      resultMsg = res.message;
      return;
    }
    status = 'invitado';
    credentials = { badgeBarcode: res.badgeBarcode, cashierPin: res.cashierPin };
    resultMsg = 'Invitación creada. Estas credenciales solo se muestran una vez:';
    email = '';
  }
</script>

<svelte:head><title>Equipo · Admin · KipusPay</title></svelte:head>

<div class="team-page-container">
  <section class="glass-panel team-card" data-testid="team-panel">
    <div class="card-header-bar">
      <div>
        <span class="badge badge-indigo">Equipo</span>
        <h1 class="page-title">Invitar cajeros y vendedores</h1>
      </div>
    </div>

    <p class="lede-text">
      Cada invitado recibe un PIN de caja (tecleo rápido en el carrito) y un badge
      <code>EMP-…</code> para el lector. Único por email.
    </p>

    {#if !teamOn}
      <div class="banner-box off-banner" data-testid="team-feature-off">
        <span class="banner-icon"><Icon name="alert" size={20} /></span>
        <div>
          <strong>FEATURE_TEAM_INVITE desactivado</strong>
          <p>Activa el flag operacional para invitar equipo.</p>
        </div>
      </div>
    {:else}
      <div class="form-group">
        <label for="team-email">Email del invitado</label>
        <input id="team-email" bind:value={email} data-testid="team-email" placeholder="cajero@tienda.pe" />
      </div>
      <div class="form-group">
        <label for="team-role">Rol</label>
        <select id="team-role" bind:value={role} data-testid="team-role">
          <option value="cashier">Cajero / Vendedor</option>
          <option value="supervisor">Supervisor</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div class="form-group">
        <label for="team-branch">Sucursal (opcional)</label>
        <input id="team-branch" bind:value={branchId} data-testid="team-branch" placeholder="branch-1" />
      </div>

      <button type="button" class="primary invite-btn" data-testid="team-invite" onclick={onInvite}>
        <Icon name="user" size={16} />
        Invitar
      </button>

      {#if status || resultMsg}
        <div class="result-card" data-testid="team-result">
          {#if status}
            <span class="badge" class:badge-success={status === 'invitado'} class:badge-danger={status === 'error'}>
              {status}
            </span>
          {/if}
          {#if resultMsg}
            <p class="result-msg">{resultMsg}</p>
          {/if}
          {#if credentials}
            <div class="creds-grid">
              <div class="cred-item" data-testid="team-badge">
                <span class="cred-label">Badge (escanear)</span>
                <strong class="tabular-nums">{credentials.badgeBarcode}</strong>
              </div>
              <div class="cred-item" data-testid="team-pin">
                <span class="cred-label">PIN de caja (teclear)</span>
                <strong class="tabular-nums">{credentials.cashierPin}</strong>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </section>
</div>

<style>
  .team-page-container {
    max-width: 620px;
    margin: 0 auto;
  }

  .team-card {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .card-header-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .page-title {
    font-size: 1.5rem;
    font-weight: 800;
    margin-top: 0.25rem;
  }

  .lede-text {
    color: var(--text-muted);
    font-size: 0.9375rem;
    line-height: 1.5;
  }
  .lede-text code {
    color: var(--emerald-green);
  }

  .off-banner {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    padding: 1rem;
    border-radius: var(--radius-md);
    display: flex;
    gap: 0.875rem;
    align-items: center;
    color: #fbbf24;
  }

  .invite-btn {
    width: 100%;
    padding: 0.875rem;
  }

  .result-card {
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid var(--border-glow);
    border-radius: var(--radius-md);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .result-msg {
    font-size: 0.9375rem;
  }

  .creds-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.875rem;
  }

  .cred-item {
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: var(--radius-md);
    padding: 0.875rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .cred-label {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
</style>
