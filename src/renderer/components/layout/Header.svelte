<script lang="ts">
  export let title: string = "LynxScreen";
  export let subtitle: string = "P2P Screen Sharing";
</script>

<header class="header">
  <h1 class="title">{title}</h1>
  <p class="subtitle">{subtitle}</p>
</header>

<style>
  .header {
    text-align: center;
    margin-bottom: var(--spacing-xl);
  }

  .title {
    font-size: 2.5rem;
    font-weight: 700;
    margin-bottom: var(--spacing-sm);
    background: linear-gradient(135deg, var(--color-accent-blue), var(--color-accent-purple));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    color: var(--color-text-secondary);
    font-size: 1.1rem;
  }
</style>

