import "dotenv/config";
import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PORT = process.env.PORT || 3001;

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────
function isDieselRole(roleTitle = "") {
  return /diesel|mechanic|technician|tech\b|heavy.?truck|fleet.?maint/i.test(roleTitle);
}

const DIESEL_DOMAIN_CONTEXT = `
DOMAIN EXPERTISE — DIESEL MECHANIC / TECHNICIAN:
You have deep knowledge of heavy-duty diesel systems. Use this to score knowledge accuracy and generate targeted probes.

TECHNICAL BENCHMARKS (what a competent candidate should know):

Engine & Diagnostics:
- Uses J1939/SAE fault code format (SPN + FMI), not just "check engine light"
- Names specific scan tools: Cummins INSITE, Detroit DiagnosticLink, Allison DOC, Bendix ACom, Jaltest
- Distinguishes root cause from symptom (e.g., "low rail pressure fault — checked CP4 pump vs lift pump first")
- Knows common failure patterns: injector o-ring leaks, EGR cooler failures, coolant in oil

DPF / Aftertreatment:
- Knows passive vs active vs forced/parked regen and when each applies
- Soot load % triggers: typically active regen >40%, parked regen >85%
- Understands ash buildup is NOT cleared by regen — requires physical cleaning (~every 150K-300K mi depending on load)
- Red flag: believes regeneration cleans ash, or doesn't know the difference between soot and ash
- Knows DPF cleaning methods: bake-and-blow, pneumatic cleaning, replacement thresholds

DEF / SCR System:
- Knows DEF is 32.5% urea / 67.5% deionized water, freezes at 12°F
- Understands NOx sensor role, DEF doser/injector, and SCR catalyst
- Common faults: DEF quality fault (contamination), doser crystallization, NOx sensor failure
- Knows derate/limp-home behavior when SCR system faults go unresolved

Air Brakes (FMCSR § 393):
- Brake adjustment: pushrod stroke limit is typically 1.75" at 90 psi (Type 30 chamber)
- Knows difference between automatic slack adjusters (ASA) and manual, and when manual adjustment is still needed
- Spring brake hold-off pressure: ~60 psi; below that, spring brakes apply
- Can describe pre-trip air brake inspection: build-up rate, governor cut-in/cut-out (~100-125 psi), low-pressure warning (~60 psi)
- Knows S-cam vs disc brake systems, dust shield inspection, drum wear limits

Preventive Maintenance:
- Knows typical OTR oil drain intervals: 15K-25K mi with oil analysis, or per OEM spec
- References SCA/DCA (supplemental coolant additive) levels for wet-sleeve engines
- Understands DVIR (Driver Vehicle Inspection Report) and how shop tickets link to driver defects
- Can name filter types and intervals (fuel/water separator, oil, air, DPF)

KNOWLEDGE SCORING for this role:
- 80+: Correct system-specific terms, actual spec numbers, clear distinction of root cause vs symptom, names real tools
- 60-79: Correct general direction but vague on specs ("I've done DPF regens", "I know air brakes")
- 40-59: Textbook-level only, no operational detail, conflates systems or uses wrong terminology
- <40: Wrong facts, incorrect procedures, or clearly has not worked on these systems hands-on
`;

function buildSystemPrompt(config) {
  const { candidateName, roleTitle, objectives, enabledSignals, mindset = "interviewer" } = config;
  const isSales = mindset === "sales";
  const isDiesel = !isSales && isDieselRole(roleTitle);

  const signalInstructions = {
    deception:            "deception_risk: 0-100. Look for hedging language, vague answers to direct questions, inconsistencies, over-qualification, topic redirection, and unusually brief answers to important questions.",
    sincerity:            "sincerity: 0-100. Look for specific personal examples, unprompted elaboration, consistency of emotional tone, direct 'I' statements vs. passive constructions.",
    engagement:           "engagement: 0-100. Look for energy in responses, elaboration beyond what was asked, enthusiasm markers, and contrast with flatter answers.",
    knowledge:            isDiesel
      ? "knowledge: 0-100. Score per DIESEL DOMAIN EXPERTISE benchmarks above. 80+ = correct specs + real tool names. 60-79 = correct but vague. <40 = wrong facts or clearly not hands-on."
      : "knowledge: 0-100. Look for specific numbers, named technologies used correctly in context, operational vs. textbook detail, and appropriate uncertainty.",
    stress:               "stress: 0-100. Look for filler word clusters ('um', 'uh', 'kind of', 'sort of'), sentence restarts, run-on sentences, and abrupt over-brevity.",
    avoidance:            "avoidance: 0-100. Look for answers that reframe the question, pivot to safer territory, answer adjacent questions instead of the one asked.",
    latency:              "latency_flag: true/false. Flag if any answer appears unusually short relative to question complexity.",
    confidence:           "confidence: 0-100. Distinguish appropriate uncertainty (healthy) from overclaiming (red flag) and underclaiming (imposter syndrome).",
    cultural:             "cultural_fit: 0-100. Look for values-language ('impact', 'ownership', 'collaboration'), team-first vs. individual framing.",
    preparation:          "preparation: 0-100. Look for company-specific references, unprompted research mentions, role-specific language.",
    rapport:              "rapport: 0-100. Look for warmth, matched energy, use of first name, personal connection, ease and comfort in the conversation.",
    buying_intent:        "buying_intent: 0-100. Look for forward-leaning language ('when we implement', 'I'd want to'), questions about pricing/timeline, comparisons to current solution, internal stakeholder mentions.",
    objection_detected:   "objection_detected: 0-100. Look for hesitation language, 'but'/'however', price or budget pushback, timing deferral, 'we already have', 'need to think about it'.",
    closing_opportunity:  "closing_opportunity: 0-100. Look for explicit interest, urgency signals, confirmed budget/authority, next-step discussion. High score = strong moment to ask for commitment.",
  };

  const activeSignalLines = Object.entries(signalInstructions)
    .filter(([key]) => enabledSignals[key])
    .map(([, instruction]) => `  - ${instruction}`)
    .join("\n");

  const roleDescription = isSales
    ? "You are a real-time sales call analysis assistant providing live coaching to the sales rep."
    : "You are a real-time interview analysis assistant providing live coaching to the interviewer.";

  const contextSection = isSales
    ? `CALL CONTEXT:\n- Prospect: ${candidateName}\n- Product/Service: ${roleTitle}\n- Rep objectives: ${objectives.join("; ")}`
    : `INTERVIEW CONTEXT:\n- Candidate: ${candidateName}\n- Role: ${roleTitle}\n- Interviewer objectives: ${objectives.join("; ")}`;

  const probeGuidelines = isSales
    ? `PROBE GUIDELINES:
- Generate 1-3 probes maximum. One excellent probe beats three mediocre ones.
- Every probe must be verbatim-speakable — a real sentence the rep could say out loud right now.
- Good probe types:
  - Pain deepening: "How long has that been a problem for you?"
  - Implication: "What happens if this isn't solved in the next quarter?"
  - Qualify: "Is this something you'd be looking to invest in this year?"
  - Objection handling: acknowledge + reframe: "That's fair — what would need to be true for timing to work?"
  - Trial close: "If we could solve [X], would that be enough to move forward?"
- Bad probes: vague instructions ("ask about budget"), restating what was just said, topics already resolved.
- Prioritize the most pressing unaddressed objection or uncovered pain.`
    : `PROBE GUIDELINES:
- Generate 1-3 probes maximum. One excellent probe beats three mediocre ones.
- Every probe must be verbatim-speakable — a real question the interviewer could say out loud right now.
- Good probe types:
  - Verification: "You mentioned X — can you walk me through exactly how you did that?"
  - Gap-fill: "What happened between [A] and [B]?"
  - Specificity: "Can you give me a concrete example of that?"
  - Outcome: "What was the actual result, in numbers if possible?"
  - Hypothetical: "How would you handle that differently today?"
- Bad probes: vague ("tell me more"), topic-based ("ask about leadership"), rephrasing what was already asked.
- Do NOT probe topics already well-covered in this transcript.
- Focus on the most important unverified claim or gap in the last 2-3 exchanges.${isDiesel ? `
- DIESEL-SPECIFIC probe types:
  - Technical verification: "Walk me through exactly how you diagnose a DPF that won't complete a forced regen."
  - Spec challenge: "What pushrod stroke limit do you use when adjusting brakes at 90 psi?"
  - Tool check: "What scan tool do you use for Cummins engines, and what's the last fault you diagnosed with it?"
  - Procedure depth: "Take me through your process when a driver reports low power and you're seeing a NOx sensor fault."
  - Distinction probe: "What's the difference between soot load and ash load in a DPF, and how do you address each?"
- Prioritize probing any technical claim that lacks a specific procedure, spec number, or tool name.` : ""}`;

  return `${roleDescription}
${isDiesel ? DIESEL_DOMAIN_CONTEXT : ""}
${contextSection}

YOUR JOB:
Analyze the transcript and return a JSON object. Be fast and decisive — this is live. Do not hedge. Make calls.

REQUIRED OUTPUT FORMAT — respond ONLY with this JSON, no preamble, no markdown fences:
{
  "probes": [
    "A specific follow-up ${isSales ? "question or statement the rep should say" : "question the interviewer should consider asking"}",
    "Another one if warranted"
  ],
  "signals": {
${activeSignalLines}
  },
  "summary": "One terse sentence on what just happened and what matters most right now"
}

${probeGuidelines}

SIGNAL GUIDELINES:
- Only include signals for the keys listed above. Omit any key not listed.
- Scores are cumulative impressions updated with each chunk — not just this moment.
- A score of 50 is neutral/unknown. Below 40 is notable. Above 70 is notable.
- For boolean fields (latency_flag), use true or false only.
- Base scores on what you have actually heard. If insufficient data, return 50.

RUNNING CONTEXT:
You will receive the full conversation so far with speaker labels. The most recent exchanges matter most for probes; use full history for signal scoring.`;
}

function formatTranscript(transcript) {
  if (!transcript || transcript.length === 0) return "No transcript yet.";
  return transcript.map(t => `[${t.speaker}]: ${t.text}`).join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /analyze — live analysis (SSE streaming)
// ─────────────────────────────────────────────────────────────────────────────
app.post("/analyze", async (req, res) => {
  const { config, transcript, trigger = "periodic" } = req.body;
  if (!config || !transcript) return res.status(400).json({ error: "Missing config or transcript" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const userMessage = `TRIGGER: ${trigger}\n\nFULL TRANSCRIPT SO FAR:\n${formatTranscript(transcript)}\n\nAnalyze the above and return your JSON response now.`;
  let fullText = "";

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: buildSystemPrompt(config),
      messages: [{ role: "user", content: userMessage }],
    });

    stream.on("text", (text) => {
      fullText += text;
      res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
    });

    stream.on("finalMessage", () => {
      try {
        const cleaned = fullText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        res.write(`data: ${JSON.stringify({ type: "result", data: parsed })}\n\n`);
      } catch {
        res.write(`data: ${JSON.stringify({ type: "error", message: "Failed to parse Claude response", raw: fullText })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    });

    stream.on("error", (err) => {
      res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
      res.end();
    });
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /debrief — post-call full analysis
// ─────────────────────────────────────────────────────────────────────────────
app.post("/debrief", async (req, res) => {
  const { config, transcript, signals } = req.body;
  const signalSummary = Object.entries(signals || {}).map(([k, v]) => `${k}: ${v}`).join(", ");

  const prompt = `You are a senior hiring coach reviewing a completed interview.

CANDIDATE: ${config.candidateName}
ROLE: ${config.roleTitle}
OBJECTIVES: ${config.objectives?.join("; ")}

SIGNAL SCORES RECORDED DURING INTERVIEW:
${signalSummary}

FULL TRANSCRIPT:
${formatTranscript(transcript)}

Provide a debrief in the following JSON format. No preamble, no markdown fences:
{
  "verdict": "Strong Yes | Lean Yes | Neutral | Lean No | Strong No",
  "headline": "One sentence summary of this candidate",
  "observations": [
    { "type": "positive|concern|neutral", "text": "observation" }
  ],
  "next_steps": ["action item 1", "action item 2"],
  "follow_up_email_draft": "A short follow-up email the interviewer could send to the candidate"
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = message.content[0].text;
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    res.json({ success: true, debrief: JSON.parse(cleaned) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /email-debrief — send post-interview report via Postmark
// ─────────────────────────────────────────────────────────────────────────────
app.post("/email-debrief", async (req, res) => {
  const { to, config, debrief, scores } = req.body;
  if (!to || !debrief) return res.status(400).json({ error: "Missing required fields" });

  const POSTMARK_KEY = process.env.POSTMARK_API_KEY;
  if (!POSTMARK_KEY) return res.status(500).json({ error: "POSTMARK_API_KEY not configured" });

  const verdictColor = {
    "Strong Yes": "#22c55e", "Lean Yes": "#86efac",
    "Neutral": "#94a3b8",
    "Lean No": "#fca5a5", "Strong No": "#ef4444",
  }[debrief.verdict] || "#94a3b8";

  const signalRows = Object.entries(scores || {}).map(([key, val]) => {
    const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const color = val >= 65 ? "#22c55e" : val <= 40 ? "#ef4444" : "#94a3b8";
    return `<tr>
      <td style="padding:6px 12px;color:#94a3b8;font-size:12px;">${label}</td>
      <td style="padding:6px 12px;font-weight:700;color:${color};font-size:12px;">${val}</td>
    </tr>`;
  }).join("");

  const obsRows = (debrief.observations || []).map(obs => {
    const border = obs.type === "positive" ? "#22c55e" : obs.type === "concern" ? "#ef4444" : "#94a3b8";
    return `<div style="border-left:3px solid ${border};padding:8px 12px;margin-bottom:6px;background:#1e2030;border-radius:0 4px 4px 0;">
      <span style="color:#c4c9d4;font-size:13px;">${obs.text}</span>
    </div>`;
  }).join("");

  const nextSteps = (debrief.next_steps || []).map(s =>
    `<div style="display:flex;gap:8px;margin-bottom:6px;">
      <span style="color:#60a5fa;">→</span>
      <span style="color:#c4c9d4;font-size:13px;">${s}</span>
    </div>`
  ).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0d0d14;font-family:'Courier New',monospace;">
<div style="max-width:680px;margin:0 auto;padding:32px 24px;">

  <div style="margin-bottom:24px;">
    <div style="font-size:10px;letter-spacing:4px;color:#6b7280;margin-bottom:6px;">INTERVIEW DEBRIEF</div>
    <h1 style="margin:0;font-size:24px;color:#f1f5f9;">${config.candidateName}</h1>
    <div style="font-size:13px;color:#6b7280;margin-top:4px;">${config.roleTitle}</div>
  </div>

  <div style="background:#161622;border:1px solid #252538;border-radius:6px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;gap:16px;">
    <div>
      <div style="font-size:10px;letter-spacing:3px;color:#6b7280;margin-bottom:4px;">HIRING VERDICT</div>
      <div style="font-size:22px;font-weight:700;color:${verdictColor};">${debrief.verdict}</div>
    </div>
    <div style="margin-left:auto;font-size:13px;color:#c4c9d4;max-width:360px;line-height:1.6;">${debrief.headline}</div>
  </div>

  ${signalRows ? `<div style="margin-bottom:20px;">
    <div style="font-size:10px;letter-spacing:3px;color:#6b7280;margin-bottom:10px;">SIGNAL SCORES</div>
    <table style="border-collapse:collapse;background:#161622;border:1px solid #252538;border-radius:6px;width:100%;">
      ${signalRows}
    </table>
  </div>` : ""}

  <div style="margin-bottom:20px;">
    <div style="font-size:10px;letter-spacing:3px;color:#6b7280;margin-bottom:10px;">OBSERVATIONS</div>
    ${obsRows}
  </div>

  <div style="margin-bottom:20px;">
    <div style="font-size:10px;letter-spacing:3px;color:#6b7280;margin-bottom:10px;">RECOMMENDED NEXT STEPS</div>
    ${nextSteps}
  </div>

  ${debrief.follow_up_email_draft ? `<div style="margin-bottom:20px;">
    <div style="font-size:10px;letter-spacing:3px;color:#6b7280;margin-bottom:10px;">FOLLOW-UP EMAIL DRAFT</div>
    <div style="background:#161622;border:1px solid #252538;border-radius:4px;padding:16px;font-size:13px;color:#c4c9d4;line-height:1.8;white-space:pre-wrap;">${debrief.follow_up_email_draft}</div>
  </div>` : ""}

  <div style="font-size:10px;color:#374151;margin-top:32px;text-align:center;">Generated by Interview Copilot</div>
</div>
</body></html>`;

  try {
    const pmRes = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": POSTMARK_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        From: "noreply@wernercoach.com",
        To: to,
        Subject: `Interview Debrief — ${config.candidateName} (${config.roleTitle})`,
        HtmlBody: html,
        MessageStream: "outbound",
      }),
    });
    const data = await pmRes.json();
    if (!pmRes.ok) return res.status(500).json({ error: data.Message || "Postmark error" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    model: "claude-sonnet-4-5",
    anthropic_key:  !!process.env.ANTHROPIC_API_KEY,
    deepgram_key:   !!process.env.DEEPGRAM_API_KEY,
    postmark_key:   !!process.env.POSTMARK_API_KEY,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DEEPGRAM WEBSOCKET RELAY  —  ws://localhost:3001/mic
//
// The browser cannot connect to Deepgram directly without exposing the API key.
// This relay sits in the middle:
//
//   Browser                   This relay               Deepgram
//   ───────                   ──────────               ────────
//   getUserMedia()
//   MediaRecorder chunks ───► forward raw bytes ──────► wss://api.deepgram.com
//                        ◄─── transcript events ◄────── Results / UtteranceEnd
//
// Browser receives JSON messages:
//   { type:"status",        message }        connection lifecycle
//   { type:"transcript",    text, is_final } speech recognized
//   { type:"utterance_end"               }  good moment to trigger analysis
//   { type:"speech_start"                }  VAD: someone started speaking
//   { type:"error",         message }        something went wrong
// ─────────────────────────────────────────────────────────────────────────────
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/mic" });

wss.on("connection", (browserWs) => {
  if (!process.env.DEEPGRAM_API_KEY) {
    browserWs.send(JSON.stringify({ type: "error", message: "DEEPGRAM_API_KEY not set on server" }));
    browserWs.close();
    return;
  }

  const dgUrl = [
    "wss://api.deepgram.com/v1/listen",
    "?model=nova-3",
    "&smart_format=true",
    "&numerals=true",
    "&language=en-US",
    "&interim_results=true",
    "&utterance_end_ms=1200",
    "&vad_events=true",
    "&diarize=true",
  ].join("");

  const dgWs = new WebSocket(dgUrl, {
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
  });

  browserWs.send(JSON.stringify({ type: "status", message: "Connecting to Deepgram..." }));

  dgWs.on("open", () => {
    browserWs.send(JSON.stringify({ type: "status", message: "Mic ready — listening" }));
  });

  dgWs.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "Results") {
        const alt = msg.channel?.alternatives?.[0];
        const text = alt?.transcript?.trim();
        if (!text) return;
        // Dominant speaker ID from diarized words array
        const words = alt?.words || [];
        const counts = {};
        words.forEach(w => { if (w.speaker !== undefined) counts[w.speaker] = (counts[w.speaker] || 0) + 1; });
        const speakerId = Object.keys(counts).length > 0
          ? parseInt(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0])
          : 0;
        browserWs.send(JSON.stringify({
          type:       "transcript",
          speakerId,
          text,
          is_final:   msg.is_final,
          confidence: alt?.confidence ?? null,
        }));
      }

      if (msg.type === "UtteranceEnd") {
        browserWs.send(JSON.stringify({ type: "utterance_end" }));
      }

      if (msg.type === "SpeechStarted") {
        browserWs.send(JSON.stringify({ type: "speech_start" }));
      }
    } catch { /* non-JSON frame, ignore */ }
  });

  dgWs.on("error", (err) => {
    browserWs.send(JSON.stringify({ type: "error", message: `Deepgram: ${err.message}` }));
  });

  dgWs.on("close", () => {
    if (browserWs.readyState === WebSocket.OPEN) browserWs.close();
  });

  browserWs.on("message", (data) => {
    if (dgWs.readyState === WebSocket.OPEN) dgWs.send(data);
  });

  browserWs.on("close", () => {
    if (dgWs.readyState === WebSocket.OPEN) {
      dgWs.send(JSON.stringify({ type: "CloseStream" }));
      dgWs.close();
    }
  });

  browserWs.on("error", () => dgWs.close());
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n🎙  Interview Copilot — http://localhost:${PORT}`);
  console.log(`   Anthropic:  ${process.env.ANTHROPIC_API_KEY ? "✓" : "✗ MISSING"}`);
  console.log(`   Deepgram:   ${process.env.DEEPGRAM_API_KEY  ? "✓" : "✗ MISSING"}`);
  console.log(`\n   POST /analyze  SSE streaming analysis`);
  console.log(`   POST /debrief  post-call debrief`);
  console.log(`   GET  /health   status`);
  console.log(`   WS   /mic      Deepgram audio relay\n`);
});
