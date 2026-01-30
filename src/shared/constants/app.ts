import { AppSettings } from "../types/index";

// Default app settings
export const DEFAULT_APP_SETTINGS: AppSettings = {
  username: "User",
  isMicrophoneEnabledOnConnect: false,
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};