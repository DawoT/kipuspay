<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
</script>

<svelte:head>
  <title>Iniciar sesión · KipusPay</title>
</svelte:head>

<div class="login-container">
  <div class="glass-card login-card" aria-labelledby="login-title">
    <div class="brand-badge">
      <Icon name="shield" size={24} />
    </div>
    <p class="page-eyebrow">Acceso Seguro</p>
    <h1 id="login-title" class="page-title">Inicia sesión para continuar</h1>
    <p class="login-desc">
      La pantalla bloqueada no contiene montos, identidad de clientes ni información fiscal. Continúa con el acceso habitual de tu terminal.
    </p>
    <a href="/" class="primary login-btn">
      <Icon name="key" size={16} />
      Ir al acceso del POS
    </a>
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

  .page-title {
    font-size: 1.35rem;
  }

  .login-desc {
    color: var(--text-muted);
    font-size: 0.875rem;
    line-height: 1.5;
    margin-bottom: 0.5rem;
  }

  .login-btn {
    width: 100%;
    justify-content: center;
    gap: 0.5rem;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    padding: 0.75rem 1.25rem;
    font-size: 0.9375rem;
    border-radius: var(--radius-md);
  }
</style>
