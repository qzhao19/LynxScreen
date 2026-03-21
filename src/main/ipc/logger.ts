import { ipcMain } from "electron";
import log from "electron-log";

const LOG_CHANNEL = "electron-log";

export function registerLoggerHandlers(): void {
  ipcMain.on(LOG_CHANNEL, (_event, level: string, ...args: unknown[]) => {
    const fn = (log as unknown as Record<string, unknown>)[level];
    if (typeof fn === "function") {
      (fn as (...a: unknown[]) => void)(...args);
    } else {
      log.info(...args);
    }
  });
}