import type { 
  WebRTCConnectionConfig, 
  WebRTCUserConfig, 
} from "../../../shared/types/index";

/**
 * Type alias representing the connection state of a WebRTC ICE (Interactive Connectivity Establishment) connection.
 * @typedef {RTCIceConnectionState} WebRTCConnectionState
 */
export type WebRTCConnectionState = RTCIceConnectionState

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
