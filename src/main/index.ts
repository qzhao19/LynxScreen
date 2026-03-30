import { app, BrowserWindow, session, desktopCapturer } from "electron";
import path from "path";
import log from "electron-log";
import { registerIpcHandlers } from "./ipc/index";

log.initialize();

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Prevent macOS from throttling WebRTC frame in the background
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  // Allow renderer to use getDisplayMedia for screen capture
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ["screen", "window"] }).then((sources) => {
      // Grant the first screen source automatically, or let Chromium show its picker
      if (sources.length > 0) {
        callback({ video: sources[0] });
      } else {
        callback({});
      }
    });
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile("dist/index.html");
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});