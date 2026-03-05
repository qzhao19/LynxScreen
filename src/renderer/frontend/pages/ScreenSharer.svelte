<script lang="ts">
  import { PageContainer, BackButton } from "../components/layout";
  import { Card, IconCircle, StatusIndicator } from "../components/ui";
  import { navigateTo, sessionState, startSessionTimer, showToast } from "../stores/app";

  let isStarting = false;

  async function handleStartSharing() {
    isStarting = true;
    
    try {
      // TODO: Call actual start session logic
      // const url = await connectionManager.startSharing();
      
      // Simulate generating URL
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockUrl = "https://bananas.app/session/abc123xyz";
      
      sessionState.update(s => ({
        ...s,
        isActive: true,
        sessionUrl: mockUrl,
        status: "waiting"
      }));
      
      startSessionTimer();
      showToast("Session created", "success");
      navigateTo("active-sharing");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      showToast("Failed to create session", "error");
    } finally {
      isStarting = false;
    }
  }
</script>

<PageContainer maxWidth="500px">
  <BackButton />
  
  <Card>
    <div class="share-content">
      <!-- Icon -->
      <IconCircle color="green" size="lg">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </IconCircle>

      <!-- Title -->
      <h1 class="title">Share Screen</h1>
      <p class="subtitle">Start sharing your screen with others</p>

      <!-- Status card -->
      <div class="status-card">
        <StatusIndicator status="ready" text="System Ready" />
        <p class="status-hint">Click the button below to start sharing your screen</p>
      </div>

      <!-- Start button -->
      <button 
        class="start-button"
        on:click={handleStartSharing}
        disabled={isStarting}
      >
        {#if isStarting}
          <span class="spinner"></span>
          Creating...
        {:else}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Start Sharing
        {/if}
      </button>
    </div>
  </Card>
</PageContainer>

<style>
  .share-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-lg);
    text-align: center;
  }

  .title {
    font-size: 1.75rem;
    font-weight: 600;
    margin-top: var(--spacing-sm);
  }

  .subtitle {
    color: var(--color-text-secondary);
    font-size: 0.95rem;
    margin-top: calc(-1 * var(--spacing-sm));
  }

  .status-card {
    width: 100%;
    padding: var(--spacing-lg);
    background: rgba(255, 255, 255, 0.03);
    border-radius: var(--radius-md);
    text-align: left;
  }

  .status-hint {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin-top: var(--spacing-sm);
  }

  .start-button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-xl);
    background: var(--color-accent-green);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    font-size: 1rem;
    font-weight: 600;
    transition: all var(--transition-fast);
  }

  .start-button:hover:not(:disabled) {
    background: var(--color-accent-green-hover);
  }

  .start-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>