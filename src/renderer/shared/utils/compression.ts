/**
 * Compresses JSON data to a Base64-encoded string using Gzip
 * @param data - The data to compress
 * @returns Promise resolving to the compressed Base64 string
 * @throws Error if compression fails
 */
export async function compressJson<T>(data: T): Promise<string> {
  const jsonString = JSON.stringify(data);
  const encoder = new TextEncoder();
  const inputBytes = encoder.encode(jsonString);

  const compressedStream = new Blob([inputBytes])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));

  const compressedBuffer = await new Response(compressedStream).arrayBuffer();
  const compressedBytes = new Uint8Array(compressedBuffer);

  // Convert bytes to Base64
  return bytesToBase64(compressedBytes);
}

/**
 * Decompresses a Base64-encoded Gzip string to JSON data
 * @param base64Data - Base64-encoded compressed string
 * @returns Promise resolving to the decompressed data
 * @throws Error if decompression or JSON parsing fails
 */
export async function decompressJson<T>(base64Data: string): Promise<T> {
  const compressedBytes = base64ToBytes(base64Data);

  const decompressedStream = new Blob([compressedBytes.slice()])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));

  const decompressedText = await new Response(decompressedStream).text();

  return JSON.parse(decompressedText) as T;
}

/**
 * Converts a Uint8Array to a Base64 string
 * Handles large arrays by chunking to avoid call stack size exceeded errors
 * @param bytes - The byte array to convert
 * @returns Base64-encoded string
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000; // 32KB chunks to avoid stack overflow
  const chunks: string[] = [];

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    chunks.push(String.fromCharCode(...chunk));
  }

  return btoa(chunks.join(""));
}

/**
 * Converts a Base64 string to a Uint8Array
 * @param base64 - The Base64 string to convert
 * @returns Decoded byte array
 */
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}