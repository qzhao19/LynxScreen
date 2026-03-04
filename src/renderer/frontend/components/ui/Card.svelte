<script lang="ts">
  export let clickable: boolean = false;
  export let padding: "sm" | "md" | "lg" = "lg";
</script>

{#if clickable}
  <button class="card padding-{padding} clickable" type="button" on:click>
    <slot />
  </button>
{:else}
  <div class="card padding-{padding}">
    <slot />
  </div>
{/if}

<style>
  .card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    backdrop-filter: blur(10px);
    transition: all var(--transition-normal);
    width: 100%;
  }

  .clickable {
    cursor: pointer;
  }

  .clickable:hover {
    background: var(--color-bg-card-hover);
    border-color: rgba(148, 163, 184, 0.3);
    transform: translateY(-2px);
  }

  .clickable:active {
    transform: translateY(0);
  }

  .padding-sm {
    padding: var(--spacing-md);
  }

  .padding-md {
    padding: var(--spacing-lg);
  }

  .padding-lg {
    padding: var(--spacing-xl);
  }
</style>