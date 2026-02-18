<script lang="ts">
  import { onMount, tick } from "svelte";
  import { PageContainer, BackButton } from "../components/layout";
  import { Card } from "../components/ui";
  import { appSettings, saveSettings, resetSettings, showToast } from "../stores/app";
  import type { IceServerConfig, AppSettings } from "../../shared/types/index";
  import { DEFAULT_APP_SETTINGS } from "../../shared/constants/index";

  // Local copy of settings for editing - initialize with default values to prevent undefined errors
  let localSettings: AppSettings = { ...DEFAULT_APP_SETTINGS };
  let iceServers: IceServerConfig[] = DEFAULT_APP_SETTINGS.iceServers.map(s => ({ ...s }));

  // Initialize with actual store values when component mounts
  onMount(() => {
    localSettings = { ...$appSettings };
    iceServers = $appSettings.iceServers.map(s => ({ ...s }));
  });

  // Re-sync after reset - use tick to ensure store has updated
  async function handleReset() {
    resetSettings();
    // Wait for store to update before re-initializing local state
    await tick();
    localSettings = { ...$appSettings };
    iceServers = $appSettings.iceServers.map(s => ({ ...s }));
  }

  function handleSave() {
    // Validate ICE servers
    const validIceServers = iceServers.filter(server => server.urls.trim() !== "");
    
    if (validIceServers.length === 0) {
      showToast("At least one ICE server is required", "error");
      return;
    }

    if (!localSettings.username.trim()) {
      showToast("Username is required", "error");
      return;
    }

    saveSettings({
      ...localSettings,
      iceServers: validIceServers
    });
  }

  // function handleReset() {
  //   resetSettings();
  // }

  function addIceServer() {
    iceServers = [...iceServers, { urls: "", authUsername: "", credential: "" }];
  }

  function removeIceServer(index: number) {
    if (iceServers.length <= 1) {
      showToast("At least one ICE server is required", "error");
      return;
    }
    iceServers = iceServers.filter((_, i) => i !== index);
  }

  function updateIceServer(index: number, field: keyof IceServerConfig, value: string) {
    iceServers = iceServers.map((server, i) => 
      i === index ? { ...server, [field]: value } : server
    );
  }
</script>

<PageContainer maxWidth="600px" verticalCenter={false}>
  <BackButton />
  
  <div class="settings-container">
    <header class="page-header">
      <h1 class="page-title">Settings</h1>
      <p class="page-subtitle">Configure your LynxScreen preferences</p>
    </header>

    <!-- User Settings Section -->
    <Card>
      <div class="section">
        <div class="section-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <h2 class="section-title">User Settings</h2>
        </div>

        <div class="form-group">
          <label for="username" class="label">Display Name</label>
          <input
            id="username"
            type="text"
            bind:value={localSettings.username}
            placeholder="Enter your display name"
            class="input"
          />
          <p class="hint">This name will be shown to other watchers</p>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={localSettings.isMicrophoneEnabledOnConnect}
              class="checkbox"
            />
            <span class="checkbox-text">Enable microphone on connect</span>
          </label>
          <p class="hint">Automatically enable your microphone when joining a session</p>
        </div>
      </div>
    </Card>

    <!-- ICE Server Settings Section -->
    <Card>
      <div class="section">
        <div class="section-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
            <line x1="6" y1="6" x2="6.01" y2="6"/>
            <line x1="6" y1="18" x2="6.01" y2="18"/>
          </svg>
          <h2 class="section-title">ICE Server Configuration</h2>
        </div>
        
        <p class="section-description">
          Configure STUN/TURN servers for establishing peer-to-peer connections.
          These servers help establish connections when peers are behind NAT or firewalls.
        </p>

        <div class="ice-servers-list">
          {#each iceServers as server, index}
            <div class="ice-server-item">
              <div class="ice-server-header">
                <span class="ice-server-number">Server {index + 1}</span>
                <button 
                  class="remove-button"
                  on:click={() => removeIceServer(index)}
                  aria-label="Remove server"
                  disabled={iceServers.length <= 1}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

               <div class="form-group">
                <label for="server-url-{index}" class="label">Server URL</label>
                <input
                  id="server-url-{index}"
                  type="text"
                  value={server.urls}
                  on:input={(e) => updateIceServer(index, 'urls', e.currentTarget.value)}
                  placeholder="stun:stun.example.com:19302"
                  class="input"
                />
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="server-username-{index}" class="label">Auth Username (optional)</label>
                  <input
                    id="server-username-{index}"
                    type="text"
                    value={server.authUsername || ''}
                    on:input={(e) => updateIceServer(index, 'authUsername', e.currentTarget.value)}
                    placeholder="Username"
                    class="input"
                  />
                </div>

                <div class="form-group">
                  <label for="server-credential-{index}" class="label">Credential (optional)</label>
                  <input
                    id="server-credential-{index}"
                    type="password"
                    value={server.credential || ''}
                    on:input={(e) => updateIceServer(index, 'credential', e.currentTarget.value)}
                    placeholder="Password"
                    class="input"
                  />
                </div>
              </div>
            </div>
          {/each}
        </div>

        <button class="add-server-button" on:click={addIceServer}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add ICE Server
        </button>
      </div>
    </Card>

    <!-- Action Buttons -->
    <div class="actions">
      <button class="reset-button" on:click={handleReset}>
        Reset to Default
      </button>
      <button class="save-button" on:click={handleSave}>
        Save Settings
      </button>
    </div>
  </div>
</PageContainer>

<style>
  .settings-container {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    padding-bottom: var(--spacing-2xl);
  }

  .page-header {
    margin-bottom: var(--spacing-md);
  }

  .page-title {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: var(--spacing-xs);
  }

  .page-subtitle {
    color: var(--color-text-secondary);
    font-size: 1rem;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    color: var(--color-text-primary);
  }

  .section-title {
    font-size: 1.25rem;
    font-weight: 600;
  }

  .section-description {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    line-height: 1.6;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-md);
  }

  .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .input {
    width: 100%;
    padding: var(--spacing-md);
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

  .hint {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
  }

  .checkbox {
    width: 18px;
    height: 18px;
    accent-color: var(--color-accent-green);
    cursor: pointer;
  }

  .checkbox-text {
    font-size: 0.95rem;
    color: var(--color-text-primary);
  }

  .ice-servers-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .ice-server-item {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding: var(--spacing-lg);
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-lg);
  }

  .ice-server-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .ice-server-number {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-accent-blue);
  }

  .remove-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .remove-button:hover:not(:disabled) {
    background: var(--color-accent-red);
    border-color: var(--color-accent-red);
    color: white;
  }

  .remove-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .add-server-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-md);
    background: transparent;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    font-size: 0.95rem;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .add-server-button:hover {
    border-color: var(--color-accent-blue);
    color: var(--color-accent-blue);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-md);
    margin-top: var(--spacing-md);
  }

  .reset-button {
    padding: var(--spacing-md) var(--spacing-xl);
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .reset-button:hover {
    border-color: var(--color-accent-red);
    color: var(--color-accent-red);
  }

  .save-button {
    padding: var(--spacing-md) var(--spacing-xl);
    background: var(--color-accent-green);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .save-button:hover {
    background: var(--color-accent-green-hover);
  }

  @media (max-width: 500px) {
    .form-row {
      grid-template-columns: 1fr;
    }

    .actions {
      flex-direction: column;
    }

    .reset-button,
    .save-button {
      width: 100%;
    }
  }
</style>