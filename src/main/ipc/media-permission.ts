// src/main/ipc/media-permission.ts
import { ipcMain, systemPreferences } from "electron";

export function registerMediaPermissionHandlers(): void {
  // Check current microphone permission status (macOS only)
  ipcMain.handle("media:getMicrophoneStatus", () => {
    if (process.platform === "darwin") {
      return systemPreferences.getMediaAccessStatus("microphone");
      // Returns: "not-determined" | "granted" | "denied" | "restricted" | "unknown"
    }
    return "granted"; // Other platforms don't need explicit permission
  });

  // Request microphone permission (macOS only)
  ipcMain.handle("media:requestMicrophoneAccess", async () => {
    if (process.platform === "darwin") {
      return await systemPreferences.askForMediaAccess("microphone");
      // Returns: true if granted, false if denied
    }
    return true;
  });

  // Screen capture permission cannot be requested programmatically on macOS.
  // getDisplayMedia() triggers the OS prompt automatically.
  // We can only check the status:
  ipcMain.handle("media:getScreenCaptureStatus", () => {
    if (process.platform === "darwin") {
      return systemPreferences.getMediaAccessStatus("screen");
    }
    return "granted";
  });
}