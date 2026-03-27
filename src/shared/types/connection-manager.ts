import type { RemoteCursorState } from "./remote-cursor";

/**
 * Connection state for UI updates
 */
export enum ConnectionPhase {
  IDLE = "idle",
  INITIALIZING = "initializing",
  OFFER_CREATED = "offerCreated",
  ANSWER_CREATED = "answerCreated",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  ERROR = "error"
};

/**
 * Connection manager events
 */
export interface ConnectionManagerCallbacks {
  onPhaseChange?: (step: ConnectionPhase) => void;
  onUrlGenerated?: (url: string) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;  // ADD THIS
  onError?: (error: Error) => void;
  onRemoteStream?: (stream: MediaStream) => void; 
  onCursorUpdate?: (data: RemoteCursorState) => void;
  onCursorPing?: (cursorId: string) => void;
  onChannelOpen?: (channelName: string) => void;
  onChannelClose?: (channelName: string) => void;
};
