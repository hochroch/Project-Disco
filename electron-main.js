import { app, BrowserWindow, Tray, Menu, nativeImage, screen } from "electron";
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let win  = null;
let tray = null;
let serverProcess = null;

// ── BACKEND ────────────────────────────────────────────────────────────────
function startBackend() {
  const nodeExec = process.execPath;
  serverProcess = spawn(nodeExec, [path.join(__dirname, "server.js")], {
    env: { ...process.env },
    stdio: "pipe",
  });
  serverProcess.stdout?.on("data", d => process.stdout.write(`[server] ${d}`));
  serverProcess.stderr?.on("data", d => process.stderr.write(`[server] ${d}`));
  serverProcess.on("exit", code => console.log(`[server] exited (${code})`));
}

// ── WINDOW ─────────────────────────────────────────────────────────────────
function createWindow() {
  const { height, width } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width:       440,
    height:      height,
    x:           width - 440,
    y:           0,
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    resizable:   true,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
    },
  });

  // Dev: load Vite dev server. Prod: load built dist.
  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "dist", "index.html"));
  }

  win.on("closed", () => { win = null; });
}

// ── TRAY ───────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, "assets", "icon.png");
  const icon = existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    {
      label: "Show / Hide",
      click: () => win?.isVisible() ? win.hide() : win?.show(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => { app.isQuitting = true; app.quit(); },
    },
  ]);

  tray.setToolTip("Interview Copilot");
  tray.setContextMenu(menu);
  tray.on("click", () => win?.isVisible() ? win.hide() : win?.show());
}

// ── LIFECYCLE ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startBackend();
  createWindow();
  createTray();
});

app.on("before-quit", () => {
  serverProcess?.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
