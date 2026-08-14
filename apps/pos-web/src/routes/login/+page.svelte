<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { cashierLogin, LoginError } from '$lib/auth/cashier-login';
  import { writeLoginTenantId, writeLoginToken, writeLoginUser } from '$lib/auth/token-store';
  import { defaultTenantSession, readTenantSession } from '$lib/tenant/session';
import { resolveApiBase } from '$lib/auth/api-client';

  let tenantId = $state(defaultTenantSession().tenantId);
  let identifier = $state('');
  let pin = $state('');
  let busy = $state(false);
  let error = $state('');
  let success = $state('');

  if (typeof sessionStorage !== 'undefined') {
    tenantId = readTenantSession(sessionStorage).tenantId;
  }

  function messageFor(code: string): string {
    switch (code) {
      case 'PIN_INVALID':
        return 'Credenciales inválidas. Verifica tu badge o PIN.';
      case 'PIN_LOCKED':
        return 'Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentar.';
      case 'PIN_NOT_CONFIGURED':
        return 'Este usuario no tiene PIN configurado. Invítalo desde Equipo.';
      case 'FEATURE_OFF':
        return 'El acceso con PIN está desactivado para este entorno.';
      default:
        return 'No se pudo iniciar sesión. Intenta de nuevo.';
    }
  }

  async function onSubmit() {
    error = '';
    success = '';
    const id = identifier.trim();
    if (!id || !pin) {
      error = 'Ingresa tu badge o usuario y tu PIN.';
      return;
    }
    busy = true;
    try {
      const result = await cashierLogin({
        apiBase: resolveApiBase(localStorage),
        tenantId,
        identifier: id,
        pin,
      });
      writeLoginToken(localStorage, result.token);
      writeLoginTenantId(localStorage, tenantId);
      writeLoginUser(localStorage, {
        userId: result.user.userId,
        role: result.user.role,
        branchId: result.user.branchId,
      });
      success = 'Sesión iniciada. Cargando el terminal…';
      setTimeout(() => {
        window.location.href = '/';
      }, 400);
    } catch (err) {
      const code = err instanceof LoginError ? err.code : 'UNKNOWN';
      error = messageFor(code);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Iniciar sesión · KipusPay</title>
</svelte:head>

<div class="login-container">
  <div class="glass-card login-card" aria-labelledby="login-title" data-testid="login-card">
    <div class="brand-badge">
      <Icon name="shield" size={24} />
    </div>
    <p class="page-eyebrow">Acceso Seguro</p>
    <h1 id="login-title" class="page-title">Inicia sesión para continuar</h1>
    <p class="login-desc">
      Usa tu badge <code>EMP-…</code> o tu usuario y el PIN de caja. La pantalla bloqueada no
      contiene montos, identidad de clientes ni información fiscal.
    </p>

    {#if error}
      <StatusMessage tone="danger" role="alert" data-testid="login-error">
        <Icon name="alert" size={16} />
        <span>{error}</span>
      </StatusMessage>
    {/if}
    {#if success}
      <StatusMessage tone="info" role="status" data-testid="login-success">
        <Icon name="check" size={16} />
        <span>{success}</span>
      </StatusMessage>
    {/if}

    <Field label="Badge o usuario" id="login-identifier">
      <Input
        id="login-identifier"
        data-testid="login-identifier"
        bind:value={identifier}
        autocomplete="off"
        placeholder="EMP-12345 o usuario"
      />
    </Field>
    <Field label="PIN de caja" id="login-pin">
      <Input
        id="login-pin"
        data-testid="login-pin"
        type="password"
        bind:value={pin}
        autocomplete="off"
        inputmode="numeric"
        placeholder="••••"
      />
    </Field>

    <Button
      size="full"
      data-testid="login-submit"
      onclick={onSubmit}
      busy={busy}
      icon="key"
    >
      {busy ? 'Iniciando…' : 'Iniciar sesión'}
    </Button>
  </div>
</div>

<style>
  .login-container {
    min-height: 80vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .login-card {
    max-width: 28rem;
    width: 100%;
    padding: 2rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .brand-badge {
    width: 3.25rem;
    height: 3.25rem;
    border-radius: var(--radius-full);
    background: rgba(217, 154, 61, 0.15);
    border: 1px solid var(--border-glow);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent-primary);
    margin-bottom: 0.25rem;
  }

  .login-card :global(.field-group) {
    width: 100%;
    text-align: left;
  }

  .page-title {
    font-size: 1.35rem;
  }

  .login-desc {
    color: var(--text-muted);
    font-size: 0.875rem;
    line-height: 1.5;
    margin-bottom: 0.5rem;
  }


</style>
