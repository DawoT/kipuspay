<script lang="ts">
  import { STUBS } from '$lib/content/home';

  interface Props {
    path: string;
  }

  let { path }: Props = $props();

  const stub = $derived(STUBS.find((s) => s.path === path)!);
  const isStart = $derived(path === '/empezar');
</script>

<div class="stub" data-testid="stub-page" data-path={path} data-unlock-sprint={stub.unlockSprint}>
  <div class="stub-inner">
    <p class="eyebrow">
      <span class="knot-dot" aria-hidden="true"></span>
      En preparacion
    </p>
    <h1>{stub.title}</h1>
    <p class="stub-lead">{stub.blurb}</p>

    {#if isStart}
      <!-- La caja que prometemos, contada como pasos, no como formulario vacio. -->
      <ol class="stub-steps">
        <li><span>1</span> Cuentanos de tu negocio</li>
        <li><span>2</span> Carga tus productos</li>
        <li><span>3</span> Cobra tu primera venta</li>
      </ol>
      <p class="stub-note">
        No hay lista de espera ni formulario que se pierda: cuando abra el registro, entras directo
        desde el equipo que ya tienes.
      </p>
    {/if}

    <nav class="stub-links" aria-label="Mientras tanto">
      <p class="stub-links-title">Mientras tanto</p>
      <ul>
        {#each stub.meanwhile as link (link.href)}
          <li><a href={link.href}>{link.label}</a></li>
        {/each}
        <li><a href="/">Volver al inicio</a></li>
      </ul>
    </nav>
  </div>
</div>
