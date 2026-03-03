<script lang="ts">
  import { goBack } from "../../stores/app";
</script>

<button class="back-button" on:click={goBack}>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>
  <span>Back</span>
</button>

<style>
  .back-button {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    cursor: pointer;
    transition: color var(--transition-fast);
    margin-bottom: var(--spacing-lg);
  }

  .back-button:hover {
    color: var(--color-text-primary);
  }
</style>