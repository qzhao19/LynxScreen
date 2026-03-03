<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { toasts } from "../../stores/index";
</script>

{#if $toasts.length > 0}
  <div class="toast-container">
    {#each $toasts as toast (toast.id)}
      <div 
        class="toast {toast.type}"
        in:fly={{ y: -20, duration: 200 }}
        out:fade={{ duration: 150 }}
      >
        {#if toast.type === "success"}
          <span class="icon">✓</span>
        {:else if toast.type === "error"}
          <span class="icon">✕</span>
        {:else}
          <span class="icon">ℹ</span>
        {/if}
        <span class="message">{toast.message}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: var(--spacing-xl);
    right: var(--spacing-xl);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .toast {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-lg);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    box-shadow: var(--shadow-lg);
  }

  .toast.success {
    background: rgba(16, 185, 129, 0.9);
    color: white;
  }

  .toast.error {
    background: rgba(239, 68, 68, 0.9);
    color: white;
  }

  .toast.info {
    background: rgba(59, 130, 246, 0.9);
    color: white;
  }

  .icon {
    font-weight: bold;
  }
</style>