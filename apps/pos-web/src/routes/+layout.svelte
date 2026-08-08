<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';

  const navLinks = [
    { href: '/', label: 'POS Terminal', icon: '⚡' },
    { href: '/caja', label: 'Cierre Z', icon: '🔒' },
    { href: '/admin/ubicaciones', label: 'Ubicaciones', icon: '📦' },
    { href: '/admin/etiquetas', label: 'Etiquetas', icon: '🏷️' },
    { href: '/admin/diario', label: 'Diario', icon: '📜' },
    { href: '/admin/configuracion', label: 'Configuración', icon: '⚙️' },
    { href: '/owner', label: 'Modo Dueño', icon: '👑' },
  ];
</script>

<header class="app-header">
  <div class="header-container">
    <div class="brand">
      <div class="logo-icon">⚡</div>
      <div class="brand-text">
        <span class="brand-title">KipusPay</span>
        <span class="brand-subtitle">POS & Facturación Edge</span>
      </div>
    </div>

    <nav class="nav-menu">
      {#each navLinks as link}
        <a
          href={link.href}
          class="nav-link"
          class:active={page.url.pathname === link.href || (link.href !== '/' && page.url.pathname.startsWith(link.href))}
        >
          <span class="nav-icon">{link.icon}</span>
          <span class="nav-label">{link.label}</span>
        </a>
      {/each}
    </nav>

    <div class="header-status">
      <div class="badge badge-success">
        <span class="pulse-dot"></span>
        <span>EDGE D1 CONECTADO</span>
      </div>
    </div>
  </div>
</header>

<main class="main-content">
  <slot />
</main>

<style>
  .app-header {
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border-subtle);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0.75rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo-icon {
    width: 38px;
    height: 38px;
    background: var(--accent-gradient);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
  }

  .brand-text {
    display: flex;
    flex-direction: column;
  }

  .brand-title {
    font-family: var(--font-heading);
    font-size: 1.125rem;
    font-weight: 800;
    color: var(--text-main);
    line-height: 1.1;
    letter-spacing: -0.02em;
  }

  .brand-subtitle {
    font-size: 0.6875rem;
    color: var(--accent-primary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .nav-menu {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    background: rgba(255, 255, 255, 0.03);
    padding: 0.25rem;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-subtle);
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.4375rem 0.875rem;
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
    transition: all var(--transition-fast);
  }

  .nav-link:hover {
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.06);
  }

  .nav-link.active {
    color: #ffffff;
    background: var(--accent-primary);
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
  }

  .nav-icon {
    font-size: 0.9375rem;
  }

  .header-status {
    display: flex;
    align-items: center;
  }

  .main-content {
    max-width: 1400px;
    margin: 0 auto;
    padding: 1.5rem;
  }

  @media (max-width: 1024px) {
    .nav-label {
      display: none;
    }
  }
</style>
