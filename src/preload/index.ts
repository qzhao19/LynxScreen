import { contextBridge } from "electron";
import { clipboardApi } from "./api/clipboard";
import { loggerApi } from "./api/logger";
import { powerApi } from "./api/power";
import { mediaPermissionApi } from "./api/media-permission";

try {
  contextBridge.exposeInMainWorld("electron", {
    clipboard: clipboardApi,
    logger: loggerApi,
    power: powerApi,
    mediaPermission: mediaPermissionApi
  });
} catch (error) {
  console.error("[preload] Failed to expose API", error);
}
