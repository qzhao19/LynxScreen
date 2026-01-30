import { IceServerConfig } from "./webrtc-shared";

/**
 * Application settings configured by the user.
 *
 * This interface defines all user-configurable settings for the LynxScreen application,
 * including user identification, UI preferences, and WebRTC connectivity settings.
 *
 * @interface AppSettings
 * @property {string} username - The display name of the local user in the application.
 * @property {boolean} isMicrophoneEnabledOnConnect - Whether to automatically enable the microphone
 *                                                     when establishing a connection.
 * @property {IceServerConfig[]} iceServers - An array of ICE server configurations used for establishing
 *                                             WebRTC peer-to-peer connections across different networks.
 */
export interface AppSettings {
  username: string
  isMicrophoneEnabledOnConnect: boolean
  iceServers: IceServerConfig[];
}

