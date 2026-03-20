<script lang="ts">
  import { currentPage } from "./frontend/stores/app";
  import { Toast, HelpButton } from "./frontend/components/feedback";
  import { Home, ScreenWatcher, ScreenSharer, ActiveSharing, Settings } from "./frontend/pages";
</script>

<main>
  {#if $currentPage === "home"}
    <Home />
  {:else if $currentPage === "watch"}
    <ScreenWatcher />
  {:else if $currentPage === "share"}
    <ScreenSharer />
  {:else if $currentPage === "active-sharing"}
    <ActiveSharing />
  {:else if $currentPage === "settings"}
    <Settings />
  {/if}

  <!-- Global components -->
  <Toast />
  <HelpButton />
</main>

<style>
  main {
    min-height: 100vh;
  }
</style>