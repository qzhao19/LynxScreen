import { contextBridge } from "electron";
import { clipboardApi } from "./api/clipboard";
import { loggerApi } from "./api/logger";

contextBridge.exposeInMainWorld("electron", {
  clipboard: clipboardApi,
  logger: loggerApi
});