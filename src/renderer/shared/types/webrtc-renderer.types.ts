import type { AppSettings } from "../../../shared/types/settings.types";

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
 * This interface encapsulates all necessary settings and references required to establish
 * and manage a peer-to-peer WebRTC connection for screen sharing.
 * 
 * @interface WebRTCServiceConfig
 * @property {AppSettings} settings - Application-wide settings used to initialize the WebRTC connection.
 * @property {boolean} isScreenSharer - Indicates the role of the local peer in the connection.
 *                                    - true: screen sharer (initiates the connection, sends screen)
 *                                    - false: screen watcher (receives the screen)
 *                          
 * @property {HTMLVideoElement | null} [remoteVideo] - Optional reference to the HTML video element where
 *                                                     the remote peer's video stream (screen capture) will be rendered.
 * 
 */
export interface WebRTCServiceConfig {
  settings: AppSettings
  isScreenSharer: boolean
  remoteVideo?: HTMLVideoElement | null
}