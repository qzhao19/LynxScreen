<script lang="ts">
  import { PageContainer } from "../components/layout";
  import { Card, IconCircle } from "../components/ui";
  import { ConnectionStatus } from "../components/connection";
  import { navigateTo } from "../stores/app";
  import { isConnected, connectionPhase, isSharer } from "../stores/connection";
  import { ConnectionPhase } from "../../shared/types/index";

  const options = [
    {
      id: "watch",
      icon: "🖥️",
      iconColor: "blue" as const,
      title: "Watch Screen",
      description: "Connect to watch shared screen",
      page: "watch" as const
    },
    {
      id: "share",
      icon: "👥",
      iconColor: "green" as const,
      title: "Share Screen",
      description: "Start sharing screen",
      page: "share" as const
    }
  ];

  function handleNavigate(page: "watch" | "share") {
    // If already connected, redirect to active session
    if ($isConnected) {
      navigateTo($isSharer ? "active-sharing" : "watch");
      return;
    }
    navigateTo(page);
  }

  $: hasActiveSession = $connectionPhase !== ConnectionPhase.IDLE && 
                          $connectionPhase !== ConnectionPhase.ERROR &&
                          $connectionPhase !== ConnectionPhase.DISCONNECTED;
</script>

<PageContainer maxWidth="700px">
  <div class="home-content">
    <button class="settings-button" on:click={() => navigateTo("settings")} aria-label="Settings">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>

    <header class="header">
      <h1 class="title">LynxScreen</h1>
      <p class="subtitle">Peer-to-Peer screen sharing</p>
    </header>

    <!-- Active session banner -->
    {#if hasActiveSession}
      <button 
        class="active-session-banner" 
        on:click={() => navigateTo($isSharer ? "active-sharing" : "watch")}
      >
        <ConnectionStatus compact />
        <span class="banner-text">Return to active session →</span>
      </button>
    {/if}

    <div class="options-grid">
      {#each options as option(option.id)}
        <Card clickable on:click={() => handleNavigate(option.page)}>
          <div class="option-content">
            <IconCircle color={option.iconColor}>
              {option.icon}
            </IconCircle>
            <h2 class="option-title">{option.title}</h2>
            <p class="option-description">{option.description}</p>
          </div>
        </Card>
      {/each}
    </div>
  </div>
</PageContainer>

<style>
  .home-content {
    text-align: center;
    position: relative;
  }

  .settings-button {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .settings-button:hover {
    background: var(--color-bg-card-hover);
    color: var(--color-text-primary);
  }

  .header {
    margin-bottom: var(--spacing-2xl);
  }

  .title {
    font-size: 3rem;
    font-weight: 700;
    margin-bottom: var(--spacing-sm);
    letter-spacing: -0.02em;
  }

  .subtitle {
    font-size: 1.1rem;
    color: var(--color-text-secondary);
  }

  .active-session-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--spacing-md) var(--spacing-lg);
    margin-bottom: var(--spacing-lg);
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .active-session-banner:hover {
    background: rgba(16, 185, 129, 0.15);
    border-color: rgba(16, 185, 129, 0.5);
  }

  .banner-text {
    font-size: 0.9rem;
    color: var(--color-accent-green);
    font-weight: 500;
  }

  .options-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-lg);
  }

  .option-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-lg) 0;
  }

  .option-title {
    font-size: 1.25rem;
    font-weight: 600;
  }

  .option-description {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }

  @media (max-width: 500px) {
    .options-grid {
      grid-template-columns: 1fr;
    }
  }
</style>