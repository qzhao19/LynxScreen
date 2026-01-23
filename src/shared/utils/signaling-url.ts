import log from "electron-log";
import { PeerRole } from "../types/index";
import { URL_PROTOCOL } from "../constants/index";

/**
 * Encoding scheme prefix
 */
const ENCODING_PREFIX = {
  GZIP: "gz:",
  FALLBACK: "fb:",
};

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
 * Fallback compression algorithm
 */
function compressSdpFallback(sdp: string): string {
  const base64 = btoa(encodeURIComponent(sdp));
  const urlSafeBase64 = toUrlSafeBase64(base64);
  return ENCODING_PREFIX.FALLBACK + urlSafeBase64;
}

/**
 * Gzip compression algorithm
 */
async function compressSdpGzip(sdp: string): Promise<string> {
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
  const urlSafeBase64 = toUrlSafeBase64(base64);

  log.debug(`[SignalingURL] Compressed ${sdp.length} → ${buffer.byteLength} bytes.`);

  return ENCODING_PREFIX.GZIP + urlSafeBase64;
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
    return await compressSdpGzip(sdp);

  } catch (error) {
    log.warn("[SignalingURL] Compression failed, using fallback encoding:", error);
    try {
      return compressSdpFallback(sdp);
    } catch (fallbackError) {
      log.error("[SignalingURL] Fallback encoding failed:", fallbackError);
      throw new Error("Failed to encode data");
    }
  }
}

/**
 * Fallback decompression algorithm
 */
function decompressSdpFallback(token: string): string {
  const standardBase64 = fromUrlSafeBase64(token);
  const decoded = atob(standardBase64);
  return decodeURIComponent(decoded);
}

/**
 * Gzip decompression algorithm
 */
async function decompressSdpGzip(token: string): Promise<string> {
  const standardBase64 = fromUrlSafeBase64(token);
  const binaryString = atob(standardBase64);
  const uint8Array = Uint8Array.from(binaryString, char => char.charCodeAt(0));
  const buffer = uint8Array.buffer;

  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream not supported");
  }

  const stream = new Blob([buffer]).stream();
  const decompressedStream = stream.pipeThrough(new DecompressionStream("gzip"));
  const decompressedResponse = new Response(decompressedStream);
  const result = await decompressedResponse.text();
  
  log.debug(`[SignalingURL] Gzip decompressed ${buffer.byteLength} → ${result.length} bytes`);
  return result;
}

/**
 * Decompresses URL-safe Base64 SDP string
 */
async function decompressSdp(token: string): Promise<string> {

  // Check for Gzip prefix
  if (token.startsWith(ENCODING_PREFIX.GZIP)) {
    try {
      return await decompressSdpGzip(token.slice(ENCODING_PREFIX.GZIP.length));
    } catch (error) {
      log.error("[SignalingURL] Explicit Gzip decompression failed:", error);
      throw error;
    }
  }

  // Check for Fallback prefix
  if (token.startsWith(ENCODING_PREFIX.FALLBACK)) {
    try {
      return decompressSdpFallback(token.slice(ENCODING_PREFIX.FALLBACK.length));
    } catch (error) {
      log.error("[SignalingURL] Explicit Fallback decoding failed:", error);
      throw error;
    }
  }

  // Auto-detect decompression
  try {
    return await decompressSdpGzip(token);
  } catch {
    // Gzip failed, try fallback
    try {
      return decompressSdpFallback(token);
    } catch (error) {
      log.error("[SignalingURL] Auto-detection failed:", error);
      throw new Error("Failed to decode SDP (auto-detect)");
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
  url.searchParams.set("type", sdp.type);

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

    // Validate protocol from path
    if (parsedUrl.protocol !== URL_PROTOCOL.replace("://", ":")) {
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

    // Check SDP type should be aligned with role
    const sdpType = parsedUrl.searchParams.get("type") as RTCSdpType | null;
    const expectedSdpType = role === PeerRole.SCREEN_SHARER ? "offer" : "answer";

    if (!sdpType || (sdpType && sdpType !== expectedSdpType)) {
      log.error("[SignalingURL] SDP type mismatch with role");
      return null;
    }

    // Decompress SDP
    const sdpString = await decompressSdp(compressedSdp);
    const sdp: RTCSessionDescriptionInit = {
      type: sdpType,
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
    if (parsedUrl.protocol !== URL_PROTOCOL.replace("://", ":")) {
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

