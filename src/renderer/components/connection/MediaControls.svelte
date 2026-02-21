<script lang="ts">
  import {
    isMicrophoneEnabled,
    isDisplayEnabled,
    hasAudioInput,
    isConnected,
    isSharer,
    toggleMicrophone,
    toggleDisplayStream,
    showToast
  } from "../../stores/index";

  // Props
  export let showMicrophone = true;
  export let showDisplay = true;
  export let showDisconnect = true;
  export let compact = false;
  export let vertical = false;

  // Callback props
  export let onToggleMicrophone: ((data: { enabled: boolean }) => void) | undefined = undefined;
  export let onToggleDisplay: ((data: { enabled: boolean }) => void) | undefined = undefined;
  export let onDisconnect: (() => void) | undefined = undefined;

  function handleToggleMicrophone() {
    const result = toggleMicrophone();
    showToast(result ? "Microphone on" : "Microphone off", "info");
    onToggleMicrophone?.({ enabled: result });
  }

  function handleToggleDisplay() {
    const result = toggleDisplayStream();
    showToast(result ? "Display sharing on" : "Display sharing off", "info");
    onToggleDisplay?.({ enabled: result });
  }

  function handleDisconnect() {
    onDisconnect?.();
  }
</script>

<div class="media-controls" class:compact class:vertical>
  {#if showMicrophone && $hasAudioInput}
    <button
      class="control-button"
      class:active={$isMicrophoneEnabled}
      on:click={handleToggleMicrophone}
      disabled={!$isConnected}
      aria-label={$isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
      title={$isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
    >
      {#if $isMicrophoneEnabled}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      {:else}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      {/if}
      {#if !compact}
        <span>{$isMicrophoneEnabled ? "Mute" : "Unmute"}</span>
      {/if}
    </button>
  {/if}

  {#if showDisplay && $isSharer}
    <button
      class="control-button"
      class:active={$isDisplayEnabled}
      on:click={handleToggleDisplay}
      disabled={!$isConnected}
      aria-label={$isDisplayEnabled ? "Stop sharing" : "Start sharing"}
      title={$isDisplayEnabled ? "Stop sharing screen" : "Start sharing screen"}
    >
      {#if $isDisplayEnabled}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      {:else}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M21 21H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      {/if}
      {#if !compact}
        <span>{$isDisplayEnabled ? "Stop" : "Share"}</span>
      {/if}
    </button>
  {/if}

  {#if showDisconnect}
    <button
      class="control-button disconnect"
      on:click={handleDisconnect}
      aria-label="Disconnect"
      title="Disconnect session"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
      {#if !compact}
        <span>Disconnect</span>
      {/if}
    </button>
  {/if}
</div>

<style>
  .media-controls {
    display: flex;
    gap: var(--spacing-sm);
  }

  .media-controls.vertical {
    flex-direction: column;
  }

  .media-controls.compact .control-button {
    width: 40px;
    height: 40px;
    padding: 0;
  }

  .control-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-bg-card-hover);
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .control-button:hover:not(:disabled) {
    background: rgba(60, 70, 90, 0.9);
    color: var(--color-text-primary);
  }

  .control-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .control-button.active {
    background: var(--color-accent-green);
    color: white;
  }

  .control-button.disconnect {
    background: var(--color-accent-red);
    color: white;
  }

  .control-button.disconnect:hover:not(:disabled) {
    background: var(--color-accent-red-hover);
  }
</style>