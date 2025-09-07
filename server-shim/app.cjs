// ===== Shipwright Shim MVP =====
// Connects OBS → Overlay + Local Dashboard (dashboard: 8788, overlay relay WS: 8787)

const OBSWebSocket = require("obs-websocket-js").OBSWebSocket;
const express = require("express");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
require("dotenv").config();

const obs = new OBSWebSocket();
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 8788;         // dashboard
const RELAY_PORT = 8787;   // overlay relay (websocket)

// ---- Load settings from .env ----
const {
  OBS_HOST = "localhost",
  OBS_PORT = 4455,
  OBS_PASSWORD = "shipwright123",
  OBS_SOURCE_NAME = "blender",   // <— key change: default to "blender"
  SHOT_INTERVAL_MS = 333, //=was 3000
} = process.env;

// ---- Connect to OBS ----
async function connectOBS() {
  try {
    await obs.connect(`ws://${OBS_HOST}:${OBS_PORT}`, OBS_PASSWORD);
    console.log("✅ Connected to OBS WebSocket");
  } catch (err) {
    console.error("❌ OBS connection failed:", err.message);
    setTimeout(connectOBS, 333); //=was 3000 // retry
  }
}
connectOBS();

// ---- Relay overlay commands to browser overlay ----
let overlaySockets = [];
wss.on("connection", (ws) => {
  overlaySockets.push(ws);
  console.log("Overlay client connected");
  ws.on("close", () => {
    overlaySockets = overlaySockets.filter((s) => s !== ws);
    console.log("Overlay client disconnected");
  });
});

function sendOverlay(msg) {
  overlaySockets.forEach((ws) => {
    try { ws.send(JSON.stringify(msg)); } catch {}
  });
}

// ---- Serve dashboard ----
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => {
  res.send(`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Shipwright Dashboard</title></head>
  <body>
    <h2>Shipwright Dashboard</h2>
    <button onclick="fetch('/arrow')">Drop Arrow</button>
    <input id="cap" placeholder="Caption text">
    <button onclick="fetch('/caption?text=' + encodeURIComponent(document.getElementById('cap').value))">
      Show Caption
    </button>
    <div><img id="shot" width="640" alt="live screenshot will appear here"></div>
    <script>
      function tick(){
        document.getElementById('shot').src = '/screenshot?' + Date.now();
      }
      setInterval(tick, ${SHOT_INTERVAL_MS});
      tick();
    </script>
  </body>
</html>`);
});

// ---- API routes ----
app.get("/arrow", (_req, res) => {
  sendOverlay({ type: "overlay", shape: "arrow", x: 200, y: 200 });
  res.send("Arrow sent");
});

app.get("/caption", (req, res) => {
  const text = req.query.text || "";
  sendOverlay({ type: "overlay", shape: "caption", text });
  res.send("Caption sent: " + text);
});

// ---- Screenshot capture ----
app.get("/screenshot", async (_req, res) => {
  try {
    const { imageData } = await obs.call("GetSourceScreenshot", {
      sourceName: OBS_SOURCE_NAME,   // <— use value from .env
      imageFormat: "png",
      imageWidth: 800, //= was 1280
      imageHeight: 480, //= was 720
    });
    const img = Buffer.from(imageData.replace(/^data:image\/png;base64,/, ""), "base64");
    res.writeHead(200, { "Content-Type": "image/png" });
    res.end(img);
  } catch (err) {
    console.error("Screenshot failed:", err.message);
    res.status(500).send("Screenshot failed: " + err.message);
  }
});

// ---- Start servers ----
server.listen(PORT, () => {
  console.log(`  Dashboard http://localhost:${PORT}`);
});

const relayServer = new WebSocket.Server({ port: RELAY_PORT });
relayServer.on("connection", () => console.log("Overlay relay connected"));
console.log(`  Overlay relay on ws://localhost:${RELAY_PORT}`);
