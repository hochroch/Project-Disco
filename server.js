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
function buildSystemPrompt(config) {
  const { candidateName, roleTitle, objectives, enabledSignals, mindset = "interviewer" } = config;
  const isSales = mindset === "sales";

  const signalInstructions = {
    deception:            "deception_risk: 0-100. Look for hedging language, vague answers to direct questions, inconsistencies, over-qualification, topic redirection, and unusually brief answers to important questions.",
    sincerity:            "sincerity: 0-100. Look for specific personal examples, unprompted elaboration, consistency of emotional tone, direct 'I' statements vs. passive constructions.",
    engagement:           "engagement: 0-100. Look for energy in responses, elaboration beyond what was asked, enthusiasm markers, and contrast with flatter answers.",
    knowledge:            "knowledge: 0-100. Look for specific numbers, named technologies used correctly in context, operational vs. textbook detail, and appropriate uncertainty.",
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
- Focus on the most important unverified claim or gap in the last 2-3 exchanges.`;

  return `${roleDescription}

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
// GET /health
// ─────────────────────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    model: "claude-sonnet-4-5",
    anthropic_key: !!process.env.ANTHROPIC_API_KEY,
    deepgram_key:  !!process.env.DEEPGRAM_API_KEY,
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
    "&encoding=webm-opus",
    "&sample_rate=48000",
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
