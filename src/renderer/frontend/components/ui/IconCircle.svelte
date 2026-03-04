<script lang="ts">
  export let color: "green" | "blue" = "green";
  export let size: "sm" | "md" | "lg" = "md";
</script>

<div class="icon-circle {color} {size}">
  <slot />
</div>

<style>
  .icon-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full);
  }

  /* Size */
  .sm {
    width: 40px;
    height: 40px;
    font-size: 1rem;
  }

  .md {
    width: 56px;
    height: 56px;
    font-size: 1.5rem;
  }

  .lg {
    width: 72px;
    height: 72px;
    font-size: 2rem;
  }

  /* Color */
  .green {
    background: rgba(16, 185, 129, 0.15);
    color: var(--color-accent-green);
  }

  .blue {
    background: rgba(59, 130, 246, 0.15);
    color: var(--color-accent-blue);
  }
</style>