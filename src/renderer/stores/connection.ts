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
export const phaseDisplayText: Record<ConnectionPhase, string> = {
  [ConnectionPhase.IDLE]: "Ready",
  [ConnectionPhase.INITIALIZING]: "Initializing...",
  [ConnectionPhase.WAITING_FOR_OFFER]: "Waiting for offer...",
  [ConnectionPhase.OFFER_CREATED]: "Offer created",
  [ConnectionPhase.WAITING_FOR_ANSWER]: "Waiting for answer...",
  [ConnectionPhase.ANSWER_CREATED]: "Answer created",
  [ConnectionPhase.CONNECTING]: "Connecting...",
  [ConnectionPhase.CONNECTED]: "Connected",
  [ConnectionPhase.DISCONNECTED]: "Disconnected",
  [ConnectionPhase.ERROR]: "Error"
};

// ============== Setup Callbacks ==============

function setupConnectionCallbacks(): void {
  if (!connectionManagerInstance) return;

  connectionManagerInstance.setCallbacks({
    onPhaseChange: (phase: ConnectionPhase) => {
      connectionPhase.set(phase);
      
      if (phase === ConnectionPhase.CONNECTED) {
        updateMediaStates();
        startCursorChannelCheck();
      }
      
      if (phase === ConnectionPhase.DISCONNECTED || phase === ConnectionPhase.ERROR) {
        resetConnectionStores();
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

function startCursorChannelCheck(): void {
  if (cursorCheckInterval) {
    clearInterval(cursorCheckInterval);
  }
  
  cursorCheckInterval = setInterval(() => {
    if (connectionManagerInstance?.areCursorChannelsReady()) {
      cursorChannelsReady.set(true);
      if (cursorCheckInterval) {
        clearInterval(cursorCheckInterval);
        cursorCheckInterval = null;
      }
    }
  }, 100);
  
  // Timeout after 10 seconds
  setTimeout(() => {
    if (cursorCheckInterval) {
      clearInterval(cursorCheckInterval);
      cursorCheckInterval = null;
    }
  }, 10000);
}

function resetConnectionStores(): void {
  generatedUrl.set("");
  remoteStream.set(null);
  iceConnectionState.set(null);
  cursorChannelsReady.set(false);
  remoteCursors.set(new Map());
  isMicrophoneEnabled.set(false);
  isDisplayEnabled.set(false);
  hasAudioInput.set(false);
  errorMessage.set(null);
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
    
    if (url) {
      return url;
    }
    
    return null;
  } catch (error) {
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
    
    return url;
  } catch (error) {
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
  try {
    const manager = getConnectionManager();
    await manager.disconnect();
    currentRole.set(null);
  } catch (error) {
    console.error("Disconnect error:", error);
  }
}

/**
 * Resets the connection manager completely
 */
export async function resetConnection(): Promise<void> {
  if (connectionManagerInstance) {
    await connectionManagerInstance.reset();
    setupConnectionCallbacks();
  }
  connectionPhase.set(ConnectionPhase.IDLE);
  currentRole.set(null);
  resetConnectionStores();
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
  isMicrophoneEnabled.set(enabled);
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
  isDisplayEnabled.set(enabled);
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