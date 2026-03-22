import { ipcRenderer } from "electron";

const LOG_CHANNEL = "electron-log";

function createLogger(level: string) {
  return (...args: unknown[]) => {
    ipcRenderer.send(LOG_CHANNEL, level, ...args);
  };
}

export const loggerApi = {
  info: createLogger("info"),
  warn: createLogger("warn"),
  error: createLogger("error"),
  debug: createLogger("debug"),
  verbose: createLogger("verbose"),
  silly: createLogger("silly")
};