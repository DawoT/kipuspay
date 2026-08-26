<script lang="ts">
  // S7-H1: identidad del cliente en el cobro — nunca inventar valor ficticio.
  // Server exige doc+nombre para boleta ≥ S/ 700 (BOLETA_ID_REQUIRED).
  let {
    docType = $bindable('1'),
    docNumber = $bindable(''),
    customerName = $bindable(''),
  }: {
    docType?: string;
    docNumber?: string;
    customerName?: string;
  } = $props();
</script>

<div class="customer-input-group">
  <label for="customer-doc-type">Cliente</label>
  <select id="customer-doc-type" bind:value={docType} data-testid="customer-doc-type">
    <option value="1">DNI</option>
    <option value="6">RUC</option>
    <option value="4">CE</option>
  </select>
  <input
    id="customer-doc-number"
    bind:value={docNumber}
    placeholder="N.º documento"
    data-testid="customer-doc-number"
  />
  <input
    id="customer-name"
    bind:value={customerName}
    placeholder="Nombre / razón social"
    data-testid="customer-name"
  />
</div>

<style>
  .customer-input-group {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
    min-width: 0;
  }
  .customer-input-group label {
    margin-bottom: 0;
    white-space: nowrap;
  }
  .customer-input-group select,
  .customer-input-group input {
    min-width: 0;
    max-width: 100%;
    padding: var(--inset-field);
  }
  @media (max-width: 899px) {
    .customer-input-group {
      width: 100%;
      flex-direction: column;
      align-items: stretch;
    }
    .customer-input-group label {
      white-space: normal;
    }
    .customer-input-group select,
    .customer-input-group input {
      width: 100%;
    }
  }
</style>
