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
  CURSOR_POSITIONS = 'remoteCursorPositions',
  CURSOR_PING = 'remoteCursorPing'
}