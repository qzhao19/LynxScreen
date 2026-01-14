import { PeerRole, UrlData, ConnectionData } from "../types/index";
import { URL_PROTOCOL } from "../constants/index";

function compress(input: string): string {
  try {
    // Use built-in compression if available (modern browsers)
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    
    // Simple base64 encoding with URL-safe characters
    const base64 = btoa(String.fromCharCode(...data))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    
    return base64;
  } catch {
    // Fallback to simple base64
    return btoa(encodeURIComponent(input))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
}

/**
 * Encodes connection data into a shareable URL
 * 
 * @param role - The role of the peer creating this URL
 * @param connectionData - User connection metadata
 * @param sdp - The RTCSessionDescription (offer or answer)
 * @returns Encoded URL string
 */
export function encodeConnectionUrl(
  role: PeerRole,
  connectionData: ConnectionData,
  sdp: RTCSessionDescriptionInit
): string {
  const urlData: UrlData = {
    role,
    data: connectionData,
    rtcSessionDescription: sdp
  };

  const jsonString = JSON.stringify(urlData);
  const compressed = compress(jsonString);
  
  const action = role === PeerRole.SCREEN_SHARER ? "share" : "watch";
  return `${URL_PROTOCOL}${action}/${compressed}`;
}

