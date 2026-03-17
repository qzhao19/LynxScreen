<script lang="ts">
  import { PageContainer } from "../components/layout";
  import { Card } from "../components/ui";
  import { 
    ConnectionStatus, 
    ConnectionUrl, 
    MediaControls, 
    SessionTimer 
  } from "../components/connection";
  import { 
    navigateTo, 
    showToast 
  } from "../stores/app";
  import {
    connectionPhase,
    generatedUrl,
    isConnected,
    isLoading,
    errorMessage,
    acceptAnswer,
    disconnect,
    resetConnection
  } from "../stores/connection";
  import { ConnectionPhase } from "../../../shared/types/index";

  let isAccepting = false;

  async function handleAcceptAnswer() {
    isAccepting = true;
    
    try {
      const success = await acceptAnswer();
      if (success) {
        showToast("Answer accepted, connecting...", "success");
      } else {
        showToast("Failed to accept answer. Make sure the watcher's URL is in your clipboard.", "error");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to accept answer";
      showToast(message, "error");
    } finally {
      isAccepting = false;
    }
  }

  async function handleCancel() {
    try {
      await resetConnection();
      showToast("Session ended", "info");
      navigateTo("home");
    } catch (error) {
      console.error("Cancel error:", error);
      navigateTo("home");
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect();
      showToast("Disconnected", "info");
      navigateTo("home");
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  }

  $: phase = $connectionPhase;
  $: showAcceptSection = phase === ConnectionPhase.OFFER_CREATED;
  $: showMediaControls = $isConnected;
  $: showError = $errorMessage && phase === ConnectionPhase.ERROR;
</script>

<PageContainer maxWidth="600px">
  <Card>
    <div class="session-content">
      <!-- Header -->
      <header class="header">
        <div class="header-left">
          <h1 class="title">
            {#if $isConnected}
              Sharing Active
            {:else}
              Setting Up Session
            {/if}
          </h1>
          <ConnectionStatus compact />
        </div>
        <button class="cancel-button" on:click={handleCancel} aria-label="Cancel">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>

      <!-- Error display -->
      {#if showError}
        <div class="error-banner">
          <span class="error-icon">❌</span>
          <span class="error-text">{$errorMessage}</span>
        </div>
      {/if}

      <!-- Offer URL section -->
      {#if $generatedUrl}
        <section class="section">
          <ConnectionUrl 
            url={$generatedUrl}
            label="Your Session URL"
            hint="Share this URL with the watcher. It has been copied to your clipboard."
          />
        </section>
      {/if}

      <!-- Accept answer section -->
      {#if showAcceptSection}
        <section class="section">
          <div class="section-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>Accept Watcher</span>
          </div>
          
          <p class="section-hint">
            After the watcher generates their answer URL and copies it to their clipboard, 
            ask them to send it to you. Copy the answer URL to your clipboard, then click the button below.
          </p>

          <button 
            class="accept-button"
            on:click={handleAcceptAnswer}
            disabled={isAccepting || $isLoading}
          >
            {#if isAccepting || $isLoading}
              <span class="spinner"></span>
              Accepting...
            {:else}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Accept Answer from Clipboard
            {/if}
          </button>
        </section>
      {/if}

      <!-- Media controls (when connected) -->
      {#if showMediaControls}
        <section class="section">
          <div class="section-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <span>Media Controls</span>
          </div>
          <MediaControls 
            showDisconnect={false}
          />
        </section>

        <section class="section">
          <SessionTimer />
        </section>

        <button 
          class="disconnect-button"
          on:click={handleDisconnect}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          End Session
        </button>
      {/if}
    </div>
  </Card>
</PageContainer>

<style>
  .session-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .title {
    font-size: 1.5rem;
    font-weight: 600;
  }

  .cancel-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: var(--color-bg-card-hover);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .cancel-button:hover {
    background: var(--color-accent-red);
    border-color: var(--color-accent-red);
    color: white;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-lg);
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-md);
  }

  .error-icon {
    font-size: 1rem;
  }

  .error-text {
    font-size: 0.9rem;
    color: var(--color-accent-red);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding: var(--spacing-lg);
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-lg);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .section-hint {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    line-height: 1.6;
  }

  .accept-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background: var(--color-accent-blue);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .accept-button:hover:not(:disabled) {
    background: var(--color-accent-blue-hover);
  }

  .accept-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .disconnect-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-md);
    background: var(--color-accent-red);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .disconnect-button:hover {
    background: var(--color-accent-red-hover);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>