<script lang="ts">
  import { PageContainer, BackButton } from "../components/layout";
  import { Card, IconCircle, StatusIndicator } from "../components/ui";
  import { ConnectionStatus } from "../components/connection";
  import { 
    navigateTo, 
    showToast, 
    appSettings 
  } from "../stores/app";
  import { 
    startSharing, 
    connectionPhase, 
    isLoading, 
    errorMessage 
  } from "../stores/connection";
  import { ConnectionPhase } from "../../../shared/types/index";

  let isStarting = false;

  async function handleStartSharing() {
    const username = $appSettings.username || "Anonymous";
    
    if (!username.trim()) {
      showToast("Please set a username in Settings first", "error");
      return;
    }

    isStarting = true;
    
    try {
      const url = await startSharing(username);
      
      if (url) {
        showToast("Session created, URL copied to clipboard", "success");
        navigateTo("active-sharing");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create session";
      showToast(message, "error");
    } finally {
      isStarting = false;
    }
  }

  $: buttonDisabled = isStarting || $isLoading;
  $: showError = $errorMessage && $connectionPhase === ConnectionPhase.ERROR;
</script>

<PageContainer maxWidth="500px">
  <BackButton />
  
  <Card>
    <div class="share-content">
      <IconCircle color="green" size="lg">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </IconCircle>

      <h1 class="title">Share Screen</h1>
      <p class="subtitle">Start sharing your screen with others</p>

      <div class="status-card">
        {#if showError}
          <StatusIndicator status="warning" text="Error" />
          <p class="status-hint error-text">{$errorMessage}</p>
        {:else}
          <ConnectionStatus compact />
          <p class="status-hint">Click the button below to start sharing your screen</p>
        {/if}
      </div>

      <div class="user-info">
        <span class="user-label">Sharing as:</span>
        <span class="user-name">{$appSettings.username || "Anonymous"}</span>
      </div>

      <button 
        class="start-button"
        on:click={handleStartSharing}
        disabled={buttonDisabled}
      >
        {#if buttonDisabled}
          <span class="spinner"></span>
          Creating session...
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

  .error-text {
    color: var(--color-accent-red);
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
  }

  .user-label {
    color: var(--color-text-muted);
  }

  .user-name {
    color: var(--color-text-primary);
    font-weight: 500;
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