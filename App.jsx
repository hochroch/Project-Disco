import { useState, useEffect, useRef, useCallback } from "react";

// ── CONFIG ────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE || `http://${window.location.hostname}:3001`;
const WS_BASE  = API_BASE.replace(/^http/, "ws");

// ── COLOR SYSTEM ──────────────────────────────────────────────────────────
const C = {
  bg:         "#0d0d14",
  surface:    "#161622",
  surfaceAlt: "#1c1c2a",
  edge:       "#252538",
  muted:      "#6b7280",
  body:       "#c4c9d4",
  bright:     "#f1f5f9",
};

// ── SIGNAL TYPES ──────────────────────────────────────────────────────────
const SIGNAL_TYPES = {
  followup:    { label:"Follow-Up Probes",       icon:"→", color:"#38bdf8", bg:"#0c1d2e", border:"#0ea5e9", desc:"Suggested questions to dig deeper",           defaultOn:true,  category:"coaching"   },
  deception:   { label:"Deception Risk",         icon:"◬", color:"#f87171", bg:"#2a1010", border:"#ef4444", desc:"Hedging, contradiction, avoidance patterns",   defaultOn:true,  category:"integrity"  },
  sincerity:   { label:"Sincerity",              icon:"✦", color:"#d8b4fe", bg:"#1e1030", border:"#a855f7", desc:"Authenticity and conviction signals",          defaultOn:true,  category:"integrity"  },
  engagement:  { label:"Engagement Level",       icon:"◉", color:"#fcd34d", bg:"#1e1800", border:"#f59e0b", desc:"Interest, energy, and posture cues",           defaultOn:true,  category:"interest"   },
  knowledge:   { label:"Knowledge Depth",        icon:"◈", color:"#6ee7b7", bg:"#0a2010", border:"#22c55e", desc:"Technical accuracy and specificity",           defaultOn:true,  category:"competence" },
  stress:      { label:"Stress Indicators",      icon:"~", color:"#fdba74", bg:"#221408", border:"#f97316", desc:"Speech rate, filler words, pauses",            defaultOn:true,  category:"integrity"  },
  avoidance:   { label:"Topic Avoidance",        icon:"⊘", color:"#f9a8d4", bg:"#220d18", border:"#ec4899", desc:"Deflection, redirection, non-answers",         defaultOn:true,  category:"integrity"  },
  latency:     { label:"Response Latency",       icon:"⏱", color:"#94a3b8", bg:"#141820", border:"#475569", desc:"Unusually long or short response times",       defaultOn:false, category:"integrity"  },
  confidence:  { label:"Confidence Calibration", icon:"⬡", color:"#67e8f9", bg:"#081820", border:"#06b6d4", desc:"Overconfidence vs. appropriate uncertainty",   defaultOn:true,  category:"competence" },
  cultural:    { label:"Culture Fit",            icon:"◎", color:"#bef264", bg:"#101a04", border:"#84cc16", desc:"Values alignment, collaboration language",     defaultOn:false, category:"interest"   },
  preparation:          { label:"Preparation Quality",   icon:"▣", color:"#a5b4fc", bg:"#10103a", border:"#6366f1", desc:"Research depth, company knowledge",          defaultOn:true,  category:"interest"   },
  // Sales mindset signals
  rapport:              { label:"Rapport",               icon:"◎", color:"#f472b6", bg:"#1f0a18", border:"#db2777", desc:"Trust, warmth, and connection signals",     defaultOn:false, category:"interest"   },
  buying_intent:        { label:"Buying Intent",         icon:"◆", color:"#34d399", bg:"#052e1a", border:"#10b981", desc:"Purchase readiness and interest signals",   defaultOn:false, category:"interest"   },
  objection_detected:   { label:"Objection Detected",    icon:"⚡", color:"#fbbf24", bg:"#2a1a00", border:"#f59e0b", desc:"Price, timing, or fit pushback",            defaultOn:false, category:"integrity"  },
  closing_opportunity:  { label:"Closing Opportunity",   icon:"►", color:"#a78bfa", bg:"#130d2e", border:"#7c3aed", desc:"Readiness signals — prospect near a yes",   defaultOn:false, category:"competence" },
};

const CATEGORIES = {
  coaching:    "Coaching",
  integrity:   "Integrity & Honesty",
  competence:  "Competence",
  interest:    "Interest & Fit",
};

const OBJECTIVES_DEFAULT = [
  "Assess depth of relevant technical experience",
  "Verify and probe departure reason from last role",
  "Gauge genuine interest vs. job-shopping",
  "Identify leadership and ownership patterns",
  "Evaluate how they handle disagreement",
];

const MINDSETS = {
  interviewer: {
    label: "Interview",
    nameLabel: "Candidate Name",
    roleLabel: "Role",
    signals: Object.fromEntries(Object.entries(SIGNAL_TYPES).map(([k, v]) => [k, v.defaultOn])),
    objectives: OBJECTIVES_DEFAULT,
  },
  sales: {
    label: "Sales",
    nameLabel: "Prospect Name",
    roleLabel: "Product / Service",
    signals: {
      followup: true, deception: false, sincerity: false, engagement: true,
      knowledge: true, stress: false, avoidance: false, latency: false,
      confidence: false, cultural: false, preparation: true,
      rapport: true, buying_intent: true, objection_detected: true, closing_opportunity: true,
    },
    objectives: [
      "Identify prospect's primary pain point",
      "Qualify budget and decision-making authority",
      "Gauge urgency and timeline",
      "Handle key objections",
      "Move toward commitment or next step",
    ],
  },
};

const PLAYBOOK_TEMPLATES = [
  {
    name: "Engineering Interview",
    mindset: "interviewer",
    roleTitle: "Senior Backend Engineer",
    enabledSignals: { followup:true, deception:true, sincerity:true, engagement:true, knowledge:true, stress:true, avoidance:true, latency:false, confidence:true, cultural:false, preparation:true, rapport:false, buying_intent:false, objection_detected:false, closing_opportunity:false },
    objectives: OBJECTIVES_DEFAULT,
  },
  {
    name: "Executive Candidate",
    mindset: "interviewer",
    roleTitle: "VP of Engineering",
    enabledSignals: { followup:true, deception:true, sincerity:true, engagement:true, knowledge:false, stress:false, avoidance:true, latency:false, confidence:true, cultural:true, preparation:true, rapport:false, buying_intent:false, objection_detected:false, closing_opportunity:false },
    objectives: [
      "Evaluate strategic thinking and vision",
      "Assess leadership style and team development approach",
      "Gauge self-awareness and handling of past failures",
      "Verify cross-functional collaboration ability",
      "Assess culture and values alignment",
    ],
  },
  {
    name: "Sales Discovery",
    mindset: "sales",
    roleTitle: "Our Platform",
    enabledSignals: MINDSETS.sales.signals,
    objectives: MINDSETS.sales.objectives,
  },
  {
    name: "Diesel Mechanic",
    mindset: "interviewer",
    roleTitle: "Diesel Mechanic / Technician",
    enabledSignals: { followup:true, deception:true, sincerity:true, engagement:true, knowledge:true, stress:false, avoidance:true, latency:true, confidence:true, cultural:false, preparation:false, rapport:false, buying_intent:false, objection_detected:false, closing_opportunity:false },
    objectives: [
      "Confirm hands-on diagnostic experience (not just parts-swapping)",
      "Assess DPF/DEF aftertreatment knowledge and regen procedures",
      "Verify air brake inspection and adjustment competency",
      "Gauge familiarity with diagnostic scan tools (INSITE, DiagnosticLink, etc.)",
      "Evaluate preventive maintenance discipline and record-keeping habits",
    ],
  },
];

// ── SMALL COMPONENTS ──────────────────────────────────────────────────────
function Ring({ score, color, size = 44 }) {
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.edge} strokeWidth="3"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${(score/100)*circ} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1s cubic-bezier(.4,0,.2,1)" }}/>
    </svg>
  );
}

function HotMic({ active, label, color }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:6, padding:"3px 10px", borderRadius:3,
      background: active ? color+"20" : "transparent",
      border:`1px solid ${active ? color+"80" : C.edge}`,
      transition:"all 0.25s",
    }}>
      <span style={{
        width:6, height:6, borderRadius:"50%",
        background: active ? color : C.edge,
        boxShadow: active ? `0 0 6px ${color}` : "none",
        transition:"all 0.25s",
        animation: active ? "micPulse 1.4s ease-in-out infinite" : "none",
        flexShrink:0,
      }}/>
      <span style={{ fontSize:9, letterSpacing:2, color: active ? color : C.muted }}>{label}</span>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize:9, letterSpacing:3, color:C.muted, marginBottom:10, textTransform:"uppercase" }}>{children}</div>;
}

function StatusPill({ status }) {
  const map = {
    idle:      { color: C.muted,    text: "IDLE" },
    analyzing: { color: "#fcd34d",  text: "ANALYZING..." },
    done:      { color: "#6ee7b7",  text: "READY" },
    error:     { color: "#f87171",  text: "ERROR" },
  };
  const s = map[status] || map.idle;
  return (
    <span style={{
      fontSize:8, letterSpacing:2, color:s.color,
      padding:"2px 8px", borderRadius:3,
      border:`1px solid ${s.color}60`,
      background:s.color+"15",
    }}>{s.text}</span>
  );
}

// ── GLOBAL STYLES ──────────────────────────────────────────────────────────
const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: ${C.bg}; }
  ::-webkit-scrollbar-thumb { background: ${C.edge}; border-radius: 2px; }
  @keyframes micPulse  { 0%,100%{opacity:1} 50%{opacity:.3} }
  @keyframes probeIn   { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes sigIn     { from{opacity:0;transform:translateX(10px)} to{opacity:1;transform:translateX(0)} }
  @keyframes fadeUp    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  input:focus, textarea:focus { outline: none; border-color: #3b82f6 !important; }
  textarea { resize: none; }
`;

// ── MAIN ──────────────────────────────────────────────────────────────────
export default function InterviewCopilot() {
  const [winW, setWinW]         = useState(window.innerWidth);
  const [winH, setWinH]         = useState(window.innerHeight);
  const [viewMode, setViewMode] = useState(window.innerWidth < 1100 ? "monitor" : "dashboard");
  const [monitorProbe, setMonitorProbe]   = useState(null);
  const [monitorSignal, setMonitorSignal] = useState(null);
  const probeTimerRef  = useRef(null);
  const signalTimerRef = useRef(null);
  useEffect(() => {
    const handler = () => { setWinW(window.innerWidth); setWinH(window.innerHeight); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  const isTablet   = winW < 1100;
  const isPortrait = winH > winW;
  const [showSignals, setShowSignals] = useState(true);

  const [phase, setPhase]       = useState("setup");
  const [candidateName, setCandidateName] = useState("Alex Chen");
  const [roleTitle, setRoleTitle]         = useState("Senior Backend Engineer");
  const [objectives, setObjectives]       = useState(OBJECTIVES_DEFAULT.map(t => ({ text:t, done:false })));
  const [mindset, setMindset]             = useState("interviewer");
  const [enabledSignals, setEnabledSignals] = useState(MINDSETS.interviewer.signals);
  const [savedPlaybooks, setSavedPlaybooks] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("copilot-playbooks") || "null");
      if (!stored?.length) {
        localStorage.setItem("copilot-playbooks", JSON.stringify(PLAYBOOK_TEMPLATES));
        return PLAYBOOK_TEMPLATES;
      }
      // Merge in any new default templates not already present by name
      const storedNames = new Set(stored.map(p => p.name));
      const missing = PLAYBOOK_TEMPLATES.filter(t => !storedNames.has(t.name));
      if (missing.length > 0) {
        const merged = [...stored, ...missing];
        localStorage.setItem("copilot-playbooks", JSON.stringify(merged));
        return merged;
      }
      return stored;
    } catch { return PLAYBOOK_TEMPLATES; }
  });
  const [selectedPlaybook, setSelectedPlaybook] = useState("");
  const [playbookName, setPlaybookName]         = useState("");

  // Live state
  const [transcript, setTranscript] = useState([]); // [{ speaker, text }]
  const [probes, setProbes]         = useState([]);
  const [signals, setSignals]       = useState([]);  // [{ type, score, note, id }]
  const [scores, setScores]         = useState({});
  const [dismissed, setDismissed]   = useState(new Set());
  const [elapsed, setElapsed]       = useState(0);
  const [analyzeStatus, setAnalyzeStatus] = useState("idle");
  const [lastSummary, setLastSummary]     = useState("");
  const [analyzeError, setAnalyzeError]   = useState("");

  // Input mode
  const [inputMode, setInputMode]   = useState("text"); // "text" | "mic"
  const [inputSpeaker, setInputSpeaker] = useState("CANDIDATE");
  const [inputText, setInputText]   = useState("");
  const [micActive, setMicActive]   = useState(false);
  const [hotMic, setHotMic]         = useState(null); // "YOU" | "CANDIDATE" | null
  const [speakerMap, setSpeakerMap] = useState({});   // { speakerId: role } — triggers re-render on swap

  // Debrief
  const [debrief, setDebrief]       = useState(null);
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [emailTo, setEmailTo]       = useState("");
  const [emailStatus, setEmailStatus] = useState("idle"); // idle | sending | sent | error
  const [emailError, setEmailError] = useState("");

  const timerRef      = useRef(null);
  const tickerRef     = useRef(null);
  const analyzeRef      = useRef(null); // abort controller
  const periodicRef     = useRef(null);
  const lastAnalyzedRef = useRef(0);    // timestamp of last analysis start (for utterance_end cooldown)
  const micWsRef        = useRef(null); // WebSocket to /mic relay
  const recorderRef     = useRef(null); // MediaRecorder instance
  const interimRef      = useRef("");   // accumulates interim transcript text
  const speakerMapRef   = useRef({});   // { speakerId: "INTERVIEWER"|"CANDIDATE" }
  const speakersSeenRef = useRef([]);   // ordered by first appearance; index 0 = INTERVIEWER

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearInterval(periodicRef.current);
    analyzeRef.current?.abort();
    clearTimeout(probeTimerRef.current);
    clearTimeout(signalTimerRef.current);
  }, []);

  // Monitor mode — surface latest probe/signal, auto-dismiss
  useEffect(() => {
    if (viewMode !== "monitor" || probes.length === 0) return;
    setMonitorProbe(probes[0]);
    clearTimeout(probeTimerRef.current);
    probeTimerRef.current = setTimeout(() => setMonitorProbe(null), 10000);
  }, [probes, viewMode]);

  useEffect(() => {
    if (viewMode !== "monitor" || signals.length === 0) return;
    setMonitorSignal(signals[0]);
    clearTimeout(signalTimerRef.current);
    signalTimerRef.current = setTimeout(() => setMonitorSignal(null), 6000);
  }, [signals, viewMode]);

  useEffect(() => {
    if (tickerRef.current) tickerRef.current.scrollTop = tickerRef.current.scrollHeight;
  }, [transcript]);

  // ── ANALYSIS CALL ───────────────────────────────────────────────────────
  const runAnalysis = useCallback(async (trigger = "periodic") => {
    if (transcript.length === 0) return;
    if (analyzeStatus === "analyzing") return;

    analyzeRef.current?.abort();
    analyzeRef.current = new AbortController();
    lastAnalyzedRef.current = Date.now();

    setAnalyzeStatus("analyzing");
    setAnalyzeError("");

    const config = {
      candidateName,
      roleTitle,
      objectives: objectives.map(o => o.text),
      enabledSignals,
      mindset,
    };

    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, transcript, trigger }),
        signal: analyzeRef.current.signal,
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "));

        for (const line of lines) {
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "result") {
              const { probes: newProbes, signals: newSignals, summary } = event.data;

              // Update probes
              if (newProbes?.length) {
                setProbes(prev => [
                  ...newProbes.map(text => ({ text, id: Date.now() + Math.random() })),
                  ...prev,
                ].slice(0, 8));
              }

              // Update scores and signal feed
              if (newSignals) {
                setScores(prev => {
                  const updated = { ...prev };
                  Object.entries(newSignals).forEach(([k, v]) => {
                    if (typeof v === "number") updated[k] = v;
                  });
                  return updated;
                });

                // Add notable signals to the feed (score >65 or <40 or boolean flags)
                const notable = Object.entries(newSignals).filter(([k, v]) => {
                  if (typeof v === "boolean") return v;
                  if (typeof v === "number") return v >= 65 || v <= 40;
                  return false;
                });

                if (notable.length > 0) {
                  const newSigCards = notable.map(([type, score]) => ({
                    type,
                    score: typeof score === "number" ? score : null,
                    note: getSummaryForSignal(type, score, summary),
                    id: Date.now() + Math.random(),
                  }));
                  setSignals(prev => [...newSigCards, ...prev].slice(0, 12));
                }
              }

              if (summary) setLastSummary(summary);
              setAnalyzeStatus("done");
            }

            if (event.type === "error") {
              setAnalyzeError(event.message);
              setAnalyzeStatus("error");
            }
          } catch { /* incomplete chunk, continue */ }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setAnalyzeError(err.message);
        setAnalyzeStatus("error");
      }
    }
  }, [transcript, candidateName, roleTitle, objectives, enabledSignals, analyzeStatus]);

  // Returns a contextual note string for a notable signal
  function getSummaryForSignal(type, score, summary) {
    if (type === "latency_flag") return "Unusual response latency detected on last answer.";
    const dir = score >= 65 ? "high" : "low";
    const labels = {
      deception:   { high: "Elevated deception indicators in recent response.", low: "Deception signals low — answer appears direct." },
      sincerity:   { high: "Strong sincerity markers detected.", low: "Low sincerity signals — possible rehearsed answer." },
      engagement:  { high: "High engagement — candidate is animated.", low: "Low engagement — energy dropped noticeably." },
      knowledge:   { high: "Strong knowledge depth demonstrated.", low: "Knowledge signals shallow — watch for surface answers." },
      stress:      { high: "Stress markers elevated in recent response.", low: "" },
      avoidance:   { high: "Topic avoidance detected — answer may be deflection.", low: "" },
      confidence:  { high: "Overclaiming detected — probe for specifics.", low: "Underconfidence — possible imposter pattern or sandbagging." },
      cultural:             { high: "Strong culture-fit language.", low: "Weak culture-fit signals." },
      preparation:          { high: "Strong preparation signals.", low: "Low preparation signals." },
      rapport:              { high: "Strong rapport — prospect is comfortable.", low: "Rapport is thin — consider warming up." },
      buying_intent:        { high: "High buying intent signals detected.", low: "Low buying intent — prospect may not be ready." },
      objection_detected:   { high: "Objection detected — address directly.", low: "" },
      closing_opportunity:  { high: "Strong closing opportunity — consider asking for commitment.", low: "Prospect not yet at close." },
    };
    return labels[type]?.[dir] || summary || `${type} score: ${score}`;
  }

  // ── MINDSET SWITCH ───────────────────────────────────────────────────────
  function changeMindset(m) {
    setMindset(m);
    setEnabledSignals(MINDSETS[m].signals);
    setObjectives(MINDSETS[m].objectives.map(t => ({ text: t, done: false })));
  }

  // ── PLAYBOOKS ────────────────────────────────────────────────────────────
  function applyPlaybook(name) {
    const pb = savedPlaybooks.find(p => p.name === name);
    if (!pb) return;
    setMindset(pb.mindset);
    setRoleTitle(pb.roleTitle);
    setEnabledSignals(pb.enabledSignals);
    setObjectives((pb.objectives || []).map(t => ({ text: t, done: false })));
    setSelectedPlaybook(name);
  }

  function savePlaybook() {
    const name = playbookName.trim();
    if (!name) return;
    const pb = {
      name,
      mindset,
      roleTitle,
      enabledSignals,
      objectives: objectives.map(o => o.text),
    };
    const updated = [...savedPlaybooks.filter(p => p.name !== name), pb];
    localStorage.setItem("copilot-playbooks", JSON.stringify(updated));
    setSavedPlaybooks(updated);
    setSelectedPlaybook(name);
    setPlaybookName("");
  }

  function deletePlaybook(name) {
    const updated = savedPlaybooks.filter(p => p.name !== name);
    localStorage.setItem("copilot-playbooks", JSON.stringify(updated));
    setSavedPlaybooks(updated);
    if (selectedPlaybook === name) setSelectedPlaybook("");
  }

  // ── SPEAKER RESOLUTION (Deepgram diarization) ────────────────────────────
  function resolveSpeakerId(sid) {
    if (sid in speakerMapRef.current) return speakerMapRef.current[sid];
    const seen = speakersSeenRef.current;
    if (!seen.includes(sid)) seen.push(sid);
    const role = seen.indexOf(sid) === 0 ? "INTERVIEWER" : "CANDIDATE";
    speakerMapRef.current = { ...speakerMapRef.current, [sid]: role };
    setSpeakerMap({ ...speakerMapRef.current });
    return role;
  }

  function swapSpeakers() {
    const swapped = {};
    Object.entries(speakerMapRef.current).forEach(([id, role]) => {
      swapped[id] = role === "INTERVIEWER" ? "CANDIDATE" : "INTERVIEWER";
    });
    speakerMapRef.current = swapped;
    setSpeakerMap(swapped);
  }

  // ── SESSION CONTROLS ─────────────────────────────────────────────────────
  function startSession() {
    setPhase("live");
    setTranscript([]); setProbes([]); setSignals([]);
    setDismissed(new Set()); setScores({}); setElapsed(0);
    setAnalyzeStatus("idle"); setLastSummary(""); setAnalyzeError("");
    setDebrief(null);
    setEmailTo(""); setEmailStatus("idle"); setEmailError("");
    speakerMapRef.current = {};
    speakersSeenRef.current = [];
    setSpeakerMap({});
    setMonitorProbe(null);
    setMonitorSignal(null);
    setViewMode(window.innerWidth < 1100 ? "monitor" : "dashboard");

    timerRef.current = setInterval(() => setElapsed(e => e+1), 1000);

    // Periodic analysis every 30 seconds
    periodicRef.current = setInterval(() => {
      runAnalysis("periodic");
    }, 30000);

    // Auto-start mic
    toggleMic();
  }

  async function endSession() {
    clearInterval(timerRef.current);
    clearInterval(periodicRef.current);
    analyzeRef.current?.abort();

    // Fire debrief
    setDebriefLoading(true);
    setPhase("debrief");

    try {
      const res = await fetch(`${API_BASE}/debrief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: { candidateName, roleTitle, objectives: objectives.map(o => o.text) },
          transcript,
          signals: scores,
        }),
      });
      const data = await res.json();
      if (data.success) setDebrief(data.debrief);
    } catch (err) {
      setAnalyzeError(err.message);
    } finally {
      setDebriefLoading(false);
    }
  }

  // ── TRANSCRIPT INPUT ─────────────────────────────────────────────────────
  function submitTextEntry() {
    if (!inputText.trim()) return;
    const entry = { speaker: inputSpeaker, text: inputText.trim() };
    setTranscript(prev => [...prev, entry]);
    setInputText("");
    // Trigger analysis whenever interviewer asks a question
    if (inputSpeaker === "INTERVIEWER") {
      setTimeout(() => runAnalysis("question_asked"), 100);
    }
  }

  function handleInputKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitTextEntry();
    }
  }

  // ── MIC — Deepgram WebSocket streaming via backend relay ────────────────
  async function toggleMic() {
    if (micActive) {
      // ── STOP ──────────────────────────────────────────────────────────────
      recorderRef.current?.stop();
      recorderRef.current?.stream?.getTracks().forEach(t => t.stop());
      recorderRef.current = null;
      micWsRef.current?.close();
      micWsRef.current = null;
      interimRef.current = "";
      setMicActive(false);
      return;
    }

    // ── START ────────────────────────────────────────────────────────────────
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ws = new window.WebSocket(`${WS_BASE}/mic`);
      micWsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);

          if (msg.type === "transcript") {
            if (msg.is_final) {
              const text = msg.text.trim();
              if (text) {
                const speaker = resolveSpeakerId(msg.speakerId ?? 0);
                setTranscript(prev => [...prev, { speaker, text }]);
                interimRef.current = "";
              }
            }
          }

          if (msg.type === "utterance_end") {
            // Only trigger if analysis hasn't run in the last 20s
            if (Date.now() - lastAnalyzedRef.current > 20000) {
              runAnalysis("utterance_end");
            }
          }

          if (msg.type === "speech_start") {
            setHotMic("CANDIDATE");
          }

          if (msg.type === "error") {
            setAnalyzeError(msg.message);
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        setMicActive(false);
        setHotMic(null);
      };

      ws.onerror = () => {
        setAnalyzeError("Mic WebSocket error — is the backend running?");
        setMicActive(false);
      };

      // Wait for WS to open before starting MediaRecorder
      ws.onopen = () => {
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        recorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(e.data);
          }
        };

        recorder.start(250); // send chunks every 250ms
        setMicActive(true);
        setHotMic("CANDIDATE");
      };

    } catch (err) {
      setAnalyzeError(`Mic error: ${err.message}`);
    }
  }

  const candFirst = candidateName.split(" ")[0].toUpperCase();
  const activeProbes  = probes.filter(p => !dismissed.has(p.id));
  const activeSignals = signals.filter(s => !dismissed.has(s.id));

  // ── SETUP ──────────────────────────────────────────────────────────────
  if (phase === "setup") return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.body, fontFamily:"'IBM Plex Mono','Courier New',monospace", padding:"32px 24px" }}>
      <style>{GLOBAL_STYLES}</style>
      <div style={{ maxWidth:800, margin:"0 auto", animation:"fadeUp .4s ease" }}>
        <div style={{ marginBottom:32, borderBottom:`1px solid ${C.edge}`, paddingBottom:20 }}>
          <div style={{ fontSize:9, letterSpacing:6, color:C.muted, marginBottom:10 }}>
            INTERVIEW INTELLIGENCE SYSTEM · PRE-SESSION BRIEF
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <h1 style={{ fontSize:28, fontWeight:700, margin:0, color:C.bright, letterSpacing:-1 }}>Configure Session</h1>
            <div style={{ display:"flex", gap:4 }}>
              {Object.entries(MINDSETS).map(([key, m]) => (
                <button key={key} onClick={() => changeMindset(key)} style={{
                  padding:"6px 16px", borderRadius:4, fontSize:10, letterSpacing:2,
                  fontFamily:"inherit", cursor:"pointer", fontWeight:600,
                  border:`1px solid ${mindset===key ? "#3b82f6" : C.edge}`,
                  background: mindset===key ? "#1d4ed8" : C.surface,
                  color: mindset===key ? "#fff" : C.muted,
                  transition:"all .2s",
                }}>{m.label.toUpperCase()}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Playbook bar */}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20, padding:"10px 12px", background:C.surface, border:`1px solid ${C.edge}`, borderRadius:4 }}>
          <span style={{ fontSize:9, letterSpacing:3, color:C.muted, flexShrink:0 }}>PLAYBOOKS</span>
          <select
            value={selectedPlaybook}
            onChange={e => setSelectedPlaybook(e.target.value)}
            style={{ flex:1, background:C.bg, border:`1px solid ${C.edge}`, borderRadius:3, color: selectedPlaybook ? C.body : C.muted, padding:"5px 8px", fontSize:11, fontFamily:"inherit" }}
          >
            <option value="">— select —</option>
            {savedPlaybooks.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <button onClick={() => applyPlaybook(selectedPlaybook)} disabled={!selectedPlaybook} style={{
            padding:"5px 12px", background: selectedPlaybook ? "#1d4ed8" : C.edge,
            border:"none", borderRadius:3, color: selectedPlaybook ? "#fff" : C.muted,
            fontSize:9, fontFamily:"inherit", letterSpacing:2, cursor: selectedPlaybook ? "pointer" : "default",
          }}>LOAD</button>
          <button onClick={() => deletePlaybook(selectedPlaybook)} disabled={!selectedPlaybook} style={{
            padding:"5px 10px", background:"transparent",
            border:`1px solid ${selectedPlaybook ? "#7f1d1d" : C.edge}`, borderRadius:3,
            color: selectedPlaybook ? "#f87171" : C.muted,
            fontSize:9, fontFamily:"inherit", cursor: selectedPlaybook ? "pointer" : "default",
          }}>DEL</button>
          <div style={{ width:1, height:20, background:C.edge, flexShrink:0 }}/>
          <input
            value={playbookName}
            onChange={e => setPlaybookName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && savePlaybook()}
            placeholder="Save as..."
            style={{ width:130, background:C.bg, border:`1px solid ${C.edge}`, borderRadius:3, color:C.body, padding:"5px 8px", fontSize:11, fontFamily:"inherit" }}
          />
          <button onClick={savePlaybook} disabled={!playbookName.trim()} style={{
            padding:"5px 12px", background: playbookName.trim() ? "#166534" : C.edge,
            border:"none", borderRadius:3, color: playbookName.trim() ? "#6ee7b7" : C.muted,
            fontSize:9, fontFamily:"inherit", letterSpacing:2, cursor: playbookName.trim() ? "pointer" : "default",
          }}>SAVE</button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:32 }}>
          {/* Left */}
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            {[[MINDSETS[mindset].nameLabel, candidateName, setCandidateName], [MINDSETS[mindset].roleLabel, roleTitle, setRoleTitle]].map(([lbl,val,set]) => (
              <div key={lbl}>
                <div style={{ fontSize:9, letterSpacing:3, color:C.muted, marginBottom:7 }}>{lbl.toUpperCase()}</div>
                <input value={val} onChange={e => set(e.target.value)} style={{
                  width:"100%", background:C.surface, border:`1px solid ${C.edge}`,
                  borderRadius:4, color:C.bright, padding:"10px 12px", fontSize:13, fontFamily:"inherit",
                }}/>
              </div>
            ))}
            <div>
              <div style={{ fontSize:9, letterSpacing:3, color:C.muted, marginBottom:8 }}>INTERVIEW OBJECTIVES</div>
              {objectives.map((obj,i) => (
                <div key={i} onClick={() => setObjectives(p => p.map((o,j) => j===i?{...o,done:!o.done}:o))}
                  style={{
                    display:"flex", alignItems:"flex-start", gap:10,
                    padding:"9px 12px", borderRadius:4, cursor:"pointer", marginBottom:4,
                    background: obj.done ? "#0f2010" : C.surface,
                    border:`1px solid ${obj.done ? "#22863a" : C.edge}`,
                    transition:"all .2s",
                  }}>
                  <div style={{
                    width:14, height:14, borderRadius:3, flexShrink:0, marginTop:1,
                    background: obj.done ? "#16a34a" : "transparent",
                    border:`1.5px solid ${obj.done ? "#16a34a" : C.muted}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    {obj.done && <span style={{ color:"#fff", fontSize:9 }}>✓</span>}
                  </div>
                  <span style={{ fontSize:12, color: obj.done ? "#6ee7b7" : C.body, lineHeight:1.5 }}>{obj.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — signal toggles */}
          <div>
            <div style={{ fontSize:9, letterSpacing:3, color:C.muted, marginBottom:12 }}>ACTIVE SIGNAL MODULES</div>
            {Object.entries(CATEGORIES).map(([catKey, catLabel]) => (
              <div key={catKey} style={{ marginBottom:16 }}>
                <div style={{ fontSize:9, letterSpacing:2, color:C.muted, opacity:.6, marginBottom:6 }}>{catLabel.toUpperCase()}</div>
                {Object.entries(SIGNAL_TYPES).filter(([,v]) => v.category===catKey).map(([key, sig]) => {
                  const on = enabledSignals[key];
                  return (
                    <div key={key} onClick={() => setEnabledSignals(p => ({...p,[key]:!p[key]}))} style={{
                      display:"flex", alignItems:"center", gap:10,
                      padding:"8px 10px", borderRadius:4, cursor:"pointer", marginBottom:3,
                      background: on ? sig.bg : C.surface,
                      border:`1px solid ${on ? sig.border+"70" : C.edge}`,
                      transition:"all .2s",
                    }}>
                      <div style={{
                        width:26, height:14, borderRadius:7, position:"relative", flexShrink:0,
                        background: on ? sig.color : C.edge, transition:"background .25s",
                      }}>
                        <div style={{
                          position:"absolute", top:2, left: on?12:2,
                          width:10, height:10, borderRadius:"50%",
                          background:"#fff", transition:"left .25s",
                        }}/>
                      </div>
                      <span style={{ fontSize:11, color: on?sig.color:C.muted, width:14, flexShrink:0 }}>{sig.icon}</span>
                      <div>
                        <div style={{ fontSize:11, color: on?C.bright:C.muted, fontWeight:600 }}>{sig.label}</div>
                        <div style={{ fontSize:10, color: on?C.muted:"#374151" }}>{sig.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop:24, paddingTop:20, borderTop:`1px solid ${C.edge}`, display:"flex", alignItems:"center", gap:16 }}>
          <span style={{ fontSize:11, color:C.muted }}>
            {Object.values(enabledSignals).filter(Boolean).length} / {Object.keys(SIGNAL_TYPES).length} modules active
          </span>
          <button onClick={startSession} style={{
            marginLeft:"auto", padding:"13px 36px", background:"#1d4ed8",
            border:"none", borderRadius:4, color:"#fff", fontSize:11,
            fontFamily:"inherit", letterSpacing:4, fontWeight:700, cursor:"pointer",
          }}>BEGIN SESSION ▶</button>
        </div>
      </div>
    </div>
  );

  // ── DEBRIEF ────────────────────────────────────────────────────────────
  if (phase === "debrief") return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.body, fontFamily:"'IBM Plex Mono','Courier New',monospace", padding:28 }}>
      <style>{GLOBAL_STYLES}</style>
      <div style={{ maxWidth:820, margin:"0 auto", animation:"fadeUp .4s ease" }}>
        <div style={{ fontSize:9, letterSpacing:5, color:C.muted, marginBottom:8 }}>SESSION COMPLETE · {fmt(elapsed)}</div>
        <h1 style={{ fontSize:26, fontWeight:700, margin:"0 0 4px", color:C.bright }}>Debrief: {candidateName}</h1>
        <div style={{ fontSize:12, color:C.muted, marginBottom:24 }}>{roleTitle}</div>

        {debriefLoading && (
          <div style={{ display:"flex", alignItems:"center", gap:12, color:C.muted, marginBottom:24 }}>
            <span style={{ display:"inline-block", animation:"spin 1s linear infinite", fontSize:16 }}>◌</span>
            <span style={{ fontSize:12 }}>Generating full debrief with Claude...</span>
          </div>
        )}

        {debrief && (
          <>
            {/* Verdict */}
            <div style={{
              padding:"14px 20px", marginBottom:20, borderRadius:6,
              background:C.surface, border:`1px solid ${C.edge}`,
              display:"flex", alignItems:"center", gap:16,
            }}>
              <div>
                <div style={{ fontSize:9, letterSpacing:3, color:C.muted, marginBottom:4 }}>HIRING VERDICT</div>
                <div style={{ fontSize:20, fontWeight:700, color:C.bright }}>{debrief.verdict}</div>
              </div>
              <div style={{ marginLeft:"auto", fontSize:12, color:C.muted, maxWidth:400, lineHeight:1.6 }}>
                {debrief.headline}
              </div>
            </div>

            {/* Signal score rings */}
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:24 }}>
              {Object.entries(scores).map(([key,val]) => {
                const sig = SIGNAL_TYPES[key]; if (!sig) return null;
                return (
                  <div key={key} style={{
                    padding:"12px 14px", background:sig.bg, border:`1px solid ${sig.border}60`,
                    borderRadius:6, display:"flex", alignItems:"center", gap:10,
                  }}>
                    <div style={{ position:"relative", flexShrink:0 }}>
                      <Ring score={val} color={sig.color} size={44}/>
                      <span style={{
                        position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:12, fontWeight:700, color:sig.color,
                      }}>{val}</span>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:sig.color }}>{sig.icon}</div>
                      <div style={{ fontSize:9, color:C.muted, letterSpacing:1, marginTop:2 }}>{sig.label.toUpperCase()}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Observations */}
            <div style={{ marginBottom:20 }}>
              <SectionLabel>Observations</SectionLabel>
              {debrief.observations?.map((obs, i) => {
                const borderColor = obs.type==="positive" ? "#6ee7b7" : obs.type==="concern" ? "#f87171" : C.muted;
                return (
                  <div key={i} style={{
                    marginBottom:5, padding:"10px 14px",
                    background:C.surface, borderLeft:`3px solid ${borderColor}`,
                    borderRadius:"0 4px 4px 0",
                  }}>
                    <span style={{ fontSize:12, color:C.body, lineHeight:1.7 }}>{obs.text}</span>
                  </div>
                );
              })}
            </div>

            {/* Next steps */}
            <div style={{ marginBottom:20 }}>
              <SectionLabel>Recommended Next Steps</SectionLabel>
              {debrief.next_steps?.map((s,i) => (
                <div key={i} style={{
                  display:"flex", gap:10, marginBottom:5, padding:"9px 12px",
                  background:C.surface, border:`1px solid ${C.edge}`, borderRadius:4,
                }}>
                  <span style={{ color:"#60a5fa", flexShrink:0 }}>→</span>
                  <span style={{ fontSize:12, color:C.body }}>{s}</span>
                </div>
              ))}
            </div>

            {/* Follow-up email draft */}
            {debrief.follow_up_email_draft && (
              <div style={{ marginBottom:28 }}>
                <SectionLabel>Follow-Up Email Draft</SectionLabel>
                <div style={{
                  padding:16, background:C.surface, border:`1px solid ${C.edge}`,
                  borderRadius:4, fontSize:12, color:C.body, lineHeight:1.8,
                  whiteSpace:"pre-wrap",
                }}>
                  {debrief.follow_up_email_draft}
                </div>
              </div>
            )}
          </>
        )}

        {/* Fallback if no debrief (e.g. server offline) */}
        {!debriefLoading && !debrief && (
          <div style={{ padding:20, background:C.surface, border:`1px solid ${C.edge}`, borderRadius:6, marginBottom:24 }}>
            <div style={{ fontSize:12, color:"#f87171", marginBottom:8 }}>⚠ Could not connect to backend for AI debrief.</div>
            <div style={{ fontSize:11, color:C.muted }}>Signal scores and transcript are still available below.</div>
          </div>
        )}

        {/* Email report */}
        {debrief && (
          <div style={{ marginBottom:20, padding:16, background:C.surface, border:`1px solid ${C.edge}`, borderRadius:6 }}>
            <div style={{ fontSize:10, letterSpacing:3, color:C.muted, marginBottom:10 }}>EMAIL REPORT</div>
            {emailStatus === "sent" ? (
              <div style={{ fontSize:13, color:"#6ee7b7" }}>✓ Report sent to {emailTo}</div>
            ) : (
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                <input
                  type="email"
                  placeholder="recipient@email.com"
                  value={emailTo}
                  onChange={e => setEmailTo(e.target.value)}
                  style={{
                    flex:1, minWidth:200, padding:"8px 12px",
                    background:C.surfaceAlt, border:`1px solid ${C.edge}`,
                    borderRadius:3, color:C.bright, fontSize:12, fontFamily:"inherit",
                    outline:"none",
                  }}
                />
                <button
                  disabled={emailStatus === "sending" || !emailTo.includes("@")}
                  onClick={async () => {
                    setEmailStatus("sending"); setEmailError("");
                    try {
                      const res = await fetch(`${API_BASE}/email-debrief`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          to: emailTo,
                          config: { candidateName, roleTitle },
                          debrief,
                          scores,
                        }),
                      });
                      const data = await res.json();
                      if (data.success) setEmailStatus("sent");
                      else { setEmailError(data.error || "Send failed"); setEmailStatus("error"); }
                    } catch (err) {
                      setEmailError(err.message); setEmailStatus("error");
                    }
                  }}
                  style={{
                    padding:"8px 20px", borderRadius:3, fontFamily:"inherit",
                    fontSize:10, letterSpacing:2, cursor: emailStatus === "sending" ? "default" : "pointer",
                    background: emailStatus === "sending" ? C.edge : "#1d4ed8",
                    border:"none", color: emailStatus === "sending" ? C.muted : "#fff",
                  }}
                >{emailStatus === "sending" ? "SENDING..." : "SEND"}</button>
              </div>
            )}
            {emailStatus === "error" && (
              <div style={{ fontSize:11, color:"#f87171", marginTop:6 }}>⚠ {emailError}</div>
            )}
          </div>
        )}

        <div style={{ display:"flex", gap:10 }}>
          <button onClick={() => setPhase("setup")} style={{
            padding:"10px 24px", background:"transparent", border:`1px solid ${C.edge}`,
            borderRadius:3, color:C.muted, fontSize:10, fontFamily:"inherit",
            letterSpacing:3, cursor:"pointer",
          }}>← NEW SESSION</button>
        </div>
      </div>
    </div>
  );

  // ── MONITOR VIEW (tablet, quiet mode) ────────────────────────────────
  if (phase === "live" && viewMode === "monitor") return (
    <div style={{
      height:"100vh", background:C.bg, position:"relative", overflow:"hidden",
      fontFamily:"'IBM Plex Mono','Courier New',monospace", color:C.body,
      userSelect:"none",
    }}>
      <style>{GLOBAL_STYLES}</style>

      {/* Top bar */}
      <div style={{
        position:"absolute", top:0, left:0, right:0,
        padding:"14px 20px", display:"flex", alignItems:"center", gap:12,
        borderBottom:`1px solid ${C.edge}22`,
      }}>
        <span style={{
          width:7, height:7, borderRadius:"50%", background:"#ef4444", flexShrink:0,
          animation:"micPulse 1.2s ease-in-out infinite", boxShadow:"0 0 8px #ef444490",
        }}/>
        <span style={{ fontSize:12, color:C.muted }}>{candidateName}</span>
        <span style={{ fontSize:11, color:C.edge, marginLeft:4 }}>·</span>
        <span style={{ fontSize:12, color:C.muted }}>{roleTitle}</span>
        <span style={{ fontSize:13, color:C.muted, fontVariantNumeric:"tabular-nums", marginLeft:"auto" }}>{fmt(elapsed)}</span>
        <button onClick={() => setViewMode("dashboard")} style={{
          padding:"6px 12px", background:"transparent", border:`1px solid ${C.edge}`,
          borderRadius:3, color:C.muted, fontSize:10, fontFamily:"inherit", letterSpacing:2, cursor:"pointer",
        }}>⊞ FULL</button>
        <button onClick={endSession} style={{
          padding:"6px 14px", background:"transparent", border:`1px solid ${C.edge}`,
          borderRadius:3, color:C.muted, fontSize:10, fontFamily:"inherit", letterSpacing:2, cursor:"pointer",
        }}>■ END</button>
      </div>

      {/* Probe card — center screen */}
      {monitorProbe && (
        <div onClick={() => setMonitorProbe(null)} style={{
          position:"absolute", top:"45%", left:"50%",
          transform:"translate(-50%, -50%)",
          width:"82%", maxWidth:580,
          padding:"28px 32px",
          background:"#0c1d2e",
          border:"1px solid #0ea5e940",
          borderLeft:"5px solid #0ea5e9",
          borderRadius:"0 14px 14px 0",
          animation:"probeIn .4s ease",
          cursor:"pointer",
        }}>
          <div style={{ fontSize:10, letterSpacing:3, color:"#38bdf8", marginBottom:12 }}>SUGGESTED PROBE</div>
          <div style={{ fontSize:26, color:"#e0f2fe", lineHeight:1.55, fontWeight:500 }}>
            → {monitorProbe.text}
          </div>
          <div style={{ fontSize:10, color:C.edge, marginTop:14 }}>tap to dismiss</div>
        </div>
      )}

      {/* Signal badge — below center */}
      {monitorSignal && (() => {
        const cfg = SIGNAL_TYPES[monitorSignal.type]; if (!cfg) return null;
        return (
          <div onClick={() => setMonitorSignal(null)} style={{
            position:"absolute", bottom:"26%", left:"50%", transform:"translateX(-50%)",
            padding:"14px 24px",
            background:cfg.bg, border:`1px solid ${cfg.border}60`,
            borderLeft:`4px solid ${cfg.border}`,
            borderRadius:"0 10px 10px 0",
            animation:"sigIn .3s ease", cursor:"pointer", whiteSpace:"nowrap",
          }}>
            <span style={{ color:cfg.color, fontSize:15 }}>{cfg.icon} </span>
            <span style={{ fontSize:15, color:cfg.color, fontWeight:600, letterSpacing:1 }}>{cfg.label}</span>
            {monitorSignal.score != null && (
              <span style={{ color:cfg.color, fontSize:18, fontWeight:700, marginLeft:14 }}>{monitorSignal.score}</span>
            )}
          </div>
        );
      })()}

      {/* Idle / analyzing state */}
      {!monitorProbe && !monitorSignal && (
        <div style={{
          position:"absolute", top:"50%", left:"50%",
          transform:"translate(-50%, -50%)",
          color: analyzeStatus === "analyzing" ? C.muted : C.edge,
          fontSize:13, textAlign:"center", display:"flex", alignItems:"center", gap:10,
        }}>
          {analyzeStatus === "analyzing"
            ? <><span style={{ animation:"spin 1s linear infinite", display:"inline-block", fontSize:16 }}>◌</span> analyzing...</>
            : "listening..."
          }
        </div>
      )}

      {/* Mic button — bottom right */}
      <button onClick={toggleMic} style={{
        position:"absolute", bottom:28, right:28,
        width:68, height:68, borderRadius:"50%",
        background: micActive ? "#14532d" : "#1e293b",
        border:`2px solid ${micActive ? "#22c55e" : C.edge}`,
        color: micActive ? "#6ee7b7" : C.muted,
        fontSize:28, cursor:"pointer",
        display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow: micActive ? "0 0 20px #22c55e50" : "none",
        transition:"all .25s",
      }}>🎙</button>

      {/* Analyze button — bottom left, subtle */}
      <button onClick={() => runAnalysis("manual")} style={{
        position:"absolute", bottom:40, left:28,
        padding:"10px 18px", background:"#1e3a5f", border:`1px solid #3b82f6`,
        borderRadius:4, color:"#93c5fd", fontSize:10, fontFamily:"inherit",
        letterSpacing:2, cursor:"pointer",
      }}>ANALYZE NOW</button>
    </div>
  );

  // ── LIVE (dashboard) ──────────────────────────────────────────────────
  return (
    <div style={{
      height:"100vh", background:C.bg, color:C.body,
      fontFamily:"'IBM Plex Mono','Courier New',monospace",
      display:"grid",
      gridTemplateRows: isPortrait ? "48px 1fr auto auto" : "56px 1fr auto auto",
      gridTemplateColumns: isTablet ? (showSignals ? "1fr 280px" : "1fr 0px") : "1fr 320px",
      overflow:"hidden",
    }}>
      <style>{GLOBAL_STYLES}</style>

      {/* ── TOP BAR ── */}
      <div style={{
        gridColumn:"1/-1", background:C.surface, borderBottom:`1px solid ${C.edge}`,
        display:"flex", alignItems:"center", padding:"0 16px", gap:12,
      }}>
        <span style={{
          width:7, height:7, borderRadius:"50%", background:"#ef4444", flexShrink:0,
          animation:"micPulse 1.2s ease-in-out infinite", boxShadow:"0 0 8px #ef444490",
        }}/>
        <span style={{ fontSize:9, letterSpacing:4, color:"#f87171" }}>LIVE</span>
        <div style={{ width:1, height:18, background:C.edge }}/>
        <HotMic active={false} label="YOU"     color="#60a5fa"/>
        <HotMic active={micActive} label={candFirst} color="#4ade80"/>
        {Object.keys(speakerMap).length > 0 && (
          <button onClick={swapSpeakers} style={{
            padding:"2px 8px", background:"transparent",
            border:`1px solid ${C.edge}`, borderRadius:3,
            color:C.muted, fontSize:9, fontFamily:"inherit",
            letterSpacing:2, cursor:"pointer",
          }} title="Swap speaker roles if auto-assignment is backwards">⇄ SWAP</button>
        )}
        <div style={{ width:1, height:18, background:C.edge }}/>
        <span style={{ fontSize:11, color:C.muted }}>{candidateName} · {roleTitle}</span>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={() => setViewMode("monitor")} style={{
            padding:"6px 12px", background:"transparent", border:`1px solid ${C.edge}`,
            borderRadius:3, color:C.muted, fontSize:10, fontFamily:"inherit", letterSpacing:2, cursor:"pointer",
          }}>◉ MONITOR</button>
          {isTablet && (
            <button onClick={() => setShowSignals(p => !p)} style={{
              padding:"6px 12px", background: showSignals ? "#1c1c2a" : "transparent",
              border:`1px solid ${C.edge}`, borderRadius:3,
              color:C.muted, fontSize:10, fontFamily:"inherit", letterSpacing:2, cursor:"pointer",
            }}>{showSignals ? "HIDE ◧" : "SIGNALS ◨"}</button>
          )}
          <StatusPill status={analyzeStatus}/>
          {lastSummary && (
            <span style={{ fontSize:9, color:C.muted, maxWidth:240, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {lastSummary}
            </span>
          )}
          <span style={{ fontSize:12, color:C.muted, fontVariantNumeric:"tabular-nums" }}>{fmt(elapsed)}</span>
          <button onClick={endSession} style={{
            padding:"8px 18px", background:"transparent", border:`1px solid ${C.edge}`,
            borderRadius:4, color:C.muted, fontSize:11, fontFamily:"inherit", letterSpacing:2, cursor:"pointer",
          }}>END</button>
        </div>
      </div>

      {/* ── CENTER: PROBE FEED ── */}
      <div style={{ overflow:"auto", padding:"16px 20px", display:"flex", flexDirection:"column", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:2 }}>
          <span style={{ fontSize:9, letterSpacing:4, color:"#38bdf8" }}>SUGGESTED PROBES</span>
          {activeProbes.length > 0 && (
            <span style={{
              fontSize:9, background:"#0ea5e925", border:"1px solid #0ea5e950",
              color:"#38bdf8", padding:"1px 8px", borderRadius:10,
            }}>{activeProbes.length}</span>
          )}
          {activeProbes.length > 0 && (
            <button onClick={() => setDismissed(p => new Set([...p, ...activeProbes.map(f=>f.id)]))} style={{
              marginLeft:"auto", background:"none", border:"none",
              color:C.muted, fontSize:10, fontFamily:"inherit", letterSpacing:2, cursor:"pointer", padding:0,
            }}>CLEAR ALL</button>
          )}
          {/* Manual analyze button */}
          <button onClick={() => runAnalysis("manual")} style={{
            marginLeft: activeProbes.length > 0 ? 0 : "auto",
            background:"#1e3a5f", border:`1px solid #3b82f6`,
            borderRadius:3, color:"#93c5fd", fontSize:9, fontFamily:"inherit",
            letterSpacing:2, cursor:"pointer", padding:"3px 10px",
          }}>ANALYZE NOW</button>
        </div>

        {/* Error display */}
        {analyzeError && (
          <div style={{ padding:"10px 14px", background:"#2a1010", border:"1px solid #ef444460", borderRadius:4, fontSize:11, color:"#fca5a5" }}>
            ⚠ {analyzeError} — is the backend running on port 3001?
          </div>
        )}

        {activeProbes.length === 0 && !analyzeError && (
          <div style={{
            flex:1, display:"flex", alignItems:"center", justifyContent:"center",
            color:C.edge, fontSize:12, flexDirection:"column", gap:10,
          }}>
            <span style={{ fontSize:32, color:C.edge }}>→</span>
            <span>Add transcript entries below, then hit Analyze Now</span>
          </div>
        )}

        {activeProbes.map(probe => (
          <div key={probe.id} style={{
            padding:"18px 20px",
            background:"#0c1d2e",
            border:"1px solid #0ea5e940",
            borderLeft:"4px solid #0ea5e9",
            borderRadius:"0 8px 8px 0",
            display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:14,
            animation:"probeIn .3s ease",
          }}>
            <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
              <span style={{ fontSize:22, color:"#38bdf8", flexShrink:0, lineHeight:1, marginTop:2 }}>→</span>
              <span style={{ fontSize:17, color:"#e0f2fe", lineHeight:1.55, fontWeight:500 }}>{probe.text}</span>
            </div>
            <button onClick={() => setDismissed(p => new Set([...p, probe.id]))} style={{
              background:"none", border:"none", color:C.muted,
              cursor:"pointer", fontSize:20, padding:"0 2px", fontFamily:"inherit", flexShrink:0, lineHeight:1,
            }}
              onMouseEnter={e=>e.target.style.color="#38bdf8"}
              onMouseLeave={e=>e.target.style.color=C.muted}
            >×</button>
          </div>
        ))}
      </div>

      {/* ── RIGHT: SIGNALS PANEL ── */}
      <div style={{
        gridRow:"2/5", overflow:"auto", padding: (isTablet && !showSignals) ? "0" : "14px 12px",
        borderLeft:`1px solid ${C.edge}`, background:C.surfaceAlt,
        display: (isTablet && !showSignals) ? "none" : "block",
      }}>
        <div style={{ marginBottom:14 }}>
          <SectionLabel>Scores</SectionLabel>
          {Object.entries(SIGNAL_TYPES)
            .filter(([k]) => enabledSignals[k] && k !== "followup")
            .map(([key,sig]) => (
              <div key={key} style={{ marginBottom:9 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:18, letterSpacing:0, color:C.muted }}>{sig.icon} {sig.label}</span>
                  <span style={{ fontSize:10, color: scores[key] ? sig.color : C.edge, fontVariantNumeric:"tabular-nums" }}>
                    {scores[key] || "–"}
                  </span>
                </div>
                <div style={{ height:3, background:C.edge, borderRadius:2 }}>
                  <div style={{
                    height:"100%", background:sig.color, borderRadius:2,
                    width:`${scores[key]||0}%`,
                    transition:"width 1s cubic-bezier(.4,0,.2,1)",
                    boxShadow: scores[key] ? `0 0 6px ${sig.color}60` : "none",
                  }}/>
                </div>
              </div>
            ))}
        </div>

        <div style={{ height:1, background:C.edge, marginBottom:12 }}/>

        <div style={{ marginBottom:12 }}>
          <SectionLabel>Objectives</SectionLabel>
          {objectives.map((obj,i) => (
            <div key={i}
              onClick={() => setObjectives(p => p.map((o,j) => j===i?{...o,done:!o.done}:o))}
              style={{ display:"flex", gap:7, alignItems:"flex-start", marginBottom:6, cursor:"pointer" }}>
              <div style={{
                width:12, height:12, borderRadius:2, flexShrink:0, marginTop:1,
                background: obj.done ? "#16a34a" : "transparent",
                border:`1.5px solid ${obj.done ? "#16a34a" : C.muted}`,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>
                {obj.done && <span style={{ color:"#fff", fontSize:8 }}>✓</span>}
              </div>
              <span style={{
                fontSize:18, color: obj.done ? "#6ee7b7" : C.body,
                lineHeight:1.4, textDecoration: obj.done ? "line-through" : "none",
              }}>{obj.text}</span>
            </div>
          ))}
        </div>

        <div style={{ height:1, background:C.edge, marginBottom:12 }}/>

        <div>
          <SectionLabel>Live Signals</SectionLabel>
          {activeSignals.length === 0 && (
            <div style={{ fontSize:10, color:C.muted, textAlign:"center", marginTop:12 }}>Monitoring...</div>
          )}
          {activeSignals.map(sig => {
            const cfg = SIGNAL_TYPES[sig.type]; if (!cfg) return null;
            return (
              <div key={sig.id} style={{
                marginBottom:7, padding:"9px 10px",
                background:cfg.bg, border:`1px solid ${cfg.border}50`,
                borderLeft:`3px solid ${cfg.border}`,
                borderRadius:"0 5px 5px 0",
                animation:"sigIn .3s ease",
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <span style={{ color:cfg.color, fontSize:10 }}>{cfg.icon}</span>
                    <span style={{ fontSize:8, letterSpacing:1.5, color:cfg.color, fontWeight:600 }}>{cfg.label.toUpperCase()}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    {sig.score != null && <span style={{ fontSize:11, color:cfg.color, fontWeight:700 }}>{sig.score}</span>}
                    <button onClick={() => setDismissed(p => new Set([...p, sig.id]))} style={{
                      background:"none", border:"none", color:C.muted,
                      cursor:"pointer", fontSize:14, padding:0, lineHeight:1, fontFamily:"inherit",
                    }}>×</button>
                  </div>
                </div>
                <p style={{ margin:0, fontSize:10, color:C.body, lineHeight:1.55 }}>{sig.note}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── TEXT INPUT BAR ── */}
      <div style={{
        gridColumn:"1/2",
        borderTop:`1px solid ${C.edge}`,
        background:C.surface,
        padding:"10px 16px",
        display:"flex", gap:8, alignItems:"flex-end",
      }}>
        {/* Speaker toggle */}
        <div style={{ display:"flex", flexDirection:"column", gap:3, flexShrink:0 }}>
          {["INTERVIEWER", "CANDIDATE"].map(spk => (
            <button key={spk} onClick={() => setInputSpeaker(spk)} style={{
              padding:"10px 14px", borderRadius:6, fontSize:12, letterSpacing:1,
              fontFamily:"inherit", cursor:"pointer", border:"none", minHeight:44,
              background: inputSpeaker===spk ? (spk==="INTERVIEWER" ? "#1d4ed8" : "#166534") : C.edge,
              color: inputSpeaker===spk ? "#fff" : C.muted,
            }}>{spk === "INTERVIEWER" ? "YOU" : candFirst}</button>
          ))}
        </div>

        {/* Text input */}
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={`Type ${inputSpeaker === "INTERVIEWER" ? "your question" : "candidate's response"}... (Enter to submit)`}
          rows={isPortrait ? 2 : 3}
          style={{
            flex:1, background:C.bg, border:`1px solid ${C.edge}`,
            borderRadius:6, color:C.body, padding: isPortrait ? "8px 12px" : "12px 14px",
            fontSize:15, fontFamily:"inherit", lineHeight:1.5,
          }}
        />

        <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
          <button onClick={submitTextEntry} style={{
            padding:"12px 22px", background:"#1d4ed8", border:"none",
            borderRadius:6, color:"#fff", fontSize:13, fontFamily:"inherit",
            letterSpacing:2, cursor:"pointer", fontWeight:600, minHeight:44,
          }}>ADD →</button>
          <button onClick={toggleMic} style={{
            width:60, height:60, borderRadius:"50%", flexShrink:0,
            background: micActive ? "#14532d" : "#1e293b",
            border: `2px solid ${micActive ? "#22c55e" : C.edge}`,
            color: micActive ? "#6ee7b7" : C.muted,
            fontSize:26, cursor:"pointer", display:"flex",
            alignItems:"center", justifyContent:"center",
            boxShadow: micActive ? "0 0 18px #22c55e50" : "none",
            transition:"all .25s",
          }}>🎙</button>
        </div>
      </div>

      {/* ── TRANSCRIPT TICKER ── */}
      <div ref={tickerRef} style={{
        gridColumn:"1/2",
        overflow:"auto",
        borderTop:`1px solid ${C.edge}`,
        background:C.bg,
        padding:"6px 20px",
        display:"flex",
        flexDirection:"column",
        justifyContent:"flex-end",
        gap:3,
        maxHeight: isPortrait ? 52 : 72,
      }}>
        {transcript.length === 0 && (
          <span style={{ fontSize:11, color:C.muted }}>Type transcript entries above to begin...</span>
        )}
        {transcript.slice(-4).map((ev,i,arr) => {
          const isLatest = i === arr.length - 1;
          return (
            <div key={i} style={{
              display:"flex", gap:10, alignItems:"baseline",
              opacity: isLatest ? 1 : 0.25 + (i/arr.length)*0.4,
              transition:"opacity .4s",
            }}>
              <span style={{
                fontSize:9, letterSpacing:2, flexShrink:0, minWidth:40,
                color: ev.speaker==="INTERVIEWER" ? "#60a5fa" : "#4ade80",
              }}>
                {ev.speaker==="INTERVIEWER" ? "YOU" : candFirst}
              </span>
              <span style={{
                fontSize:11, color: isLatest ? C.body : C.muted,
                lineHeight:1.4, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
              }}>{ev.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
