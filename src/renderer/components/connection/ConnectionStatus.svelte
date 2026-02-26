<script lang="ts">
  import { 
    connectionPhase, 
    iceConnectionState,
    isConnected, 
    isConnecting,
    currentRole,
    errorMessage,
    phaseDisplayConfig
  } from "../../stores/index";
  import { PeerRole } from "../../../shared/types/index";
  import { StatusIndicator } from "../ui";

  // Props
  export let showDetails = false;
  export let compact = false;

  // ICE state display
  const iceStateText: Record<RTCIceConnectionState, string> = {
    "new": "New",
    "checking": "Checking...",
    "connected": "Connected",
    "completed": "Completed",
    "disconnected": "Disconnected",
    "failed": "Failed",
    "closed": "Closed"
  };

  // Role display
  const roleText: Record<PeerRole, string> = {
    [PeerRole.SCREEN_SHARER]: "Sharer",
    [PeerRole.SCREEN_WATCHER]: "Watcher"
  };

  // Reactive computed values
  $: config = phaseDisplayConfig[$connectionPhase];
  $: displayText = config?.text ?? "Unknown";
  $: statusType = config?.status ?? "ready";
  $: icon = config?.icon ?? "⚪";
</script>

<div class="connection-status" class:compact class:connected={$isConnected}>
  {#if compact}
    <StatusIndicator status={statusType} text={displayText} />
  {:else}
    <div class="status-main">
      <span class="status-icon">{icon}</span>
      <StatusIndicator status={statusType} text={displayText} />
    </div>

    {#if showDetails}
      <div class="status-details">
        {#if $currentRole}
          <div class="detail-row">
            <span class="detail-label">Role:</span>
            <span class="detail-value">{roleText[$currentRole]}</span>
          </div>
        {/if}

        {#if $iceConnectionState}
          <div class="detail-row">
            <span class="detail-label">ICE:</span>
            <span class="detail-value" class:ice-connected={$iceConnectionState === "connected"}>
              {iceStateText[$iceConnectionState] ?? "unknown"}
            </span>
          </div>
        {/if}

        {#if $errorMessage}
          <div class="detail-row error">
            <span class="detail-label">Error:</span>
            <span class="detail-value">{$errorMessage}</span>
          </div>
        {/if}
      </div>
    {/if}
  {/if}

  {#if $isConnecting}
    <div class="connecting-indicator">
      <span class="spinner"></span>
    </div>
  {/if}
</div>

<style>
  .connection-status {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .connection-status.compact {
    flex-direction: row;
    align-items: center;
  }

  .connection-status.connected {
    --status-color: var(--color-accent-green);
  }

  .status-main {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .status-icon {
    font-size: 1.2rem;
  }

  .status-details {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm) var(--spacing-md);
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  .detail-label {
    color: var(--color-text-muted);
  }

  .detail-value {
    color: var(--color-text-secondary);
    font-family: "SF Mono", monospace;
  }

  .detail-value.ice-connected {
    color: var(--color-accent-green);
  }

  .detail-row.error .detail-value {
    color: var(--color-accent-red);
  }

  .connecting-indicator {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--color-accent-blue);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>