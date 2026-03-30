import { ipcRenderer } from "electron";

export const powerApi = {
  preventAppSuspension: (): Promise<void> => {
    return ipcRenderer.invoke("power:preventAppSuspension");
  },
  allowAppSuspension: (): Promise<void> => {
    return ipcRenderer.invoke("power:allowAppSuspension");
  }
};