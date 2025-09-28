
// ===== Shipwright Shim MVP =====
// Connects OBS → Overlay + Local Dashboard (dashboard: 8788, overlay relay WS: 8787)

const OBSWebSocket = require("obs-websocket-js").OBSWebSocket;
const express = require("express");
const path = require("path");

const fs = require("fs");
const { promises: fsp } = fs;

// --- Runtime paths ---
const runtimeBase = path.join(__dirname, "runtime");
const runtimeLogs = path.join(runtimeBase, "logs");
const runtimeShots = path.join(runtimeBase, "shots");

// Make sure folders exist
fs.mkdirSync(runtimeLogs, { recursive: true });
fs.mkdirSync(runtimeShots, { recursive: true });

// ===== Simple JSONL Session Logger =====

// Use your existing runtimeLogs path from earlier setup
// const runtimeLogs = path.join(__dirname, "runtime", "logs"); // (already defined above)
const sessionId = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13); // e.g., 20250913T09
const logPath = path.join(runtimeLogs, `${sessionId}.jsonl`);

// in-memory counters for a quick /metrics
const metrics = {
  obs_connected: 0,
  obs_disconnected: 0,
  screenshot_ok: 0,
  screenshot_fail: 0,
  caption: 0,
  arrow: 0,
  overlay_sends: 0,
};

function logEvent(type, data = {}) {
  const rec = { ts: new Date().toISOString(), type, ...data };
  try {
    fs.appendFileSync(logPath, JSON.stringify(rec) + "\n");
  } catch (e) {
    console.error("logEvent append failed:", e.message);
  }
}

// Mardown summary generated as a short event breakdown table.
async function writeSessionSummary() {
  try {
    const file = path.join(runtimeLogs, `${sessionId}.jsonl`);
    const text = fs.readFileSync(file, "utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    const events = lines.map(l => JSON.parse(l));

    const first = events[0];
    const last = events[events.length - 1];

    // Count event types
    const counts = events.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {});

    // Build a small timeline preview (last 5 events)
    const recent = events.slice(-5).map(e => `| ${e.ts} | ${e.type} | ${Object.keys(e).filter(k => k !== "ts" && k !== "type").map(k => `**${k}**=${e[k]}`).join(", ")} |`);

    const md = [
      `# Shipwright Session ${sessionId}`,
      "",
      `**Start:** ${first?.ts || "n/a"}  `,
      `**End:** ${last?.ts || "n/a"}  `,
      "",
      "## Event Counts",
      "",
      "| Event Type | Count |",
      "|-----------|-------|",
      ...Object.entries(counts).map(([k,v]) => `| ${k} | ${v} |`),
      "",
      "## Recent Events (Preview)",
      "",
      "| Timestamp | Event | Details |",
      "|-----------|-------|---------|",
      ...recent,
      "",
      "_Full raw log available in the matching `.jsonl` file._",
      ""
    ].join("\n");

    const mdPath = path.join(runtimeLogs, `${sessionId}.md`);
    fs.writeFileSync(mdPath, md, "utf8");
    return mdPath;
  } catch (e) {
    console.error("writeSessionSummary failed:", e.message);
    return null;
  }
}

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
metrics.obs_connected++;
logEvent("obs_connected", { host: OBS_HOST, port: OBS_PORT });
  } catch (err) {
    console.error("❌ OBS connection failed:", err.message);
    setTimeout(connectOBS, 333); //=was 3000 // retry
  }
}
connectOBS();

obs.on("ConnectionClosed", () => {
  metrics.obs_disconnected++;
  logEvent("obs_disconnected");
});
obs.on("ConnectionError", (err) => {
  logEvent("obs_connection_error", { error: String(err?.message || err) });
});

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
metrics.overlay_sends++;
  logEvent("overlay_send", { msg });  
overlaySockets.forEach((ws) => {
    try { ws.send(JSON.stringify(msg)); } catch {}
  });
}

// ---- Serve dashboard ----
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => {
  res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Shipwright Dashboard</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 16px; }
      .stage { position: relative; display: inline-block; }
      #overlay { position: absolute; left: 0; top: 0; pointer-events: none; }
      #shot { display: block; }
      .row { margin-bottom: 10px; }
    </style>
  </head>
  <body>
    <h2>Shipwright Dashboard</h2>

    <div class="row">
      <button onclick="fetch('/arrow')">Drop Arrow</button>
      <input id="cap" placeholder="Caption text" style="width:280px">
      <button onclick="fetch('/caption?text=' + encodeURIComponent(document.getElementById('cap').value))">Show Caption</button>
      <button onclick="clearOverlay()">Clear Overlay</button>
    </div>

    <div class="stage">
      <img id="shot" width="800" height="480" alt="live">
      <canvas id="overlay" width="800" height="480"></canvas>
    </div>

    <script>
      const SHOT_INTERVAL_MS = ${SHOT_INTERVAL_MS};

      const shot = document.getElementById('shot');
      const cvs  = document.getElementById('overlay');
      const ctx  = cvs.getContext('2d');

      function tick(){ shot.src = '/screenshot?' + Date.now(); }
      setInterval(tick, SHOT_INTERVAL_MS);
      tick();

      function clearOverlay(){ ctx.clearRect(0, 0, cvs.width, cvs.height); }

      function drawArrow(x, y){
        const len = 60, head = 12;
        ctx.save();
        ctx.strokeStyle = 'red';
        ctx.fillStyle   = 'red';
        ctx.lineWidth   = 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y + len);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + len, y + len);
        ctx.lineTo(x + len - head, y + len - 4);
        ctx.lineTo(x + len - 4,   y + len - head);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      function drawCaption(text){
        const pad = 12, boxH = 48;
        ctx.save();
        ctx.clearRect(0, cvs.height - boxH, cvs.width, boxH);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, cvs.height - boxH, cvs.width, boxH);
        ctx.fillStyle = 'white';
        ctx.font = '20px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(text ?? '', pad, cvs.height - boxH/2);
        ctx.restore();
      }

      const ws = new WebSocket(\`ws://\${location.host}\`);
      ws.onopen    = () => console.log('Overlay WS connected');
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'overlay') {
            if (msg.shape === 'arrow')   drawArrow(msg.x ?? 200, msg.y ?? 200);
            if (msg.shape === 'caption') drawCaption(msg.text ?? '');
          }
        } catch (e) { console.error(e); }
      };
 ws.onclose   = () => console.log('Overlay WS disconnected');
    </script>
  </body>
</html>`);
});

// ---- API routes ----
app.get("/arrow", (_req, res) => {
logEvent("overlay_arrow", { x: 200, y: 200 });
  sendOverlay({ type: "overlay", shape: "arrow", x: 200, y: 200 });
  res.send("Arrow sent");
});

app.get("/caption", (req, res) => {
  const text = req.query.text || "";
metrics.caption++;
  logEvent("overlay_caption", { text });
  sendOverlay({ type: "overlay", shape: "caption", text });
  res.send("Caption sent: " + text);
});
app.get("/export", async (_req, res) => {
  try {
    const mdPath = await writeSessionSummary();
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const destDir = path.join(__dirname, "logs", yyyy, mm, dd);
    fs.mkdirSync(destDir, { recursive: true });

    const srcJson = path.join(runtimeLogs, `${sessionId}.jsonl`);
    const srcMd   = path.join(runtimeLogs, `${sessionId}.md`);
    const destJson = path.join(destDir, `${sessionId}.jsonl`);
    const destMd   = path.join(destDir, `${sessionId}.md`);

    fs.copyFileSync(srcJson, destJson);
    if (fs.existsSync(srcMd)) fs.copyFileSync(srcMd, destMd);

    logEvent("export_done", { destDir });
    res.send(`Exported to logs/${yyyy}/${mm}/${dd}/`);
  } catch (e) {
    logEvent("export_failed", { error: e.message });
    res.status(500).send("Export failed: " + e.message);
  }
});
app.get("/health", (_req, res) => {
  res.json({ ok: true, overlayClients: overlaySockets.length, sessionId });
});

app.get("/metrics", (_req, res) => {
  res.json({ sessionId, ...metrics });
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
metrics.screenshot_ok++;
    logEvent("screenshot_ok", { width: 800, height: 480 });    
res.writeHead(200, { "Content-Type": "image/png" });
    res.end(img);

  } catch (err) {
    console.error("Screenshot failed:", err.message);
metrics.screenshot_fail++;
    logEvent("screenshot_fail", { error: err.message });
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
