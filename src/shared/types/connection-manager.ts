/**
 * Connection state for UI updates
 */
export enum ConnectionPhase {
  IDLE = "idle",
  INITIALIZING = "initializing",
  WAITING_FOR_OFFER = "waitingForOffer",
  OFFER_CREATED = "offerCreated",
  WAITING_FOR_ANSWER = "waitingForAnswer",
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
  onConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onError?: (error: Error) => void;
  onRemoteStream?: (stream: MediaStream) => void; 
};
