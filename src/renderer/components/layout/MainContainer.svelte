<script lang="ts">
  export let maxWidth: string = "800px";
</script>

<div class="container" style="max-width: {maxWidth}">
  <div class="content">
    <slot />
  </div>
</div>

<style>
  .container {
    margin: 0 auto;
    padding: var(--spacing-xl);
    min-height: 100vh;
  }

  .content {
    background: var(--color-bg-card);
    border-radius: var(--radius-xl);
    padding: var(--spacing-xl);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }
</style>