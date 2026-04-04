/**
 * WebRTC ICE server configuration.
 *
 * Defines the settings for ICE (Interactive Connectivity Establishment) servers,
 * which are used to establish peer-to-peer connections in WebRTC.
 *
 * @interface IceServerConfig
 * @property {string} urls - The URL or comma-separated URLs of the ICE/STUN/TURN server.
 *                           Example: "stun:stun.l.google.com:19302" or "turn:turnserver.com"
 * @property {string} [authUsername] - Optional authUsername for authenticating with TURN servers.
 * @property {string} [credential] - Optional credential (password or token) for authenticating with TURN servers.
 */
export interface IceServerConfig {
  urls: string
  authUsername?:  string
  credential?: string
}

/**
 * User settings specific to WebRTC functionality.
 * 
 * This interface extracts only the settings required by the WebRTC service from the broader AppSettings,
 * promoting better separation of concerns and avoiding unnecessary data passing.
 * 
 * @interface WebRTCUserConfig
 * @property {string} username - The display name of the local user, used in connection metadata.
 * @property {boolean} isMicrophoneEnabledOnConnect - Whether to automatically enable the microphone
 *                                                     when establishing a WebRTC connection.
 */
export interface WebRTCUserConfig {
  username: string;
  isMicrophoneEnabledOnConnect: boolean;
}

/**
 * Enum representing the role of a peer in the WebRTC connection.
 * - server: The peer that initiates the screen sharing
 * - client: The peer that receives the screen sharing
 */
export enum PeerRole {
  SCREEN_SHARER = "screenSharer",
  SCREEN_WATCHER = "screenWatcher"
}

/**
 * Interface representing the complete connection information exchanged between peers.
 * This is typically encoded in a URL for easy sharing between peers.
 * @property {string} type - The role of the peer in the connection (server or client)
 * @property {string} data - Connection metadata including username
 * @property {string} rtcSessionDescription - The WebRTC session description (offer or answer)
 *                                   for establishing the peer connection
 */
export interface UrlData {
  role: PeerRole
  username: string
  rtcSessionDescription: RTCSessionDescriptionInit
}

/**
 * Configuration for WebRTC peer connection.
 * 
 * @interface WebRTCConnectionConfig
 * @property {IceServerConfig[]} iceServers - Array of ICE server configurations
 *                                            for NAT traversal and connectivity.
 */
export interface WebRTCConnectionConfig {
  iceServers: IceServerConfig[]
}


/**
 * Enum defining the names of WebRTC data channels used for screen sharing communication.
 * 
 * These channels are used to transmit different types of data between the screen sharer
 * and screen watcher peers in real-time.
 * 
 * @enum {string}
 * @property {string} CURSOR_POSITIONS - Data channel for transmitting remote cursor position updates.
 *                                        Used to sync the cursor coordinates of the other peer.
 * @property {string} CURSOR_PING - Data channel for sending cursor ping/heartbeat messages.
 *                                   Used to keep the cursor connection alive or detect disconnections.
 */
export enum DataChannelName {
  CURSOR_POSITIONS = "remoteCursorPositions",
  CURSOR_PING = "remoteCursorPing"
}

/**
 * Configuration object for initializing and managing the WebRTC service.
 * 
 * @interface WebRTCSharerConfig
 * @property {WebRTCUserConfig} userConfig - User-specific settings required for WebRTC initialization.
 * @property {boolean} isScreenSharer - Indicates screen sharer (initiates the connection, sends screen)
 * @property {WebRTCConnectionConfig} [connectionConfig] - Optional WebRTC connection settings including ICE servers.
 *                                                        If not provided, default ICE servers will be used.
 */
export interface WebRTCSharerConfig {
  userConfig: WebRTCUserConfig;
  isScreenSharer: true;
  connectionConfig?: WebRTCConnectionConfig;
}

/**
 * Configuration object for initializing and managing the WebRTC service.
 * 
 * @interface WebRTCWatcherConfig
 * @property {WebRTCUserConfig} userConfig - User-specific settings required for WebRTC initialization.
 * @property {boolean} isScreenSharer - Indicates the screen watcher (receives the screen)
 * @property {HTMLVideoElement} [remoteVideo] - Reference to the HTML video element where
 *                                              the remote peer's video stream (screen capture) will be rendered.
 * @property {WebRTCConnectionConfig} [connectionConfig] - Optional WebRTC connection settings including ICE servers.
 *                                                        If not provided, default ICE servers will be used.
 */
export interface WebRTCWatcherConfig {
  userConfig: WebRTCUserConfig;
  isScreenSharer: false;
  remoteVideo: HTMLVideoElement;  // Required for watchers
  connectionConfig?: WebRTCConnectionConfig;
}

/**
 * Unified configuration object for WebRTC service.
 * Use WebRTCSharerConfig or WebRTCWatcherConfig based on role.
 */
export type WebRTCServiceConfig = WebRTCSharerConfig | WebRTCWatcherConfig;
