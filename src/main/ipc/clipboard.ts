import { ipcMain, clipboard } from "electron";

export function registerClipboardHandlers(): void {
  ipcMain.handle("clipboard:writeText", (_event, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle("clipboard:readText", () => {
    return clipboard.readText();
  });
}