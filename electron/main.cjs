const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

const WEBDAV_BASE = "https://webdav.cloud.mail.ru";

function secretPath() {
  return path.join(app.getPath("userData"), "cloud-secret.bin");
}

ipcMain.handle("cloud-save-secret", (_event, password) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    const encrypted = safeStorage.encryptString(String(password || ""));
    fs.writeFileSync(secretPath(), encrypted);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("cloud-load-secret", () => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return "";
    const file = secretPath();
    if (!fs.existsSync(file)) return "";
    return safeStorage.decryptString(fs.readFileSync(file));
  } catch {
    return "";
  }
});

ipcMain.handle("webdav-request", async (_event, payload) => {
  const method = String(payload?.method || "GET").toUpperCase();
  const urlPath = String(payload?.urlPath || "");
  if (!urlPath.startsWith("/") || urlPath.includes("://") || urlPath.includes("..")) {
    return { status: 400, body: "bad path" };
  }
  const user = String(payload?.user || "");
  const pass = String(payload?.pass || "");
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    "User-Agent": "Pulse/0.4.8",
    Overwrite: "T",
  };
  const body = payload?.body == null ? undefined : String(payload.body);
  if (body != null) headers["Content-Type"] = "application/json; charset=utf-8";
  const response = await fetch(WEBDAV_BASE + urlPath, { method, headers, body });
  return { status: response.status, body: await response.text() };
});

const windowIcon = path.join(__dirname, "../icons/desktop.ico");

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "Pulse",
    icon: windowIcon,
    backgroundColor: "#f3eee4",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, "../index.html"));
}

app.setAppUserModelId("local.planer.app");

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
