import log from "electron-log";

/**
 * Copies text to clipboard with fallbacks for Electron and browser environments.
 * Prioritizes Electron clipboard, then navigator.clipboard.
 * 
 * @param text - Text to copy
 * @returns Promise that resolves when copied successfully
 */
export async function copyToClipboard(text: string): Promise<void> {
  // Try use Electron clipboard
  try {
    const electronClipboard = (globalThis as any).electron?.clipboard;
    if (electronClipboard?.writeText) {
      electronClipboard.writeText(text);
      log.debug("[Clipboard] Copied via Electron clipboard");
      return;
    }
  } catch (error) {
    log.warn("[Clipboard] Electron clipboard unavailable: ", error);
  }

  // Try use navigator.clipboard
  try {
    await navigator.clipboard.writeText(text);
    log.debug("[Clipboard] Copied via navigator.clipboard");
    return;
  } catch (error) {
    log.warn("[Clipboard] navigator.clipboard failed:", error);
  }

  // All methods failed - throw error
  const error = "All clipboard methods failed. Clipboard access may be restricted.";
  log.error(`[Clipboard] ${error}`);
  throw new Error(error);
}

/**
 * Reads text from clipboard
 * Prioritizes Electron clipboard, then navigator.clipboard.
 * 
 * @returns Promise resolving to clipboard text or null if failed
 */
export async function readFromClipboard(): Promise<string | null> {
  // Try use Electron clipboard
  try {
    const electronClipboard = (globalThis as any).electron?.clipboard;
    if (electronClipboard?.readText) {
      const text = electronClipboard.readText();
      log.debug("[Clipboard] Read via Electron clipboard");
      return text;
    }
  } catch (error) {
    log.warn("[Clipboard] Electron clipboard unavailable:", error);
  }

  // Try use navigator.clipboard
  try {
    const text = await navigator.clipboard.readText();
    log.debug("[Clipboard] Read via navigator.clipboard");
    return text;
  } catch (error) {
    log.warn("[Clipboard] navigator.clipboard failed:", error);
    return null;
  }
}



