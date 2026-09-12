const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("planerDesktop", {
  platform: "desktop",
  webdav: (opts) => ipcRenderer.invoke("webdav-request", opts),
  saveSecret: (password) => ipcRenderer.invoke("cloud-save-secret", password),
  loadSecret: () => ipcRenderer.invoke("cloud-load-secret"),
});
