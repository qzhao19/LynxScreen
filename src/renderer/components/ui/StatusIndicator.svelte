<script lang="ts">
  export let status: "idle" | "ready" | "active" | "warning" | "error" = "idle";
  export let text: string = "";
</script>

<div class="status-indicator {status}">
  <span class="dot"></span>
  <span class="text">{text}</span>
</div>

<style>
  .status-indicator {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: 0.875rem;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .idle .dot {
    background: var(--color-text-muted);
  }

  .idle .text {
    color: var(--color-text-muted);
  }

  .ready .dot {
    background: var(--color-accent-green);
    box-shadow: 0 0 8px var(--color-accent-green);
  }

  .ready .text {
    color: var(--color-accent-green);
  }

  .active .dot {
    background: var(--color-accent-green);
    box-shadow: 0 0 8px var(--color-accent-green);
    animation: pulse 2s infinite;
  }

  .active .text {
    color: var(--color-accent-green);
  }

  .error .dot {
    background: var(--color-accent-red);
    box-shadow: 0 0 8px var(--color-accent-red);
  }

  .error .text {
    color: var(--color-accent-red);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>