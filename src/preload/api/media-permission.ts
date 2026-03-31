import { ipcRenderer } from "electron";

export const mediaPermissionApi = {
  getMicrophoneStatus: (): Promise<string> => {
    return ipcRenderer.invoke("media:getMicrophoneStatus");
  },
  requestMicrophoneAccess: (): Promise<boolean> => {
    return ipcRenderer.invoke("media:requestMicrophoneAccess");
  },
  getScreenCaptureStatus: (): Promise<string> => {
    return ipcRenderer.invoke("media:getScreenCaptureStatus");
  }
};
