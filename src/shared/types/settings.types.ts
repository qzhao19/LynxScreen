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
 * Application settings configured by the user.
 *
 * This interface defines all user-configurable settings for the LynxScreen application,
 * including user identification, UI preferences, and WebRTC connectivity settings.
 *
 * @interface AppSettings
 * @property {string} username - The display name of the local user in the application.
 * @property {string} color - The preferred UI theme color (e.g., "#FF5733", "blue").
 * @property {string} language - The preferred UI language locale code (e.g., "en", "zh-CN", "es").
 * @property {boolean} isMicrophoneEnabledOnConnect - Whether to automatically enable the microphone
 *                                                     when establishing a connection.
 * @property {IceServerConfig[]} iceServers - An array of ICE server configurations used for establishing
 *                                             WebRTC peer-to-peer connections across different networks.
 */
export interface AppSettings {
  username: string
  color: string
  language: string
  isMicrophoneEnabledOnConnect: boolean
  iceServers: IceServerConfig[]
}


