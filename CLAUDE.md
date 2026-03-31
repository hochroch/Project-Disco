# Interview Copilot — Claude Code Project Brief

## What This Is
A real-time AI interview assistant. The interviewer runs this during in-person interviews to get live coaching: suggested follow-up questions (probes), behavioral signal scores (deception risk, sincerity, engagement, knowledge depth, etc.), and a full post-call debrief.

Two components:
- `server.js` — Express + WebSocket backend. Handles Claude API analysis and Deepgram audio relay.
- `App.jsx` — React frontend. Teleprompter UI with probe feed, signal panel, mic capture, text input.

---

## Project Structure

```
interview-copilot/
├── CLAUDE.md          ← you are here
├── server.js          ← Node/Express backend
├── App.jsx            ← React frontend
├── package.json       ← dependencies (express, cors, dotenv, @anthropic-ai/sdk, ws)
├── .env.example       ← copy to .env, add both API keys
└── README.md          ← setup and API docs
```

---

## How to Run

```bash
npm install
cp .env.example .env    # add ANTHROPIC_API_KEY and DEEPGRAM_API_KEY
npm start               # starts backend on :3001
```

Frontend (`App.jsx`) is a standalone React component. Drop into any Vite project:
```bash
npm create vite@latest frontend -- --template react
# replace src/App.jsx with App.jsx from this project
cd frontend && npm install && npm run dev
```

Verify backend:
```bash
curl http://localhost:3001/health
# should show both anthropic_key and deepgram_key as true
```

---

## Architecture

### Backend (`server.js`)

Built on Express + `ws`. Uses a shared `http.createServer` so both HTTP and WebSocket run on port 3001.

**`POST /analyze`** — main live analysis, SSE streaming
- Input: `{ config, transcript, trigger }`
- `config`: `{ candidateName, roleTitle, objectives[], enabledSignals{} }`
- `trigger`: `"periodic" | "question_asked" | "utterance_end" | "manual"`
- Calls Claude Sonnet with structured system prompt, streams tokens back
- SSE events: `{ type:"delta", text }` → `{ type:"result", data }` → `{ type:"done" }`
- Result shape: `{ probes: string[], signals: { deception:0-100, ... }, summary: string }`

**`POST /debrief`** — post-call full analysis, synchronous
- Input: `{ config, transcript, signals }`
- Returns: `{ verdict, headline, observations[], next_steps[], follow_up_email_draft }`

**`GET /health`** — returns `{ anthropic_key, deepgram_key, status }`

**`WS /mic`** — Deepgram audio relay
- Browser connects, sends raw MediaRecorder audio chunks (audio/webm;codecs=opus, 250ms)
- Relay forwards to Deepgram `wss://api.deepgram.com/v1/listen` with server-side API key
- Deepgram events forwarded back to browser as JSON:
  - `{ type:"status", message }` — lifecycle messages
  - `{ type:"transcript", text, is_final, speaker, confidence }` — speech recognized
  - `{ type:"utterance_end" }` — natural pause, good analysis trigger
  - `{ type:"speech_start" }` — VAD: voice activity detected
  - `{ type:"error", message }` — something went wrong
- Deepgram params: nova-3 model, smart_format, interim_results, utterance_end_ms=1200, vad_events

### Frontend (`App.jsx`)

Three phases: `setup` → `live` → `debrief`

**Color system** (defined as `C` object at top of file):
```js
C.bg         = "#0d0d14"   // page background
C.surface    = "#161622"   // cards, panels
C.surfaceAlt = "#1c1c2a"   // right panel background
C.edge       = "#252538"   // borders, dividers
C.muted      = "#6b7280"   // secondary labels — MINIMUM for readable text on dark bg
C.body       = "#c4c9d4"   // body text
C.bright     = "#f1f5f9"   // headings
```
⚠️ Never use hex values darker than `#6b7280` for any visible text. Past iterations had illegibility issues from near-black-on-black text.

**Setup screen:** candidate name, role, objectives checklist, signal module toggles (11 types, grouped by category)

**Live screen layout (CSS Grid):**
```
gridTemplateRows:    "44px  1fr   auto  76px"
gridTemplateColumns: "1fr   268px"
//                    ^           ^
//                    probes      signals panel (spans rows 2-5 via gridRow:"2/5")

Row 1: top bar (full width) — LIVE dot, hot mic indicators, status pill, timer, END button
Row 2: probe feed (center) — dominant panel, large cards, full remaining height
Row 3: text input bar (center only) — speaker toggle + textarea + ADD/MIC buttons
Row 4: transcript ticker (center only) — last 4 lines, fades older ones
```

**Signal panel (right, rows 2-5):**
- Score bars for all enabled signals (updates with each analysis result)
- Objectives checklist (clickable to check off mid-interview)
- Live signal cards (appear when score ≥65 or ≤40, dismissable with ×)

**Key state:**
```js
transcript    // [{ speaker: "INTERVIEWER"|"CANDIDATE", text }]
probes        // [{ text, id }] — from Claude, shown in center panel
signals       // [{ type, score, note, id }] — notable signals feed
scores        // { deception: 64, knowledge: 91, ... } — running totals
dismissed     // Set of ids — removed from UI but not from state
hotMic        // "YOU" | "CANDIDATE" | null — controls hot mic indicators
micActive     // bool — mic button state
```

**Key refs:**
```js
micWsRef      // WebSocket to ws://localhost:3001/mic
recorderRef   // MediaRecorder instance
interimRef    // accumulates interim Deepgram text (not yet committed to transcript)
analyzeRef    // AbortController for in-flight /analyze SSE calls
periodicRef   // setInterval handle for 20s periodic analysis
```

**Mic flow (`toggleMic`):**
1. `getUserMedia({ audio: true })` → get mic stream
2. Open `WebSocket("ws://localhost:3001/mic")`
3. On `ws.onopen`: start `MediaRecorder(stream, { mimeType:"audio/webm;codecs=opus" })` with `recorder.start(250)`
4. `recorder.ondataavailable` → send binary chunk to WS
5. On `{ type:"transcript", is_final:true }` → push to transcript state
6. On `{ type:"utterance_end" }` → call `runAnalysis("utterance_end")`
7. On `{ type:"speech_start" }` → set `hotMic("CANDIDATE")`
8. Toggle off: `recorder.stop()`, close WS, reset state

**Analysis triggers:**
- Every 20s: `setInterval(() => runAnalysis("periodic"), 20000)` in `startSession()`
- On INTERVIEWER text submit: `runAnalysis("question_asked")`
- On Deepgram `utterance_end`: `runAnalysis("utterance_end")`
- Manual: "ANALYZE NOW" button

**`runAnalysis(trigger)`:**
- Aborts any in-flight call via `AbortController`
- POSTs to `/analyze` with full transcript + config
- Reads SSE stream, on `type:"result"` updates probes + scores + signal cards
- Notable signal threshold: score ≥65 or ≤40 → creates a signal card

---

## Signal Types (11 total)

Defined in `SIGNAL_TYPES` object in `App.jsx` AND as scoring instructions in `buildSystemPrompt()` in `server.js`. Both must be updated when adding a new signal.

```
followup     → probes (coaching)
deception    → integrity
sincerity    → integrity
stress       → integrity
avoidance    → integrity
latency      → integrity (boolean flag, not 0-100)
knowledge    → competence
confidence   → competence
engagement   → interest
cultural     → interest
preparation  → interest
```

Each signal type has: `label, icon, color, bg, border, desc, defaultOn, category`

---

## Current State

### ✅ Done
- Full UI — setup, live, debrief screens
- Node.js backend with Claude API SSE streaming
- All 11 interview signal types + 4 sales signal types (15 total)
- Probe feed as dominant center panel (large cards, 17px text)
- Transcript ticker (last 4 lines, fading opacity)
- Text input mode — type transcript manually, Enter to submit
- Auto-analysis every 20s + on INTERVIEWER question submit
- **Deepgram WebSocket relay** — `ws://localhost:3001/mic` (server.js)
- **Real mic capture** — `toggleMic()` in App.jsx wired to relay
- **Deepgram diarization** — `diarize=true`, speaker IDs auto-mapped (first speaker = INTERVIEWER). `⇄ SWAP` button in top bar if roles flip.
- **Sales mindset** — `MINDSETS` config, segmented selector on setup, 4 sales signals, branched system prompt + probe guidelines
- **Persistent playbooks** — localStorage save/load, 3 seeded templates, playbook bar on setup screen
- **Electron wrapper** — `electron-main.js` (440px right-side always-on-top), Tray, spawns backend. `vite.config.js` + `index.html` + `main.jsx` added.
- **Improved probe prompts** — specific good/bad examples for both interview and sales modes
- Post-call debrief with Claude (verdict, observations, next steps, email draft)
- Readable dark theme throughout

### 🔲 Next Up

- **Negotiation mindset** — third MINDSETS entry (after Interviewer, Sales)
- **Electron icon** — add `assets/icon.png` for tray and app window
- **Hot reload in Electron dev** — currently requires manual restart if backend changes
- **Playbook export/import** — JSON file download/upload to share playbooks across machines

---

## Common Tasks for Claude Code

### "Wire up speaker toggle for mic"
In `App.jsx`:
- Add a `micSpeaker` state: `useState("CANDIDATE")`
- Add speaker toggle buttons (YOU / CANDIDATE) that set `micSpeaker`
- In `ws.onmessage` where `type === "transcript"`, use `micSpeaker` instead of hardcoded `"CANDIDATE"`
- Or: hold-to-talk pattern — listen for `keydown/keyup` on Space, switch `micSpeaker` while held

### "Add a new signal type"
Two files must be updated:
1. `App.jsx` — add entry to `SIGNAL_TYPES` object with `label, icon, color, bg, border, desc, defaultOn, category`
2. `server.js` — add scoring instruction to `signalInstructions` in `buildSystemPrompt()`
Pick a category from: `coaching, integrity, competence, interest`
Pick colors that work on dark backgrounds — test contrast against `C.bg = "#0d0d14"`

### "Add sales mindset"
1. Add `const MINDSETS = { interviewer: {...}, sales: {...} }` config object in `App.jsx`
2. Add mindset radio/segmented selector to setup screen
3. Pass `mindset` in config object sent to `/analyze`
4. In `server.js` `buildSystemPrompt()`, branch on `config.mindset` to change tone + signal set

### "Change the UI layout"
Live screen grid:
```js
gridTemplateRows:    "44px 1fr auto 76px"   // topbar | probes | input | ticker
gridTemplateColumns: "1fr 268px"             // main | signals panel
```
Signals panel: `gridRow: "2/5"` (spans input and ticker rows too)
Probe cards: `fontSize: 17, padding: "18px 20px"` — don't go smaller

### "Improve probe quality"
Edit `PROBE GUIDELINES` section in `buildSystemPrompt()` in `server.js`.
Current guidance: 1-3 probes max, verbatim-speakable, focus on vagueness/verification/threads.

### "Test without a backend"
The previous prototype (`interview-copilot-v4.jsx`) has a full simulation with hardcoded EVENTS on timers. Use it for pure UI work without needing the server running.

---

## Dependencies

```json
{
  "@anthropic-ai/sdk": "^0.30.0",
  "cors": "^2.8.5",
  "dotenv": "^16.4.5",
  "express": "^4.19.2",
  "ws": "^8.17.0"
}
```

Node 18+ required. `"type": "module"` in package.json (ES modules throughout).

---

## Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
DEEPGRAM_API_KEY=...
PORT=3001
```

Both keys checked on startup and reported in `/health`. The Deepgram key from the Backbone/mechanic-tablet project works here — same account, different use (streaming vs. batch REST).
