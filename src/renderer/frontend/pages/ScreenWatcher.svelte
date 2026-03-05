<script lang="ts">
  import { PageContainer, BackButton } from "../components/layout";
  import { Card, IconCircle } from "../components/ui";
  import { showToast } from "../stores/app";

  let sessionUrl = "";
  let isConnecting = false;

  async function handleConnect() {
    if (!sessionUrl.trim()) {
      showToast("Please enter session URL", "error");
      return;
    }

    isConnecting = true;
    
    try {
      // TODO: Call actual connection logic
      // await connectionManager.joinSession(sessionUrl);
      showToast("Connecting...", "info");
      
      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      showToast("Connected successfully!", "success");
      
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      showToast("Connection failed, please check URL", "error");
    } finally {
      isConnecting = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !isConnecting) {
      handleConnect();
    }
  }
</script>

<PageContainer maxWidth="500px">
  <BackButton />
  
  <Card>
    <div class="watch-content">
      <!-- Icon -->
      <IconCircle color="blue" size="lg">
        🔗
      </IconCircle>

      <!-- Title -->
      <h1 class="title">Watch Screen</h1>
      <p class="subtitle">Enter session URL to watch shared screen</p>

      <!-- Input box -->
      <div class="input-group">
        <label for="session-url" class="label">Session URL</label>
        <input
          id="session-url"
          type="text"
          bind:value={sessionUrl}
          on:keydown={handleKeydown}
          placeholder="Paste session URL..."
          disabled={isConnecting}
          class="input"
        />
      </div>

      <!-- Connect button -->
      <button 
        class="connect-button"
        on:click={handleConnect}
        disabled={isConnecting || !sessionUrl.trim()}
      >
        {#if isConnecting}
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
</PageContainer>

<style>
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
  }

  .input-group {
    width: 100%;
    text-align: left;
  }

  .label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-primary);
    margin-bottom: var(--spacing-sm);
  }

  .input {
    width: 100%;
    padding: var(--spacing-md) var(--spacing-lg);
    background: var(--color-bg-input);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: 0.95rem;
    transition: border-color var(--transition-fast);
  }

  .input:focus {
    outline: none;
    border-color: var(--color-accent-blue);
  }

  .input::placeholder {
    color: var(--color-text-muted);
  }

  .input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .connect-button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-xl);
    background: var(--color-bg-card-hover);
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: 1rem;
    font-weight: 500;
    transition: all var(--transition-fast);
  }

  .connect-button:hover:not(:disabled) {
    background: rgba(60, 70, 90, 0.9);
  }

  .connect-button:disabled {
    opacity: 0.5;
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