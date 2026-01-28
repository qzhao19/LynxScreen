import { writable, derived } from "svelte/store";
import { ConnectionPhase, PeerRole } from "@/shared/types";
import { RemoteCursorState } from "@/shared/types";

// Connection state
export const connectionPhase = writable<ConnectionPhase>(ConnectionPhase.IDLE);
export const currentRole = writable<PeerRole | null>(null);
export const generatedUrl = writable<string | null>(null);
export const errorMessage = writable<string | null>(null);
export const isLoading = writable<boolean>(false);

// Media state
export const isMicrophoneEnabled = writable<boolean>(false);
export const remoteStream = writable<MediaStream | null>(null);
export const remoteCursor = writable<RemoteCursorState | null>(null);

// Derived stores
export const isIdle = derived(connectionPhase, $phase => $phase === ConnectionPhase.IDLE);
export const isConnected = derived(connectionPhase, $phase => $phase === ConnectionPhase.CONNECTED);
export const isSharer = derived(currentRole, $role => $role === PeerRole.SCREEN_SHARER);
export const isWatcher = derived(currentRole, $role => $role === PeerRole.SCREEN_WATCHER);

export const canAcceptAnswer = derived(
  [currentRole, connectionPhase],
  ([$role, $phase]) => $role === PeerRole.SCREEN_SHARER && $phase === ConnectionPhase.WAITING_FOR_ANSWER
);

// Phase display text
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

// Reset all stores
export function resetConnectionState(): void {
  connectionPhase.set(ConnectionPhase.IDLE);
  currentRole.set(null);
  generatedUrl.set(null);
  errorMessage.set(null);
  isLoading.set(false);
  isMicrophoneEnabled.set(false);
  remoteStream.set(null);
  remoteCursor.set(null);
}

