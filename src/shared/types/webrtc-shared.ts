/**
 * WebRTC ICE server configuration.
 *
 * Defines the settings for ICE (Interactive Connectivity Establishment) servers,
 * which are used to establish peer-to-peer connections in WebRTC.
 *
 * @interface IceServerConfig
 * @property {string} urls - The URL or comma-separated URLs of the ICE/STUN/TURN server.
 *                           Example: "stun:stun.l.google.com:19302" or "turn:turnserver.com"
 * @property {string} [username] - Optional username for authenticating with TURN servers.
 * @property {string} [credential] - Optional credential (password or token) for authenticating with TURN servers.
 */
export interface IceServerConfig {
  urls: string
  username?:  string
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