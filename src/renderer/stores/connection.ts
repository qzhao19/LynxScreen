import { writable, derived, get } from "svelte/store";
import { ConnectionManager } from "../core/session/connection-manager";
import { 
  ConnectionPhase, 
  PeerRole, 
  RemoteCursorState 
} from "../../shared/types/index";
import type { WebRTCServiceConfig } from "../shared/types/index";
import { showToast, appSettings } from "./app";

// ============== Connection Manager Singleton ==============

let connectionManagerInstance: ConnectionManager | null = null;
let cursorSyncInitialized = false;

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
export const cursorChannelsReady = writable<boolean>(false);
export const remoteCursors = writable<Map<string, RemoteCursorState>>(new Map());

// ICE connection state
export const iceConnectionState = writable<RTCIceConnectionState | null>(null);

// ============== Derived Stores ==============

export const isIdle = derived(connectionPhase, $phase => $phase === ConnectionPhase.IDLE);
export const isConnected = derived(connectionPhase, $phase => $phase === ConnectionPhase.CONNECTED);
export const isSharer = derived(currentRole, $role => $role === PeerRole.SCREEN_SHARER);
export const isWatcher = derived(currentRole, $role => $role === PeerRole.SCREEN_WATCHER);

export const isConnecting = derived(
  connectionPhase,
  $phase => [
    ConnectionPhase.INITIALIZING,
    ConnectionPhase.CONNECTING,
    ConnectionPhase.WAITING_FOR_ANSWER
  ].includes($phase)
);

export const canAcceptAnswer = derived(
  [currentRole, connectionPhase],
  ([$role, $phase]) => 
    $role === PeerRole.SCREEN_SHARER && 
    $phase === ConnectionPhase.WAITING_FOR_ANSWER
);

// Phase display text mapping
export type PhaseDisplayConfig = {
  text: string;
  status: "ready" | "active" | "warning";
  icon: string;
};

// Phase display configurations
export const phaseDisplayConfig: Record<ConnectionPhase, { 
  text: string; 
  status: "ready" | "active" | "warning";
  icon: string;
}> = {
  [ConnectionPhase.IDLE]: { 
    text: "Ready", 
    status: "ready",
    icon: "⚪"
  },
  [ConnectionPhase.INITIALIZING]: { 
    text: "Initializing...", 
    status: "warning",
    icon: "🔄"
  },
  [ConnectionPhase.WAITING_FOR_OFFER]: { 
    text: "Waiting for offer...", 
    status: "warning",
    icon: "⏳"
  },
  [ConnectionPhase.OFFER_CREATED]: { 
    text: "Offer created", 
    status: "ready",
    icon: "📤"
  },
  [ConnectionPhase.WAITING_FOR_ANSWER]: { 
    text: "Waiting for answer...", 
    status: "warning",
    icon: "⏳"
  },
  [ConnectionPhase.ANSWER_CREATED]: { 
    text: "Answer created", 
    status: "ready",
    icon: "📥"
  },
  [ConnectionPhase.CONNECTING]: { 
    text: "Connecting...", 
    status: "warning",
    icon: "🔗"
  },
  [ConnectionPhase.CONNECTED]: { 
    text: "Connected", 
    status: "active",
    icon: "✅"
  },
  [ConnectionPhase.DISCONNECTED]: { 
    text: "Disconnected", 
    status: "ready",
    icon: "🔌"
  },
  [ConnectionPhase.ERROR]: { 
    text: "Error", 
    status: "warning",
    icon: "❌"
  }
};

// Phase display text mapping (derived from config)
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
        startCursorChannelCheck();
      }
      
      if (phase === ConnectionPhase.DISCONNECTED) {
        resetConnectionStores({ clearError: true });
      }
      
      if (phase === ConnectionPhase.ERROR) {
        resetConnectionStores({ clearError: true });
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

let cursorCheckInterval: ReturnType<typeof setInterval> | null = null;
let cursorCheckTimeout: ReturnType<typeof setTimeout> | null = null;

function stopCursorChannelCheck(): void {
  if (cursorCheckInterval) {
    clearInterval(cursorCheckInterval);
    cursorCheckInterval = null;
  }

  if (cursorCheckTimeout) {
    clearTimeout(cursorCheckTimeout);
    cursorCheckTimeout = null;
  }
}

const CURSOR_CHECK_INTERVAL_MS = 100;
const CURSOR_CHECK_TIMEOUT_MS = 10000;

function startCursorChannelCheck(): void {
  // Clear any previous timers
  stopCursorChannelCheck();
  
  // Reset state for a new check
  cursorChannelsReady.set(false);
  
  cursorCheckInterval = setInterval(() => {
    if (connectionManagerInstance?.areCursorChannelsReady()) {
      cursorChannelsReady.set(true);
      stopCursorChannelCheck();
    }
  }, CURSOR_CHECK_INTERVAL_MS);
  
  // Timeout after 10 seconds
  cursorCheckTimeout = setTimeout(() => {
    stopCursorChannelCheck();
    
    // Only notify if connected
    if (connectionManagerInstance?.isConnected()) {
      const message = "Cursor sync is not available (data channels not ready).";
      showToast(message, "info");
    }
  }, CURSOR_CHECK_TIMEOUT_MS);
}

function resetConnectionStores(options: { clearError?: boolean } = {}): void {
  generatedUrl.set("");
  remoteStream.set(null);
  iceConnectionState.set(null);
  cursorChannelsReady.set(false);
  remoteCursors.set(new Map());
  isMicrophoneEnabled.set(false);
  isDisplayEnabled.set(false);
  hasAudioInput.set(false);
  stopCursorChannelCheck();
  cursorSyncInitialized = false;
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
export async function acceptAnswer(): Promise<boolean> {
  isLoading.set(true);
  errorMessage.set(null);
  
  try {
    const manager = getConnectionManager();
    return await manager.acceptAnswerUrl();
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
  videoElement: HTMLVideoElement
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
    const url = await manager.joinSession(username, videoElement, config);
    
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

/**
 * Toggles microphone on/off
 */
export function toggleMicrophone(): boolean {
  if (!connectionManagerInstance) return false;
  
  const result = connectionManagerInstance.toggleMicrophone();
  isMicrophoneEnabled.set(connectionManagerInstance.isMicrophoneActive());
  return result;
}

/**
 * Sets microphone enabled state
 */
export function setMicrophoneEnabled(enabled: boolean): void {
  if (!connectionManagerInstance) return;
  connectionManagerInstance.setMicrophoneEnabled(enabled);
  isMicrophoneEnabled.set(connectionManagerInstance.isMicrophoneActive());
}


/**
 * Toggles display stream on/off
 */
export function toggleDisplayStream(): boolean {
  if (!connectionManagerInstance) return false;
  
  const result = connectionManagerInstance.toggleDisplayStream();
  isDisplayEnabled.set(connectionManagerInstance.isDisplayActive());
  return result;
}

// ============== Cursor Control Actions ==============

/**
 * Sets up cursor synchronization
 */
export function setupCursorSync(): void {
  if (!connectionManagerInstance) return;
  if (cursorSyncInitialized) return;
  
  // Enable cursor sync
  connectionManagerInstance.toggleRemoteCursors(true);
  
  // Register cursor update callback
  connectionManagerInstance.onCursorUpdate((cursorData: RemoteCursorState) => {
    remoteCursors.update(cursors => {
      const newCursors = new Map(cursors);
      newCursors.set(cursorData.id, cursorData);
      return newCursors;
    });
  });

  cursorSyncInitialized = true;
}

/**
 * Sends cursor position update
 */
export function sendCursorUpdate(cursorData: RemoteCursorState): boolean {
  if (!connectionManagerInstance) return false;
  return connectionManagerInstance.updateRemoteCursor(cursorData);
}

/**
 * Removes a remote cursor from the map
 */
export function removeRemoteCursor(cursorId: string): void {
  remoteCursors.update(cursors => {
    const newCursors = new Map(cursors);
    newCursors.delete(cursorId);
    return newCursors;
  });
}

// ============== State Query Functions ==============

/**
 * Gets current connection phase
 */
export function getCurrentPhase(): ConnectionPhase {
  return connectionManagerInstance?.getCurrentPhase() ?? ConnectionPhase.IDLE;
}

/**
 * Checks if data channels are ready
 */
export function areCursorChannelsReady(): boolean {
  return connectionManagerInstance?.areCursorChannelsReady() ?? false;
}

// ============== Media Control Actions ==============

/**
 * Sets display stream enabled state
 */
export function setDisplayStreamEnabled(enabled: boolean): void {
  if (!connectionManagerInstance) return;
  connectionManagerInstance.setDisplayStreamEnabled(enabled);
  isDisplayEnabled.set(connectionManagerInstance.isDisplayActive());
}

/**
 * Gets audio stream
 */
export function getAudioStream(): MediaStream | null {
  return connectionManagerInstance?.getAudioStream() ?? null;
}

/**
 * Gets display stream
 */
export function getDisplayStream(): MediaStream | null {
  return connectionManagerInstance?.getDisplayStream() ?? null;
}

/**
 * Checks if display stream is active (tracks enabled)
 */
export function isDisplayStreamActive(): boolean {
  return connectionManagerInstance?.isDisplayStreamActive() ?? false;
}

// ============== Connection State Query Functions ==============

/**
 * Gets the current peer connection state
 */
export function getConnectionState(): RTCPeerConnectionState | null {
  return connectionManagerInstance?.getConnectionState() ?? null;
}

/**
 * Gets the current ICE connection state
 */
export function getIceConnectionState(): RTCIceConnectionState | null {
  return connectionManagerInstance?.getIceConnectionState() ?? null;
}

/**
 * Checks if WebRTC service is initialized
 */
export function isServiceInitialized(): boolean {
  return connectionManagerInstance?.isServiceInitialized() ?? false;
}

/**
 * Checks if current role is screen sharer
 */
export function isScreenSharer(): boolean {
  return connectionManagerInstance?.isScreenSharer() ?? false;
}

/**
 * Checks if current role is screen watcher
 */
export function isScreenWatcher(): boolean {
  return connectionManagerInstance?.isScreenWatcher() ?? false;
}

/**
 * Gets current role
 */
export function getRole(): PeerRole | null {
  return connectionManagerInstance?.getRole() ?? null;
}

/**
 * Checks if connected
 */
export function isConnectedSync(): boolean {
  return connectionManagerInstance?.isConnected() ?? false;
}

/**
 * Gets the WebRTC service (for advanced usage)
 */
export function getWebRTCService() {
  return connectionManagerInstance?.getWebRTCService() ?? null;
}

// ============== Cursor Control - Missing Functions ==============

/**
 * Toggles cursor synchronization
 */
export function toggleRemoteCursors(enabled: boolean): boolean {
  if (!connectionManagerInstance) return false;
  return connectionManagerInstance.toggleRemoteCursors(enabled);
}

/**
 * Checks if cursor synchronization is enabled
 */
export function isCursorsEnabled(): boolean {
  return connectionManagerInstance?.isCursorsEnabled() ?? false;
}

/**
 * Checks if cursor positions channel is ready
 */
export function isCursorPositionsChannelReady(): boolean {
  return connectionManagerInstance?.isCursorPositionsChannelReady() ?? false;
}

/**
 * Checks if cursor ping channel is ready
 */
export function isCursorPingChannelReady(): boolean {
  return connectionManagerInstance?.isCursorPingChannelReady() ?? false;
}

/**
 * Registers callback for data channel open events
 */
export function onChannelOpen(callback: (channelName: string) => void): void {
  connectionManagerInstance?.onChannelOpen(callback);
}

/**
 * Registers callback for data channel close events
 */
export function onChannelClose(callback: (channelName: string) => void): void {
  connectionManagerInstance?.onChannelClose(callback);
}