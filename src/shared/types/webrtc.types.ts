/**
 * Enum representing the role of a peer in the WebRTC connection.
 * - server: The peer that initiates the screen sharing
 * - client: The peer that receives the screen sharing
 */
export enum ConnectionType {
  "server",
  "client"
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
  type: ConnectionType
  data: ConnectionData
  rtcSessionDescription: RTCSessionDescriptionInit
}

/**
 * Type alias representing the connection state of a WebRTC ICE (Interactive Connectivity Establishment) connection.
 * @typedef {RTCIceConnectionState} ConnectionState
 */
export type ConnectionState = RTCIceConnectionState

