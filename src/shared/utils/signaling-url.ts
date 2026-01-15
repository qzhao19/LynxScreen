import log from "electron-log";
import { PeerRole } from "../types/index";
import { URL_PROTOCOL } from "../constants/index";

/**
 * Converts standard Base64 to URL-safe format
 */
const toUrlSafeBase64 = (base64: string) => {
  return base64.replace(/\+/g, "-")
               .replace(/\//g, "_")
               .replace(/=+$/g, "");
};
  
/**
 * Converts URL-safe Base64 back to standard format
 */
const fromUrlSafeBase64 = (urlSafe: string) => {
  const std = urlSafe.replace(/-/g, "+")
                     .replace(/_/g, "/");
  return std + "=".repeat((4 - (std.length % 4)) % 4);
};

/**
 * Converts Uint8Array to string in chunks to avoid stack overflow
 */
function uint8ArrayToString(uint8Array: Uint8Array): string {
  const chunkSize = 65536;
  let result = "";
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    result += String.fromCharCode(...uint8Array.slice(i, i + chunkSize));
  }
  return result;
}

/**
 * Extracts action (share/watch) from URL
 * Handles both hostname-based and pathname-based URLs
 */
function extractActionFromUrl(parsedUrl: URL): string {
  // For lynxscreen://share?..., hostname is "share", pathname is ""
  // For lynxscreen:///share?..., hostname is "", pathname is "/share"
  if (parsedUrl.hostname) {
    return parsedUrl.hostname;
  }
  // Remove leading slash if present
  return parsedUrl.pathname.replace(/^\//, "");
}

/**
 * Compresses SDP string using gzip and returns URL-safe Base64
 * Falls back to simple Base64 encoding if CompressionStream is unavailable
 */
async function compressSdp(sdp: string): Promise<string> {
  try {
    if (typeof CompressionStream === "undefined") {
      throw new Error("CompressionStream not supported");
    }

    // Compress using gzip
    const stream = new Blob([sdp], { type: "text/plain" }).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
    const compressedResponse = new Response(compressedStream);
    const blob = await compressedResponse.blob();
    const buffer = await blob.arrayBuffer();

    if (buffer.byteLength > 100000) {
      log.warn("[SignalingURL] Compressed data exceeds 100KB, URL may be too long");
    }

    // Convert to URL-safe base64
    const uint8Array = new Uint8Array(buffer);
    const binaryString = uint8ArrayToString(uint8Array);
    const base64 = btoa(binaryString);

    log.debug(`[SignalingURL] Compressed ${sdp.length} → ${buffer.byteLength} bytes.`);

    return toUrlSafeBase64(base64);

  } catch (error) {
    log.warn("[SignalingURL] Compression failed, using fallback encoding:", error);
    try {
      const base64 = btoa(encodeURIComponent(sdp));
      return toUrlSafeBase64(base64);
    } catch (fallbackError) {
      log.error("[SignalingURL] Fallback encoding failed:", fallbackError);
      throw new Error("Failed to encode data");
    }
  }
}

/**
 * Decompresses URL-safe Base64 SDP string
 */
async function decompressSdp(token: string): Promise<string> {
  try {
    // Convert to standard base64 string
    const standardBase64 = fromUrlSafeBase64(token);
    const binaryString = atob(standardBase64);
    const uint8Array = Uint8Array.from(binaryString, char => char.charCodeAt(0));
    const buffer = uint8Array.buffer;

    // Check if DecompressionStream exists
    if (typeof DecompressionStream === "undefined") {
      throw new Error("DecompressionStream not supported");
    }

    // Decompress standard base64 string
    const stream = new Blob([buffer]).stream();
    const decompressedStream = stream.pipeThrough(new DecompressionStream("gzip"));
    const decompressedResponse = new Response(decompressedStream);
    const result = await decompressedResponse.text();
    log.debug(`[SignalingURL] Decompressed SDP ${buffer.byteLength} → ${result.length} bytes`);
    return result;
  } catch (error) {
    log.warn("[SignalingURL] SDP decompression failed, trying fallback:", error);
    try {
      const standardBase64 = fromUrlSafeBase64(token);
      return decodeURIComponent(atob(standardBase64));
    } catch (fallbackError) {
      log.error("[SignalingURL] SDP fallback decoding failed:", fallbackError);
      throw new Error("Failed to decode SDP");
    }
  } 
}

/**
 * Encodes connection data into a shareable URL
 * lynxscreen://share?username=<username>&data=<compressed_sdp>
 * 
 * @param role - The role of the peer creating this URL
 * @param username - User's display name
 * @param sdp - The RTCSessionDescription (offer or answer)
 * @returns Encoded URL string
 */
export async function encodeConnectionUrl(
  role: PeerRole,
  username: string,
  sdp: RTCSessionDescriptionInit
): Promise<string> {
  if (!username || !sdp?.sdp) {
    throw new Error("Invalid username or SDP");
  }

  // Compress the SDP info
  const compressedSdp = await compressSdp(sdp.sdp);
  
  // Build URL with query params
  const action = role === PeerRole.SCREEN_SHARER ? "share" : "watch";
  const url = new URL(`${URL_PROTOCOL}${action}`);
  url.searchParams.set("username", encodeURIComponent(username));
  url.searchParams.set("token", compressedSdp);

  const finalUrl = url.toString();
  log.info(`[SignalingURL] Generated ${action} URL (${finalUrl.length} characters)`);

  // Warn if URL is too long
  if (finalUrl.length > 2000) {
    log.warn(`[SignalingURL] URL length (${finalUrl.length}) may cause issues`);
  }
  return finalUrl;
}


/**
 * Decodes a connection URL back to its components
 * 
 * @param url - The encoded URL string
 * @returns Promise resolving to { role, username, sdp } or null if invalid
 */
export async function decodeConnectionUrl(url: string): Promise<{
  role: PeerRole;
  username: string;
  sdp: RTCSessionDescriptionInit;
} | null> {
  try {
    const parsedUrl = new URL(url);

    // Validate role from path
    if (parsedUrl.protocol !== `${URL_PROTOCOL.slice(0, -2)}:`) {
      log.error("[SignalingURL] Invalid URL protocol");
      return null;
    }

    // Extract and validate action
    const action = extractActionFromUrl(parsedUrl);
    if (!["share", "watch"].includes(action)) {
      log.error("[SignalingURL] Invalid URL action:", action);
      return null;
    }

    // Determine role from action
    const role = action === "share" ? PeerRole.SCREEN_SHARER : PeerRole.SCREEN_WATCHER;

    // Extract username and compressed sdp from query params
    const username = parsedUrl.searchParams.get("username");
    const compressedSdp = parsedUrl.searchParams.get("token");

    if (!username || !compressedSdp) {
      log.error("[SignalingURL] Missing username or data in URL");
      return null;
    }

    // Decompress SDP
    const sdpString = await decompressSdp(compressedSdp);
    const sdp: RTCSessionDescriptionInit = {
      type: role === PeerRole.SCREEN_SHARER ? "offer" : "answer",
      sdp: sdpString,
    };

    log.info(`[SignalingURL] Successfully decoded URL for ${role} (${username})`);
    return { role, username: decodeURIComponent(username), sdp };

  } catch (error) {
    log.error("[SignalingURL] Failed to decode URL:", error);
    return null;
  }
}

/**
 * Validates if a string is a valid LynxScreen connection URL
 */
export function isValidConnectionUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    
    // Check protocol
    if (parsedUrl.protocol !== `${URL_PROTOCOL.slice(0, -2)}:`) {
      return false;
    }

    // Check action
    const action = extractActionFromUrl(parsedUrl);
    if (!["share", "watch"].includes(action)) {
      return false;
    }

    return !!parsedUrl.searchParams.get("username") &&
           !!parsedUrl.searchParams.get("token");
  } catch {
    return false;
  }
}

/**
 * Gets the peer role from a URL without full decoding
 */
export function getRoleFromUrl(url: string): PeerRole | null {
  try {
    const parsedUrl = new URL(url);
    const action = extractActionFromUrl(parsedUrl);
    if (action === "share") return PeerRole.SCREEN_SHARER;
    if (action === "watch") return PeerRole.SCREEN_WATCHER;
    return null;
  } catch {
    return null;
  }
}

