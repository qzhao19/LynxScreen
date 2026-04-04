import { IceServerConfig } from "./webrtc-service";

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

// Page type definition - Update page names
export type PageType = "home" | "watch" | "share" | "active-sharing" | "settings";

// Session state interface
export interface SessionState {
  isActive: boolean;
  sessionUrl: string;
  watcherUrl: string;
  duration: number;
  status: "idle" | "waiting" | "connected" | "error";
}

// Toast message interface
export interface ToastMessage {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}