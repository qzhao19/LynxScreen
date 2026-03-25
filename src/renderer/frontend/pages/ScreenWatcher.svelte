<script lang="ts">
  import { PageContainer } from "../components/layout";
  import { Card, IconCircle } from "../components/ui";
  import { 
    ConnectionStatus,
    ConnectionUrl,
    MediaControls,
    RemoteCursorDisplay,
    RemoteVideoInteract,
    SessionTimer
  } from "../components/connection";
  import { navigateTo, showToast, appSettings } from "../stores/app";
  import { 
    joinSession,
    disconnect,
    resetConnection,
    connectionPhase,
    generatedUrl,
    isConnected,
    isLoading,
    errorMessage,
    cursorChannelsReady
  } from "../stores/connection";
  import { ConnectionPhase } from "../../../shared/types/index";

  let videoElement: HTMLVideoElement;
  let videoContainerWidth = 0;
  let videoContainerHeight = 0;
  let hasJoined = false;
  let sessionUrl = "";

  async function handleJoinSession() {
    const username = $appSettings.username || "Anonymous";
    
    if (!username.trim()) {
      showToast("Please set a username in Settings first", "error");
      return;
    }

    if (!sessionUrl.trim()) {
      showToast("Please paste the sharer's session URL", "error");
      return;
    }

    if (!videoElement) {
      showToast("Video element not ready, please try again", "error");
      return;
    }

    try {
      const answerUrl = await joinSession(username.trim(), sessionUrl.trim(), videoElement);
      
      if (answerUrl) {
        hasJoined = true;
        showToast("Answer URL generated. Share it with the sharer.", "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to join session";
      showToast(message, "error");
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect();
      hasJoined = false;
      showToast("Disconnected", "info");
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  }

  async function handleRetry() {
    await resetConnection();
    hasJoined = false;
    sessionUrl = "";
  }

  async function handleBack() {
    if (hasJoined || $isConnected) {
      await resetConnection();
      hasJoined = false;
    }
    navigateTo("home");
  }

  function handleVideoReady(data: { videoElement: HTMLVideoElement }) {
    videoElement = data.videoElement;
  }

  function handleContainerResize(node: HTMLDivElement) {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        videoContainerWidth = entry.contentRect.width;
        videoContainerHeight = entry.contentRect.height;
      }
    });
    observer.observe(node);
    return {
      destroy() {
        observer.disconnect();
      }
    };
  }

  $: phase = $connectionPhase;
  $: showJoinForm = !hasJoined && (
    phase === ConnectionPhase.IDLE || 
    phase === ConnectionPhase.DISCONNECTED
  );
  $: showAnswerUrl = hasJoined && $generatedUrl && !$isConnected;
  $: showVideo = hasJoined;
  $: showError = $errorMessage && phase === ConnectionPhase.ERROR;
</script>

<PageContainer maxWidth={$isConnected ? "900px" : "500px"}>
  <button class="back-button" on:click={handleBack} aria-label="Back">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
    Back
  </button>

  {#if showJoinForm}
    <Card>
      <div class="watch-content">
        <IconCircle color="blue" size="lg">
          🔗
        </IconCircle>

        <h1 class="title">Join a Session</h1>
        <p class="subtitle">
          Enter the sharer's session URL to join the screen share
        </p>

        <div class="url-input-group">
          <label class="url-label" for="session-url">Session URL</label>
          <input
            id="session-url"
            class="url-input"
            type="text"
            bind:value={sessionUrl}
            placeholder="Paste session URL here..."
            disabled={$isLoading}
            on:keydown={(e) => e.key === "Enter" && handleJoinSession()}
          />
        </div>

        <button 
          class="connect-button"
          on:click={handleJoinSession}
          disabled={$isLoading || !sessionUrl.trim()}
        >
          {#if $isLoading}
            <span class="spinner"></span>
            Connecting...
          {:else}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Connect
          {/if}
        </button>
      </div>
    </Card>
  {/if}

  {#if showError}
    <Card>
      <div class="error-banner">
        <span class="error-icon">❌</span>
        <span class="error-text">{$errorMessage}</span>
        <button class="retry-button" on:click={handleRetry}>
          Try Again
        </button>
      </div>
    </Card>
  {/if}

  {#if showAnswerUrl}
    <Card>
      <div class="answer-section">
        <ConnectionStatus />

        <ConnectionUrl 
          url={$generatedUrl}
          label="Your Answer URL"
          hint="This URL is ready to share. Send it to the sharer so they can accept your connection."
        />

        <div class="waiting-hint">
          <span class="spinner"></span>
          <p>Waiting for sharer to accept your connection...</p>
        </div>
      </div>
    </Card>
  {/if}

  <div class="video-section-wrapper" class:video-hidden={!showVideo} aria-hidden={!showVideo}>
    <Card>
      <div class="video-section" use:handleContainerResize>
        <RemoteVideoInteract onReady={handleVideoReady}>
          <svelte:fragment slot="controls">
            {#if $cursorChannelsReady}
              <RemoteCursorDisplay 
                containerWidth={videoContainerWidth}
                containerHeight={videoContainerHeight}
              />
            {/if}
          </svelte:fragment>
        </RemoteVideoInteract>
      </div>
    </Card>

    {#if showVideo && $isConnected}
      <Card>
        <div class="controls-bar">
          <div class="controls-left">
            <ConnectionStatus compact />
          </div>

          <MediaControls 
            compact 
            showDisplay={false} 
            showDisconnect={false} 
          />

          <div class="controls-right">
            <SessionTimer />
            <button 
              class="disconnect-button"
              on:click={handleDisconnect}
              aria-label="Disconnect"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      </Card>
    {/if}
  </div>
</PageContainer>

<style>
  .video-section-wrapper.video-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    pointer-events: none;
  }

  .video-section-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .back-button {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-lg);
    padding: var(--spacing-sm) var(--spacing-md);
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    font-size: 0.95rem;
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .back-button:hover {
    color: var(--color-text-primary);
  }

  .watch-content {
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
    line-height: 1.5;
  }

  .url-input-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-xs, 6px);
    width: 100%;
  }

  .url-label {
    font-size: 0.9rem;
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .url-input {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: 0.95rem;
    transition: border-color var(--transition-fast);
    box-sizing: border-box;
  }

  .url-input::placeholder {
    color: var(--color-text-muted);
  }

  .url-input:focus {
    outline: none;
    border-color: var(--color-accent-blue);
  }

  .url-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .connect-button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-xl);
    background: var(--color-accent-blue);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    font-size: 1rem;
    font-weight: 500;
    transition: all var(--transition-fast);
  }

  .connect-button:hover:not(:disabled) {
    background: var(--color-accent-blue-hover);
  }

  .connect-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
  }

  .error-icon {
    font-size: 1rem;
  }

  .error-text {
    flex: 1;
    font-size: 0.9rem;
    color: var(--color-accent-red);
  }

  .retry-button {
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-bg-card-hover);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .retry-button:hover {
    background: rgba(60, 70, 90, 0.9);
  }

  .answer-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .waiting-hint {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .video-section {
    position: relative;
    width: calc(100% + 2 * var(--spacing-lg));
    margin: calc(-1 * var(--spacing-lg));
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .controls-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  .controls-left {
    flex: 1;
  }

  .controls-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .disconnect-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: var(--color-accent-red);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .disconnect-button:hover {
    background: var(--color-accent-red-hover);
  }

  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>