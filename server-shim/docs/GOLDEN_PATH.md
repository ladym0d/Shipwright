# 🚀 Shipwright Golden Path Checklist

## ✅ Pre-Session Setup (One-Time)
- [ ] Open OBS with the `blender` source loaded.
- [ ] Start AutoHotkey (double-click `shipwright-hotkeys.ahk` on Desktop).
- [ ] Confirm hotkeys:
  - F8 = arrow
  - F9 = mark
  - Ctrl+Shift+C = caption

---

## 🟢 1) Start Server
- [ ] Open **Git Bash #1**
- [ ] `cd ~/shipwright/server-shim`
- [ ] `node app.cjs`
- [ ] Confirm output shows connected to OBS and dashboard running.

---

## 🟢 2) Health Check
- [ ] Open **Git Bash #2**
- [ ] `cd ~/shipwright`
- [ ] `curl http://localhost:8788/health`
- [ ] Confirm `{"ok":true,...}` is returned.

---

## 🟢 3) Open Dashboard
- [ ] Go to `http://localhost:8788` in a browser.
- [ ] Confirm screenshot refreshes every ~333ms.

---

## 🟢 4) Start Session Log
- [ ] Press **F9** (Mark event). 
- [ ] (Optional) Verify with `tail -n 5 server-shim/runtime/logs/*.jsonl`

---

## 🟢 5) Do Blender Work
- [ ] Move or add an object, change a mode, etc. (anything for log activity).

---

## 🟢 6) Trigger Overlay Events
- [ ] F8 → drop arrow (or click dashboard button)
- [ ] Ctrl+Shift+C → caption (or type + click dashboard button)
- [ ] (Optional) Clear overlay

---

## 🟢 7) Export Session
- [ ] In Git Bash #2: `curl http://localhost:8788/export`
- [ ] Confirm `logs/YYYY/MM/DD/` created with `.jsonl` and `.md`

---

## 🟢 8) Commit + Push
```bash
git add logs
git commit -m "Golden Path run: session export"
git push
```

---

## 🟢 9) Capture Screenshot (Optional)
```bash
mkdir -p public/shots
curl http://localhost:8788/screenshot --output public/shots/session-$(date +%F).png
git add public/shots/session-$(date +%F).png
git commit -m "Add curated screenshot for $(date +%F)"
git push
```

---

## 🟢 10) Verify on GitHub
- [ ] Open repo → confirm logs folder + screenshot present.
- [ ] Open `.md` file → check counters + table.

---

## 🟢 11) Post to Bluesky (Optional)
- [ ] Copy text:
```
🚀 Shipwright Golden Path – YYYY-MM-DD
✔ Hotkey overlay events (F8 arrow, F9 mark, Ctrl+Shift+C caption)
✔ Log export + GitHub commit
📄 Full log: github.com/YOUR_USERNAME/YOUR_REPO/tree/main/logs/YYYY/MM/DD
#DevLog #Blender3D #OpenSource #ShipwrightProject
```
- [ ] Attach screenshot from `public/shots/`
- [ ] Post!
