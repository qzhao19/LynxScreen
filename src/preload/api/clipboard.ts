import { ipcRenderer } from "electron";

export const clipboardApi = {
  writeText: (text: string): Promise<void> => {
    return ipcRenderer.invoke("clipboard:writeText", text);
  },
  readText: (): Promise<string> => {
    return ipcRenderer.invoke("clipboard:readText");
  }
};