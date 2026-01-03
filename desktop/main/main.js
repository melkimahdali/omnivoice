// desktop/main/main.js
const { app, BrowserWindow, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");

let win;
let isTx = false;

function getArgValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

function setupProfilePaths() {
  const profile = getArgValue("profile") || process.env.OMNIVOICE_PROFILE || "default";
  const base = path.join(app.getPath("appData"), "OmniVoice-DevProfiles");
  const profileDir = path.join(base, profile);
  ensureDir(profileDir);

  app.setPath("userData", profileDir);
  app.setPath("cache", path.join(profileDir, "Cache"));
  return profile;
}

function resolveIdentity(profile) {
  // mapping yang kamu minta:
  // cmd1 => commander (idle, manual accept direct, bisa force connect)
  // 1 => unit-1
  // 2 => unit-2
  // 3 => unit-3
  if (String(profile) === "cmd1") {
    return { role: "commander", label: "commander", profileKey: "cmd1" };
  }
  if (String(profile) === "1") return { role: "unit", label: "unit-1", profileKey: "1" };
  if (String(profile) === "2") return { role: "unit", label: "unit-2", profileKey: "2" };
  if (String(profile) === "3") return { role: "unit", label: "unit-3", profileKey: "3" };

  // fallback
  return { role: "unit", label: `unit-${String(profile)}`, profileKey: String(profile) };
}

function pickHotkey(profileKey, role) {
  // commander hotkey beda biar aman
  if (role === "commander") return "Control+Shift+Space";
  // unit default
  if (profileKey === "2") return "Control+Alt+Space"; // boleh sama, tapi beda instance tetap ok
  return "Control+Alt+Space";
}

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 740,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: "#050812",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "..", "preload", "preload.js"),
    },
  });

  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

app.whenReady().then(() => {
  const profile = setupProfilePaths();
  const ident = resolveIdentity(profile);

  createWindow();

  const shortcut = pickHotkey(ident.profileKey, ident.role);
  const ok = globalShortcut.register(shortcut, () => {
    isTx = !isTx;
    if (win && win.webContents) win.webContents.send("ptt-toggle", isTx);
  });

  const sendShortcutInfo = () => {
    if (!win || !win.webContents) return;
    win.webContents.send("shortcut-info", {
      ok,
      shortcut,
      profile: ident.profileKey,
      role: ident.role,
      displayName: ident.label
    });
  };

  win.webContents.once("did-finish-load", sendShortcutInfo);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
