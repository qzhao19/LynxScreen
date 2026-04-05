import { WebRTCConnectionConfig } from "../types/index";
import { DEFAULT_ICE_SERVERS } from "../constants/index";

/**
 * Get default WebRTC connection configuration.
 * @returns {WebRTCConnectionConfig} Default configuration with public STUN servers
 */
export function getDefaultWebRTCConnectionConfig(): WebRTCConnectionConfig {
  return {
    iceServers: DEFAULT_ICE_SERVERS
  };
}