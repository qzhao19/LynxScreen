<script lang="ts">
  export let onClick: () => void = () => {};
</script>

<button class="help-button" on:click={onClick} aria-label="Help">
  ?
</button>

<style>
  .help-button {
    position: fixed;
    bottom: var(--spacing-xl);
    right: var(--spacing-xl);
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-fast);
    box-shadow: var(--shadow-card);
  }

  .help-button:hover {
    background: var(--color-bg-card-hover);
    color: var(--color-text-primary);
  }
</style>