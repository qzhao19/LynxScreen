import { writable, derived, get } from "svelte/store";
import { ConnectionManager } from "../../core/session/connection-manager";
import {
  ConnectionPhase,
  PeerRole,
  RemoteCursorState
} from "../../../shared/types/index";
import { WebRTCServiceConfig } from "../../shared/types/index";
import { showToast, appSettings } from "./app";

// ============== Connection Manager Singleton ==============

let connectionManagerInstance: ConnectionManager | null = null;

function getConnectionManager(): ConnectionManager {
  if (!connectionManagerInstance) {
    connectionManagerInstance = new ConnectionManager();
    setupConnectionCallbacks();
  }
  return connectionManagerInstance;
}

// ============== Connection State Stores ==============

export const connectionPhase = writable<ConnectionPhase>(ConnectionPhase.IDLE);
export const currentRole = writable<PeerRole | null>(null);
export const generatedUrl = writable<string>("");
export const errorMessage = writable<string | null>(null);
export const isLoading = writable<boolean>(false);

// Media state stores
export const isMicrophoneEnabled = writable<boolean>(false);
export const isDisplayEnabled = writable<boolean>(false);
export const hasAudioInput = writable<boolean>(false);
export const remoteStream = writable<MediaStream | null>(null);

// Cursor state stores
export const cursorPositionsChannelReady = writable<boolean>(false);
export const cursorPingChannelReady = writable<boolean>(false);
export const cursorChannelsReady = writable<boolean>(false);
export const lastCursorPingAt = writable<number | null>(null);
export const remoteCursors = writable<Map<string, RemoteCursorState>>(new Map());

// ICE connection state
export const iceConnectionState = writable<RTCIceConnectionState | null>(null);

// Connection state
export const connectionState = writable<RTCPeerConnectionState | null>(null);

// ============== Derived Stores ==============

export const isConnected = derived(connectionPhase, $phase => $phase === ConnectionPhase.CONNECTED);
export const isConnecting = derived(
  connectionPhase,
  $phase => [
    ConnectionPhase.INITIALIZING,
    ConnectionPhase.CONNECTING
  ].includes($phase)
);

export const isSharer = derived(currentRole, $role => $role === PeerRole.SCREEN_SHARER);
export const isWatcher = derived(currentRole, $role => $role === PeerRole.SCREEN_WATCHER);

// whether cursor sync can actually work now
export const canSyncCursor = derived(
  [isConnected, cursorChannelsReady],
  ([$isConnected, $cursorChannelsReady]) =>
    $isConnected && $cursorChannelsReady
);

// Phase display text mapping
export type PhaseDisplayConfig = {
  text: string;
  status: "ready" | "active" | "warning";
  icon: string;
};

export const phaseDisplayConfig: Record<ConnectionPhase, {
  text: string;
  status: "ready" | "active" | "warning";
  icon: string;
}> = {
  [ConnectionPhase.IDLE]: { text: "Ready", status: "ready", icon: "⚪" },
  [ConnectionPhase.INITIALIZING]: { text: "Initializing...", status: "warning", icon: "🔄" },
  [ConnectionPhase.OFFER_CREATED]: { text: "Offer created", status: "ready", icon: "📤" },
  [ConnectionPhase.ANSWER_CREATED]: { text: "Answer created", status: "ready", icon: "📥" },
  [ConnectionPhase.CONNECTING]: { text: "Connecting...", status: "warning", icon: "🔗" },
  [ConnectionPhase.CONNECTED]: { text: "Connected", status: "active", icon: "✅" },
  [ConnectionPhase.DISCONNECTED]: { text: "Disconnected", status: "ready", icon: "🔌" },
  [ConnectionPhase.ERROR]: { text: "Error", status: "warning", icon: "❌" }
};

export const phaseDisplayText: Record<ConnectionPhase, string> = Object.fromEntries(
  Object.entries(phaseDisplayConfig).map(([key, value]) => [key, value.text])
) as Record<ConnectionPhase, string>;

// ============== Setup Callbacks ==============

let isResetting = false;

function setupConnectionCallbacks(): void {
  if (!connectionManagerInstance) return;

  connectionManagerInstance.setCallbacks({
    onPhaseChange: (phase: ConnectionPhase) => {
      if (isResetting) return;

      connectionPhase.set(phase);

      if (phase === ConnectionPhase.CONNECTED) {
        updateMediaStates();
        syncCursorChannelStates();
        startStaleCursorCheck();
        startCursorChannelTimeout();
      }

      if (phase === ConnectionPhase.DISCONNECTED) {
        resetConnectionStores({ clearError: true });
      }

      // Preserve error message so pages can display inline error
      if (phase === ConnectionPhase.ERROR) {
        resetConnectionStores({ clearError: false });
      }
    },

    onUrlGenerated: (url: string) => {
      generatedUrl.set(url);
    },

    onError: (error: Error) => {
      errorMessage.set(error.message);
      showToast(error.message, "error");
    },

    onRemoteStream: (stream: MediaStream) => {
      remoteStream.set(stream);
    },

    onIceConnectionStateChange: (state: RTCIceConnectionState) => {
      iceConnectionState.set(state);
    },

    onConnectionStateChange: (state: RTCPeerConnectionState) => {
      connectionState.set(state);
    },

    onCursorUpdate: (data: RemoteCursorState) => {
      const now = Date.now();
      remoteCursors.update(cursors => {
        const newCursors = new Map(cursors);
        newCursors.set(data.id, data);
        return newCursors;
      });

      cursorLastSeen.set(data.id, now);
      lastCursorPingAt.set(now);
    },

    onCursorPing: (cursorId: string) => {
      const now = Date.now();
      cursorLastSeen.set(cursorId, now);
      lastCursorPingAt.set(now);
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onChannelOpen: (_channelName: string) => {
      syncCursorChannelStates();
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onChannelClose: (_channelName: string) => {
      syncCursorChannelStates();

      if (!connectionManagerInstance?.isConnected()) {
        cursorLastSeen.clear();
      }
    }
  });
}

// ============== Helper Functions ==============

function updateMediaStates(): void {
  if (!connectionManagerInstance) return;

  isMicrophoneEnabled.set(connectionManagerInstance.isMicrophoneActive());
  isDisplayEnabled.set(connectionManagerInstance.isDisplayActive());
  hasAudioInput.set(connectionManagerInstance.hasAudioInput());
}

function syncCursorChannelStates(): void {
  if (!connectionManagerInstance) {
    cursorPositionsChannelReady.set(false);
    cursorPingChannelReady.set(false);
    cursorChannelsReady.set(false);
    return;
  }

  const positionsReady = connectionManagerInstance.isCursorPositionsChannelReady();
  const pingReady = connectionManagerInstance.isCursorPingChannelReady();

  cursorPositionsChannelReady.set(positionsReady);
  cursorPingChannelReady.set(pingReady);

  const allReady = positionsReady && pingReady;
  cursorChannelsReady.set(allReady);

  if (allReady) {
    stopCursorChannelTimeout();
  }
}

const CURSOR_CHANNEL_TIMEOUT_MS = 10000;
const CURSOR_STALE_TIMEOUT_MS = 5000;
const CURSOR_STALE_CHECK_INTERVAL_MS = 1000;
const cursorLastSeen = new Map<string, number>();

let cursorChannelTimeout: ReturnType<typeof setTimeout> | null = null;
let staleCheckInterval: ReturnType<typeof setInterval> | null = null;

function startCursorChannelTimeout(): void {
  stopCursorChannelTimeout();

  cursorChannelTimeout = setTimeout(() => {
    cursorChannelTimeout = null;

    if (connectionManagerInstance?.isConnected() &&
        !connectionManagerInstance.areCursorChannelsReady()) {
      showToast("Cursor sync is not available (data channels not ready).", "info");
    }
  }, CURSOR_CHANNEL_TIMEOUT_MS);
}

function stopCursorChannelTimeout(): void {
  if (cursorChannelTimeout) {
    clearTimeout(cursorChannelTimeout);
    cursorChannelTimeout = null;
  }
}

function startStaleCursorCheck(): void {
  if (staleCheckInterval) return;
  staleCheckInterval = setInterval(() => {
    const now = Date.now();
    remoteCursors.update(cursors => {
      // Create shadow copy of current Map 
      const newCursors = new Map(cursors);
      let changed = false;
      for (const [id] of newCursors) {
        // Get the last active timestamp for this cursor, 
        // the default value is 0 
        const lastSeen = cursorLastSeen.get(id) ?? 0;
        // Check if the inactivity timeout has been exceeded
        // If true, delete inactivity cursor
        if (now - lastSeen > CURSOR_STALE_TIMEOUT_MS) {
          newCursors.delete(id);
          cursorLastSeen.delete(id);
          changed = true;
        }
      }
      return changed ? newCursors : cursors;
    });
  }, CURSOR_STALE_CHECK_INTERVAL_MS);
}

function stopStaleCursorCheck(): void {
  if (staleCheckInterval) {
    clearInterval(staleCheckInterval);
    staleCheckInterval = null;
  }
  cursorLastSeen.clear();
}

function resetConnectionStores(options: { clearError?: boolean } = {}): void {
  generatedUrl.set("");
  remoteStream.set(null);
  iceConnectionState.set(null);
  connectionState.set(null);
  cursorPositionsChannelReady.set(false);
  cursorPingChannelReady.set(false);
  cursorChannelsReady.set(false);
  lastCursorPingAt.set(null);
  remoteCursors.set(new Map());
  isMicrophoneEnabled.set(false);
  isDisplayEnabled.set(false);
  hasAudioInput.set(false);
  isLoading.set(false);
  stopCursorChannelTimeout();
  stopStaleCursorCheck();
  currentRole.set(null);

  if (options.clearError) {
    errorMessage.set(null);
  }
}

// ============== Connection Actions ==============

/**
 * Starts screen sharing session as sharer
 */
export async function startSharing(username: string): Promise<string | null> {
  isLoading.set(true);
  errorMessage.set(null);
  
  try {
    const manager = getConnectionManager();
    const settings = get(appSettings);
    
    const config: Partial<WebRTCServiceConfig> = {
      userConfig: {
        username,
        isMicrophoneEnabledOnConnect: settings.isMicrophoneEnabledOnConnect
      },
      connectionConfig: {
        iceServers: settings.iceServers
      }
    };
    
    currentRole.set(PeerRole.SCREEN_SHARER);
    const url = await manager.startSharing(username, config);
    
    if (!url) {
      currentRole.set(null);
      return null;
    }
    
    return url;
  } catch (error) {
    currentRole.set(null);
    const message = error instanceof Error ? error.message : "Failed to start sharing";
    errorMessage.set(message);
    showToast(message, "error");
    return null;
  } finally {
    isLoading.set(false);
  }
}

/**
 * Accepts answer URL from watcher (for sharer)
 */
export async function acceptAnswer(offerUrl: string): Promise<boolean> {
  isLoading.set(true);
  errorMessage.set(null);
  
  try {
    const manager = getConnectionManager();
    return await manager.acceptAnswerUrl(offerUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to accept answer";
    errorMessage.set(message);
    showToast(message, "error");
    return false;
  } finally {
    isLoading.set(false);
  }
}

/**
 * Joins a sharing session as watcher
 */
export async function joinSession(
  username: string, 
  offerUrl: string,
  videoElement: HTMLVideoElement,
): Promise<string | null> {
  isLoading.set(true);
  errorMessage.set(null);
  
  try {
    const manager = getConnectionManager();
    const settings = get(appSettings);
    
    const config: Partial<WebRTCServiceConfig> = {
      userConfig: {
        username,
        isMicrophoneEnabledOnConnect: settings.isMicrophoneEnabledOnConnect
      },
      connectionConfig: {
        iceServers: settings.iceServers
      }
    };
    
    currentRole.set(PeerRole.SCREEN_WATCHER);
    const url = await manager.joinSession(username, offerUrl, videoElement, config);
    
    if (!url) {
      currentRole.set(null);
      return null;
    }
    
    return url;
  } catch (error) {
    currentRole.set(null);
    const message = error instanceof Error ? error.message : "Failed to join session";
    errorMessage.set(message);
    showToast(message, "error");
    return null;
  } finally {
    isLoading.set(false);
  }
}

/**
 * Disconnects the current session
 */
export async function disconnect(): Promise<void> {
  if (!connectionManagerInstance) return;
  
  try {
    await connectionManagerInstance.disconnect();
    currentRole.set(null);
  } catch (error) {
    console.error("Disconnect error:", error);
  }
}

/**
 * Resets the connection manager completely
 */
export async function resetConnection(): Promise<void> {
  isResetting = true; 

  try {
    if (connectionManagerInstance) {
      await connectionManagerInstance.reset();
      setupConnectionCallbacks();
    }
  } finally {
    connectionPhase.set(ConnectionPhase.IDLE);
    currentRole.set(null);
    resetConnectionStores();
    errorMessage.set(null);
    isResetting = false;
  }
}

// ============== Media Control Actions ==============

export async function toggleMicrophone(): Promise<boolean> {
  if (!connectionManagerInstance) return false;
  
  const result = await connectionManagerInstance.toggleMicrophone();
  isMicrophoneEnabled.set(connectionManagerInstance.isMicrophoneActive());
  return result;
}

export async function setMicrophoneEnabled(enabled: boolean): Promise<void> {
  if (!connectionManagerInstance) return;
  await connectionManagerInstance.setMicrophoneEnabled(enabled);
  isMicrophoneEnabled.set(connectionManagerInstance.isMicrophoneActive());
}

export function toggleDisplayStream(): boolean {
  if (!connectionManagerInstance) return false;
  const result = connectionManagerInstance.toggleDisplayStream();
  isDisplayEnabled.set(connectionManagerInstance.isDisplayActive());
  return result;
}

export function setDisplayStreamEnabled(enabled: boolean): void {
  if (!connectionManagerInstance) return;
  connectionManagerInstance.setDisplayStreamEnabled(enabled);
  isDisplayEnabled.set(connectionManagerInstance.isDisplayActive());
}

// ============== Cursor Control Actions ==============

export function pingRemoteCursor(cursorId: string): boolean {
  if (!connectionManagerInstance) return false;
  return connectionManagerInstance.pingRemoteCursor(cursorId);
}

export function updateRemoteCursor(cursorData: RemoteCursorState): boolean {
  if (!connectionManagerInstance) return false;
  return connectionManagerInstance.updateRemoteCursor(cursorData);
}

