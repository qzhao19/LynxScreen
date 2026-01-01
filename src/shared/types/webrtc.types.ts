import type { IceServerConfig } from "./settings.types";

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
 * Interface representing connection metadata for a peer.
 * @interface ConnectionData
 * @property {string} username - The name of the user establishing the connection
 */
export interface ConnectionData {
  username: string
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
  data: ConnectionData
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