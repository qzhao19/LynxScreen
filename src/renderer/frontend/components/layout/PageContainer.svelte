<script lang="ts">
  export let maxWidth: string = "800px";
  export let verticalCenter: boolean = true;
</script>

<div class="page-container" class:vertical-center={verticalCenter}>
  <div class="content" style="max-width: {maxWidth}">
    <slot />
  </div>
</div>

<style>
  .page-container {
    min-height: 100vh;
    padding: var(--spacing-xl);
  }

  .vertical-center {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .content {
    width: 100%;
  }
</style>