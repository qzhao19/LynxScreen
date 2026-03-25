import { contextBridge } from "electron";
import { clipboardApi } from "./api/clipboard";
import { loggerApi } from "./api/logger";

try {
  contextBridge.exposeInMainWorld("electron", {
    clipboard: clipboardApi,
    logger: loggerApi
  });
} catch (error) {
  console.error("[preload] Failed to expose API", error);
}
