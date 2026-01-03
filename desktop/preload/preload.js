// desktop/preload/preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("omnivoice", {
  onPttToggle: (cb) => ipcRenderer.on("ptt-toggle", (_evt, v) => cb(v)),
  onShortcutInfo: (cb) => ipcRenderer.on("shortcut-info", (_evt, v) => cb(v)),
});
