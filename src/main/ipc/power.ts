import { ipcMain, powerSaveBlocker } from "electron";
import log from "electron-log";

// Track power save blocker ID so we can stop it later
let powerBlockerId: number | null = null;

export function registerPowerHandlers(): void {
  ipcMain.handle("power:preventAppSuspension", () => {
    if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
      return; // already active
    }
    powerBlockerId = powerSaveBlocker.start("prevent-app-suspension");
    log.info(`[Power] App suspension prevention started (id: ${powerBlockerId})`);
  });

  ipcMain.handle("power:allowAppSuspension", () => {
    if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
      powerSaveBlocker.stop(powerBlockerId);
      log.info(`[Power] App suspension prevention stopped (id: ${powerBlockerId})`);
    }
    powerBlockerId = null;
  });
}