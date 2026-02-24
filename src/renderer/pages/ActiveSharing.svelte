<script lang="ts">
  import { PageContainer } from "../components/layout";
  import { Card, StatusIndicator } from "../components/ui";
  import { 
    sessionState, 
    navigateTo, 
    stopSessionTimer, 
    formatDuration,
    showToast 
  } from "../stores/app";
  import { copyToClipboard } from "../../shared/utils/index";

  let watcherInput = "";
  let isConnecting = false;

  async function handleConnectWatcher() {
    if (!watcherInput.trim()) {
      showToast("Please enter the participant URL string", "error");
      return;
    }

    isConnecting = true;
    
    try {
      // TODO: Call actual connect watcher logic
      // await connectionManager.acceptAnswerUrl(watcherInput);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      sessionState.update(s => ({ ...s, status: "connected" }));
      showToast("Watcher connected", "success");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      showToast("Connection failed", "error");
    } finally {
      isConnecting = false;
    }
  }

  async function handleCopySessionUrl() {
    try {
      await copyToClipboard($sessionState.sessionUrl);
      showToast("Session URL copied to clipboard", "success");
    } catch (error) {
      console.error("Failed to copy:", error);
      showToast("Failed to copy to clipboard", "error");
    }
  }

  function handleCancel() {
    stopSessionTimer();
    sessionState.update(s => ({
      ...s,
      isActive: false,
      sessionUrl: "",
      watcherUrl: "",
      duration: 0,
      status: "idle"
    }));
    navigateTo("home");
    showToast("Session ended", "info");
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !isConnecting) {
      handleConnectWatcher();
    }
  }
</script>

<PageContainer maxWidth="600px">
  <Card>
    <div class="session-content">
      <!-- Header -->
      <header class="header">
        <div class="header-left">
          <h1 class="title">Sharing Active</h1>
          <StatusIndicator 
            status={$sessionState.status === "connected" ? "active" : "ready"} 
            text={$sessionState.status === "connected" ? "Connected" : "Session Started"} 
          />
        </div>
        <button class="cancel-button" on:click={handleCancel} aria-label="Cancel">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>

      <!-- Connection string section -->
      <section class="section">
        <div class="section-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          <span>Connection String</span>
        </div>
        
        <div class="url-container">
          <code class="url-text">{$sessionState.sessionUrl}</code>
          <button class="copy-button" on:click={handleCopySessionUrl}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy
          </button>
        </div>
        
        <p class="hint">Share this link with the watcher to join the session</p>
      </section>

      <!-- Watcher connection section -->
      <section class="section">
        <div class="section-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <span>Watcher Connection</span>
        </div>
        
        <input
          type="text"
          bind:value={watcherInput}
          on:keydown={handleKeydown}
          placeholder="Enter watcher connection string..."
          class="input"
          disabled={isConnecting}
        />
        
        <button 
          class="connect-button"
          on:click={handleConnectWatcher}
          disabled={isConnecting || !watcherInput.trim()}
        >
          {#if isConnecting}
            <span class="spinner"></span>
            Connecting...
          {:else}
            Connect Watcher
          {/if}
        </button>
      </section>

      <!-- Session Duration -->
      <footer class="footer">
        <span class="footer-label">Session Duration</span>
        <span class="footer-value">{formatDuration($sessionState.duration)}</span>
      </footer>
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
    background: var(--color-accent-red);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .cancel-button:hover {
    background: var(--color-accent-red-hover);
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

  .url-container {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background: var(--color-bg-input);
    border-radius: var(--radius-md);
  }

  .url-text {
    flex: 1;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .copy-button {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-accent-blue);
    border: none;
    border-radius: var(--radius-sm);
    color: white;
    font-size: 0.85rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .copy-button:hover {
    background: var(--color-accent-blue-hover);
  }

  .hint {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .input {
    width: 100%;
    padding: var(--spacing-md) var(--spacing-lg);
    background: var(--color-bg-input);
    border: 1px solid var(--color-accent-green);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: 0.95rem;
    transition: border-color var(--transition-fast);
  }

  .input:focus {
    outline: none;
    border-color: var(--color-accent-green);
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
  }

  .input::placeholder {
    color: var(--color-text-muted);
  }

  .input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .connect-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background: var(--color-bg-card-hover);
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .connect-button:hover:not(:disabled) {
    background: rgba(60, 70, 90, 0.9);
  }

  .connect-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md) var(--spacing-lg);
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-md);
  }

  .footer-label {
    font-size: 0.9rem;
    color: var(--color-text-secondary);
  }

  .footer-value {
    font-family: "SF Mono", "Monaco", "Inconsolata", monospace;
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
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