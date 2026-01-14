import { IceServerConfig } from "../types/index";

/**
 * Default WebRTC ICE server configurations.
 * Uses public STUN servers for basic NAT traversal.
 * @constant
 */
export const DEFAULT_ICE_SERVERS: IceServerConfig[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" }
];


/**
 * URL-based signaling service for serverless P2P WebRTC connection.
 * Encodes/decodes SDP offer and answer into shareable URLs.
 */
export const URL_PROTOCOL = "lynxscreen://";