const { app, BrowserWindow, dialog } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const indexPath = path.join(appRoot, "index.html");
let server;

function startLocalServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((request, response) => {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end();
        return;
      }

      const requestPath = new URL(request.url, "http://127.0.0.1").pathname;
      if (requestPath !== "/" && requestPath !== "/index.html") {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      fs.createReadStream(indexPath)
        .on("error", (error) => {
          console.error("Could not read VoiceScript:", error);
          if (!response.headersSent) response.writeHead(500);
          response.end("Could not open VoiceScript.");
        })
        .pipe(response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        }));
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

async function createWindow() {
  const port = await startLocalServer();
  const window = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    title: "VoiceScript",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  await window.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.voicescript.desktop");
  try {
    await createWindow();
  } catch (error) {
    console.error("Could not start VoiceScript:", error);
    await dialog.showMessageBox({
      type: "error",
      title: "VoiceScript could not start",
      message: "VoiceScript could not open its local app window.",
      detail: error.message,
    });
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => server?.close());
