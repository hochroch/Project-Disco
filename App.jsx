import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// ── CONFIG ────────────────────────────────────────────────────────────────
const API_BASE  = import.meta.env.VITE_API_BASE || `http://${window.location.hostname}:3001`;
const WS_BASE   = API_BASE.replace(/^http/, "ws");

// Werner Backbone Supabase — anon key is public, safe to ship
const SUPA = createClient(
  "https://dtazswxluhmdwwibgawn.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0YXpzd3hsdWhtZHd3aWJnYXduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MTI3MTAsImV4cCI6MjA4Njk4ODcxMH0.gzR_uBz4ooctK3IxemLkknLhn6kusMP99TcnL57Jlgs"
);
// 'disco' role was removed from users.role CHECK constraint on 2026-04-29 in Werner's
// drop_disco_sales_playbooks migration. Keeping it here would just be dead code.
const DISCO_ALLOWED_ROLES = new Set(["admin", "vice_president", "manager", "office"]);

// ── COLOR SYSTEM ──────────────────────────────────────────────────────────
// Contrast ratios on C.bg (#0d0d14):
//   bright (#f1f5f9) ≈ 14:1   headings, primary text
//   body   (#c4c9d4) ≈ 10:1   regular body / paragraph text
//   muted  (#9ca3af) ≈ 6.4:1  secondary labels, AA pass for small text
//   dim    (#6b7280) ≈ 4.2:1  tertiary/disabled hints — never use under 11px
//   edge   (#252538) ≈ 1.7:1  BORDERS ONLY — never use as text color
const C = {
  bg:         "#0d0d14",
  surface:    "#161622",
  surfaceAlt: "#1c1c2a",
  edge:       "#252538",
  muted:      "#9ca3af",
  dim:        "#6b7280",
  body:       "#d6dae3",
  bright:     "#f5f7fb",
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
  // Negotiation mindset signals
  anchor_detection:    { label:"Anchor Detection",    icon:"⚓", color:"#fb923c", bg:"#1a1008", border:"#ea580c", desc:"First offers, reference points, framing attempts",  defaultOn:false, category:"integrity"  },
  concession_tracking: { label:"Concession Tracking", icon:"⇌", color:"#a78bfa", bg:"#130d2e", border:"#7c3aed", desc:"Rate and pattern of concessions given vs received", defaultOn:false, category:"competence" },
  leverage_signals:    { label:"Leverage Signals",    icon:"◆", color:"#fbbf24", bg:"#1a1400", border:"#d97706", desc:"Power dynamics, alternatives, urgency indicators",  defaultOn:false, category:"competence" },
  emotional_pressure:  { label:"Emotional Pressure",  icon:"⚡", color:"#f87171", bg:"#2a1010", border:"#ef4444", desc:"Guilt, urgency, scarcity tactics detected",         defaultOn:false, category:"integrity"  },
  zone_of_agreement:   { label:"Zone of Agreement",   icon:"◎", color:"#34d399", bg:"#052e1a", border:"#10b981", desc:"How close parties are to a deal",                   defaultOn:false, category:"interest"   },
  commitment_language: { label:"Commitment Language",  icon:"✓", color:"#60a5fa", bg:"#0c1a2e", border:"#2563eb", desc:"Firm commitments vs hedging and deferrals",         defaultOn:false, category:"interest"   },
  // Coaching / Performance Review signals
  psychological_safety:     { label:"Psychological Safety",     icon:"♡", color:"#86efac", bg:"#052e16", border:"#22c55e", desc:"Is the employee opening up or shutting down?",    defaultOn:false, category:"interest"   },
  accountability_acceptance:{ label:"Accountability",           icon:"✓", color:"#60a5fa", bg:"#0c1a2e", border:"#2563eb", desc:"Owning the issue vs deflecting or blaming",       defaultOn:false, category:"integrity"  },
  defensiveness:            { label:"Defensiveness",            icon:"⛊", color:"#f87171", bg:"#2a1010", border:"#ef4444", desc:"Pushback, blame-shifting, shutting down",         defaultOn:false, category:"integrity"  },
  growth_mindset:           { label:"Growth Mindset",           icon:"↑", color:"#a78bfa", bg:"#130d2e", border:"#7c3aed", desc:"'I can work on that' vs 'that's just how I am'",  defaultOn:false, category:"competence" },
  action_commitment:        { label:"Action Commitment",        icon:"►", color:"#fbbf24", bg:"#1a1400", border:"#d97706", desc:"Concrete next steps being agreed to",             defaultOn:false, category:"competence" },
  // Discovery / Diagnostic signals
  coverage_completeness:    { label:"Coverage",              icon:"▦", color:"#60a5fa", bg:"#0c1a2e", border:"#2563eb", desc:"How much of the diagnostic framework has been explored",   defaultOn:false, category:"competence" },
  symptom_severity:         { label:"Severity",              icon:"▲", color:"#f87171", bg:"#2a1010", border:"#ef4444", desc:"How serious is the issue based on what's been described", defaultOn:false, category:"integrity"  },
  root_cause_proximity:     { label:"Root Cause",            icon:"◎", color:"#fbbf24", bg:"#1a1400", border:"#d97706", desc:"Getting closer to the actual problem vs circling symptoms", defaultOn:false, category:"competence" },
  client_trust:             { label:"Client Trust",          icon:"♡", color:"#86efac", bg:"#052e16", border:"#22c55e", desc:"Is the client sharing openly or holding back?",           defaultOn:false, category:"interest"   },
  recommendation_readiness: { label:"Recommendation Ready",  icon:"✓", color:"#a78bfa", bg:"#130d2e", border:"#7c3aed", desc:"Enough info gathered to make a recommendation?",         defaultOn:false, category:"competence" },
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
  negotiation: {
    label: "Negotiation",
    nameLabel: "Counterpart Name",
    roleLabel: "Subject / Deal",
    signals: {
      followup: true, deception: true, sincerity: false, engagement: true,
      knowledge: false, stress: true, avoidance: true, latency: false,
      confidence: true, cultural: false, preparation: false,
      rapport: true, buying_intent: false, objection_detected: false, closing_opportunity: false,
      anchor_detection: true, concession_tracking: true, leverage_signals: true,
      emotional_pressure: true, zone_of_agreement: true, commitment_language: true,
    },
    objectives: [
      "Establish your BATNA and identify theirs",
      "Detect and respond to anchoring attempts",
      "Track concession patterns — don't give without getting",
      "Identify the real decision-maker and constraints",
      "Move toward a specific commitment or next step",
    ],
  },
  coaching: {
    label: "Coaching",
    nameLabel: "Employee Name",
    roleLabel: "Topic / Issue",
    signals: {
      followup: true, deception: false, sincerity: true, engagement: true,
      knowledge: false, stress: true, avoidance: true, latency: false,
      confidence: false, cultural: false, preparation: false,
      rapport: true, buying_intent: false, objection_detected: false, closing_opportunity: false,
      psychological_safety: true, accountability_acceptance: true, defensiveness: true,
      growth_mindset: true, action_commitment: true,
    },
    objectives: [
      "Deliver specific feedback with concrete examples",
      "Gauge whether the employee understands the impact of the issue",
      "Assess openness to change vs defensiveness",
      "Agree on specific, measurable action items",
      "Maintain rapport and psychological safety throughout",
    ],
  },
  discovery: {
    label: "Discovery",
    nameLabel: "Client Name",
    roleLabel: "Domain / Topic",
    signals: {
      followup: true, deception: false, sincerity: false, engagement: true,
      knowledge: false, stress: false, avoidance: true, latency: false,
      confidence: false, cultural: false, preparation: false,
      rapport: true, buying_intent: false, objection_detected: false, closing_opportunity: false,
      coverage_completeness: true, symptom_severity: true, root_cause_proximity: true,
      client_trust: true, recommendation_readiness: true,
    },
    objectives: [
      "Map all symptoms and their timeline",
      "Identify the root cause, not just surface symptoms",
      "Assess severity and urgency of the situation",
      "Uncover constraints (budget, time, organizational)",
      "Reach enough clarity to make a recommendation",
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
  {
    name: "Charter Bus Driver",
    mindset: "interviewer",
    roleTitle: "Charter Bus Driver",
    enabledSignals: { followup:true, deception:true, sincerity:true, engagement:true, knowledge:true, stress:true, avoidance:true, latency:false, confidence:true, cultural:false, preparation:false, rapport:true, buying_intent:false, objection_detected:false, closing_opportunity:false },
    objectives: [
      "Verify CDL-B+ with passenger endorsement and clean driving record",
      "Assess passenger safety awareness and pre-trip inspection habits",
      "Gauge experience with long-haul routes, weather, and mountain driving",
      "Evaluate customer service attitude and conflict de-escalation skills",
      "Confirm comfort with overnight trips, irregular schedules, and group management",
    ],
  },
  {
    name: "Executive Recruiter",
    mindset: "interviewer",
    roleTitle: "Recruiter — Executive Search",
    enabledSignals: { followup:true, deception:true, sincerity:true, engagement:true, knowledge:true, stress:false, avoidance:true, latency:false, confidence:true, cultural:true, preparation:true, rapport:true, buying_intent:false, objection_detected:false, closing_opportunity:false },
    objectives: [
      "Assess sourcing strategy for passive C-suite and VP-level candidates",
      "Verify track record of closed executive placements and retention rates",
      "Gauge ability to manage client relationships and competing stakeholder expectations",
      "Evaluate candidate assessment methodology beyond resume screening",
      "Confirm discretion, confidentiality practices, and professional network depth",
    ],
  },
  {
    name: "Salary Negotiation",
    mindset: "negotiation",
    roleTitle: "Compensation Package",
    enabledSignals: { followup:true, deception:true, sincerity:false, engagement:true, knowledge:false, stress:true, avoidance:true, latency:false, confidence:true, cultural:false, preparation:false, rapport:true, buying_intent:false, objection_detected:false, closing_opportunity:false, anchor_detection:true, concession_tracking:true, leverage_signals:true, emotional_pressure:true, zone_of_agreement:true, commitment_language:true },
    objectives: [
      "Establish your market value range before discussing numbers",
      "Let them anchor first if possible",
      "Negotiate total compensation, not just base salary",
      "Identify what's flexible vs fixed in the offer",
      "Get a specific commitment or timeline for next step",
    ],
  },
  {
    name: "Vendor Contract",
    mindset: "negotiation",
    roleTitle: "Service Agreement",
    enabledSignals: { followup:true, deception:true, sincerity:false, engagement:true, knowledge:false, stress:false, avoidance:true, latency:false, confidence:true, cultural:false, preparation:false, rapport:true, buying_intent:false, objection_detected:false, closing_opportunity:false, anchor_detection:true, concession_tracking:true, leverage_signals:true, emotional_pressure:true, zone_of_agreement:true, commitment_language:true },
    objectives: [
      "Understand their cost structure and margin flexibility",
      "Identify volume or term-based leverage points",
      "Negotiate SLA terms and penalty clauses",
      "Get competitive pricing without damaging the relationship",
      "Secure written commitment on agreed terms",
    ],
  },
  {
    name: "Performance Improvement",
    mindset: "coaching",
    roleTitle: "Performance Issue",
    enabledSignals: { followup:true, deception:false, sincerity:true, engagement:true, knowledge:false, stress:true, avoidance:true, latency:false, confidence:false, cultural:false, preparation:false, rapport:true, buying_intent:false, objection_detected:false, closing_opportunity:false, psychological_safety:true, accountability_acceptance:true, defensiveness:true, growth_mindset:true, action_commitment:true },
    objectives: [
      "State the specific behavior or performance gap with examples",
      "Explain the impact on team, customers, or business",
      "Listen to the employee's perspective without interrupting",
      "Agree on 2-3 concrete action items with deadlines",
      "End with clear expectations and a follow-up date",
    ],
  },
  {
    name: "Development Check-In",
    mindset: "coaching",
    roleTitle: "Career Development",
    enabledSignals: { followup:true, deception:false, sincerity:true, engagement:true, knowledge:false, stress:false, avoidance:false, latency:false, confidence:false, cultural:false, preparation:false, rapport:true, buying_intent:false, objection_detected:false, closing_opportunity:false, psychological_safety:true, accountability_acceptance:false, defensiveness:false, growth_mindset:true, action_commitment:true },
    objectives: [
      "Understand the employee's career aspirations",
      "Identify skills gaps between current role and desired growth",
      "Discuss specific development opportunities or stretch assignments",
      "Agree on a 90-day development plan with milestones",
      "Assess overall engagement and job satisfaction",
    ],
  },
  {
    name: "Consulting Discovery",
    mindset: "discovery",
    roleTitle: "Business Operations",
    enabledSignals: { followup:true, deception:false, sincerity:false, engagement:true, knowledge:false, stress:false, avoidance:true, latency:false, confidence:false, cultural:false, preparation:false, rapport:true, buying_intent:false, objection_detected:false, closing_opportunity:false, coverage_completeness:true, symptom_severity:true, root_cause_proximity:true, client_trust:true, recommendation_readiness:true },
    objectives: [
      "Understand the client's current state and desired state",
      "Map all stakeholders and their competing priorities",
      "Identify the root cause of the presenting problem",
      "Assess organizational readiness for change",
      "Determine scope and constraints for a recommendation",
    ],
  },
  {
    name: "Client Intake",
    mindset: "discovery",
    roleTitle: "New Client Assessment",
    enabledSignals: { followup:true, deception:false, sincerity:false, engagement:true, knowledge:false, stress:false, avoidance:false, latency:false, confidence:false, cultural:false, preparation:false, rapport:true, buying_intent:false, objection_detected:false, closing_opportunity:false, coverage_completeness:true, symptom_severity:true, root_cause_proximity:true, client_trust:true, recommendation_readiness:true },
    objectives: [
      "Collect complete background and history",
      "Understand the presenting issue in the client's own words",
      "Identify any prior attempts to solve the problem",
      "Assess urgency and the cost of inaction",
      "Determine if this is a good fit for your services",
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
  /* Paint html + body the dark color so when content overflows or rubber-bands
     past the wrapper, white never shows through. Wrapper bg covers the rest. */
  html, body { background: ${C.bg}; }
  body { margin: 0; line-height: 1.55; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; overflow-x: hidden; overscroll-behavior-y: none; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: ${C.bg}; }
  ::-webkit-scrollbar-thumb { background: #3a3a52; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: ${C.muted}; }
  @keyframes micPulse  { 0%,100%{opacity:1} 50%{opacity:.3} }
  @keyframes probeIn   { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes sigIn     { from{opacity:0;transform:translateX(10px)} to{opacity:1;transform:translateX(0)} }
  @keyframes fadeUp    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  input:focus, textarea:focus { outline: none; border-color: #3b82f6 !important; }
  textarea { resize: none; }
  /* Mobile: prevent iOS zoom-on-focus and ensure inputs don't blow out grids */
  @media (max-width: 600px) {
    input, select, textarea { font-size: 16px !important; min-width: 0; }
    button { min-height: 36px; }
  }
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
  const isPhone    = winW < 600;
  const isPortrait = winH > winW;
  const [showSignals, setShowSignals] = useState(true);

  // ── ONBOARDING ──────────────────────────────────────────────────────────
  const [onboardingStep, setOnboardingStep] = useState(null); // null = not showing, 1/2/3 = step

  // ── AUTH ─────────────────────────────────────────────────────────────────
  const [supaUser, setSupaUser]     = useState(null);
  const [userRole, setUserRole]     = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError]   = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // ── HISTORY ───────────────────────────────────────────────────────────────
  const [history, setHistory]           = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySession, setHistorySession] = useState(null); // expanded session detail
  const sessionStartRef = useRef(null);

  const [phase, setPhase]       = useState("setup");
  const [candidateName, setCandidateName] = useState("Alex Chen");
  const [roleTitle, setRoleTitle]         = useState("Senior Backend Engineer");
  const [objectives, setObjectives]       = useState(OBJECTIVES_DEFAULT.map(t => ({ text:t, done:false })));
  const [mindset, setMindset]             = useState("interviewer");
  const [enabledSignals, setEnabledSignals] = useState(MINDSETS.interviewer.signals);
  const [savedPlaybooks, setSavedPlaybooks] = useState([]);
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
  const [pacing, setPacing]             = useState("normal"); // "slow" | "normal" | "rushed"
  const [audioDevices, setAudioDevices] = useState([]);
  const [micDeviceId, setMicDeviceId]   = useState("");

  // Resume / Application viewer
  const [resumeFile, setResumeFile]       = useState(null);
  const [resumeUrl, setResumeUrl]         = useState(null);
  const [resumeType, setResumeType]       = useState(null);   // "pdf"|"docx"|"doc"|"image"|"text"
  const [resumeName, setResumeName]       = useState("");
  const [resumeHtml, setResumeHtml]       = useState("");
  const [pdfNumPages, setPdfNumPages]     = useState(null);
  const [pdfPage, setPdfPage]             = useState(1);
  const [pdfScale, setPdfScale]           = useState(1.2);
  const [rightPanelTab, setRightPanelTab] = useState("probes");

  const timerRef      = useRef(null);
  const tickerRef     = useRef(null);
  const analyzeRef      = useRef(null); // abort controller
  const periodicRef     = useRef(null);
  const lastAnalyzedRef = useRef(0);    // timestamp of last analysis start (for utterance_end cooldown)
  const elapsedRef        = useRef(0);   // always-current elapsed seconds (avoids stale closure)
  const micDeviceIdRef  = useRef("");   // always-current device id (avoids stale closure in toggleMic)
  const runAnalysisRef  = useRef(null); // always-current runAnalysis (avoids stale closure in setInterval/ws)
  const micWsRef        = useRef(null); // WebSocket to /mic relay
  const importFileRef   = useRef(null); // hidden file input for playbook import
  const resumeInputRef  = useRef(null); // hidden file input for resume upload
  const recorderRef     = useRef(null); // MediaRecorder instance
  const interimRef      = useRef("");   // accumulates interim transcript text
  const speakerMapRef   = useRef({});   // { speakerId: "INTERVIEWER"|"CANDIDATE" }
  const speakersSeenRef = useRef([]);   // ordered by first appearance; index 0 = INTERVIEWER
  const micActiveRef    = useRef(false); // always-current micActive (avoids stale closure in toggleMic)

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearInterval(periodicRef.current);
    analyzeRef.current?.abort();
    clearTimeout(probeTimerRef.current);
    clearTimeout(signalTimerRef.current);
  }, []);

  // ── AUTH — check session on mount, listen for changes ───────────────────
  useEffect(() => {
    SUPA.auth.getSession().then(({ data: { session } }) => {
      if (session) { setSupaUser(session.user); fetchUserRole(session.user.id); }
      else setAuthLoading(false);
    });
    const { data: { subscription } } = SUPA.auth.onAuthStateChange((_evt, session) => {
      if (session) { setSupaUser(session.user); fetchUserRole(session.user.id); }
      else { setSupaUser(null); setUserRole(null); setAuthLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function fetchUserRole(userId) {
    const { data } = await SUPA.from("users").select("role").eq("user_id", userId).maybeSingle();
    const role = data?.role || "disco";
    if (!DISCO_ALLOWED_ROLES.has(role)) {
      await SUPA.auth.signOut();
      setAuthError("Your account does not have Disco access.");
      setAuthLoading(false);
      return;
    }
    setUserRole(role);
    setAuthLoading(false);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthLoading(true); setAuthError("");
    const { error } = await SUPA.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    if (error) { setAuthError(error.message); setAuthLoading(false); }
  }

  async function handleSignOut() {
    await SUPA.auth.signOut();
    setPhase("setup");
  }

  // ── ONBOARDING — show on first login ──────────────────────────────────────
  useEffect(() => {
    if (!supaUser) return;
    if (!localStorage.getItem("disco-onboarded")) {
      setOnboardingStep(1);
    }
  }, [supaUser]);

  // ── PLAYBOOKS — load from DB when user logs in ────────────────────────────
  useEffect(() => {
    if (!supaUser) return;
    loadPlaybooks();
  }, [supaUser]);

  let _seedingPlaybooks = false; // guard against concurrent seed calls
  async function loadPlaybooks() {
    const { data } = await SUPA.from("disco_playbooks")
      .select("*").order("created_at", { ascending: true });
    if (data && data.length > 0) {
      setSavedPlaybooks(data.map(p => ({
        _id: p.id, _createdBy: p.created_by,
        name: p.name, mindset: p.mindset, roleTitle: p.role_title,
        enabledSignals: p.enabled_signals, objectives: p.objectives,
      })));
      // Seed any new templates that don't exist yet for existing users
      if (!_seedingPlaybooks) {
        const existingNames = new Set(data.map(p => p.name));
        const missing = PLAYBOOK_TEMPLATES.filter(t => !existingNames.has(t.name));
        if (missing.length > 0) {
          _seedingPlaybooks = true;
          const rows = missing.map(t => ({
            created_by: supaUser.id, created_by_email: supaUser.email,
            name: t.name, mindset: t.mindset, role_title: t.roleTitle,
            enabled_signals: t.enabledSignals, objectives: t.objectives, is_shared: true,
          }));
          await SUPA.from("disco_playbooks").upsert(rows, { onConflict: "created_by,name", ignoreDuplicates: true });
          _seedingPlaybooks = false;
          loadPlaybooks(); // re-fetch to include new ones
          return;
        }
      }
    } else {
      // First login — seed default templates for this user
      const rows = PLAYBOOK_TEMPLATES.map(t => ({
        created_by: supaUser.id, created_by_email: supaUser.email,
        name: t.name, mindset: t.mindset, role_title: t.roleTitle,
        enabled_signals: t.enabledSignals, objectives: t.objectives, is_shared: true,
      }));
      await SUPA.from("disco_playbooks").insert(rows);
      loadPlaybooks();
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    const { data: sessions } = await SUPA.from("disco_sessions")
      .select("*, disco_session_results(*)")
      .order("started_at", { ascending: false })
      .limit(100);
    setHistory(sessions || []);
    setHistoryLoading(false);
  }

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

  // ── MIC DEVICE ENUMERATION ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "setup") return;
    async function loadDevices() {
      try {
        // Get permission so device labels are populated.
        // CRITICAL: enumerate BEFORE stopping the stream — many browsers clear labels on stop()
        const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
        const all = await navigator.mediaDevices.enumerateDevices();
        tmp.getTracks().forEach(t => t.stop()); // stop AFTER enumerate so labels are populated

        const inputs = all.filter(d => d.kind === "audioinput");
        setAudioDevices(inputs);

        const isPhone = d => /iphone|ipad|android|bluetooth|airpods|continuity/i.test(d.label || "");
        const isBuiltIn = d => /built.?in|macbook pro|macbook air|macbook|internal|laptop/i.test(d.label || "");

        // Restore saved preference only if the saved device isn't a phone/wireless mic
        const saved = localStorage.getItem("disco-mic-device");
        const savedDevice = inputs.find(d => d.deviceId === saved);
        const savedOk = saved && savedDevice && !isPhone(savedDevice);

        const pick = savedOk
          ? saved
          : (inputs.find(d => isBuiltIn(d))           // prefer explicit built-in match
            || inputs.find(d => d.label && !isPhone(d)) // labeled non-phone device
            || inputs.find(d => !isPhone(d))            // any non-phone device
            || inputs[0])?.deviceId || "";              // absolute last resort

        setMicDeviceId(pick);
        micDeviceIdRef.current = pick;
      } catch { /* permission denied — will surface when session starts */ }
    }
    loadDevices();
  }, [phase]);

  // ── ANALYSIS CALL ───────────────────────────────────────────────────────
  const analyzeStatusRef = useRef("idle");
  const runAnalysis = useCallback(async (trigger = "periodic") => {
    if (transcript.length === 0) return;
    if (analyzeStatusRef.current === "analyzing") return;

    analyzeRef.current?.abort();
    analyzeRef.current = new AbortController();
    lastAnalyzedRef.current = Date.now();

    analyzeStatusRef.current = "analyzing";
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
        body: JSON.stringify({
          config, transcript, trigger,
          elapsed: elapsedRef.current,
          objectivesCompleted: objectives.filter(o => o.done).map(o => o.text),
        }),
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

              // Handle coaching response
              const coaching = event.data.coaching;
              if (coaching) {
                if (coaching.pacing) setPacing(coaching.pacing);
                if (coaching.time_check) {
                  const coachingId = Date.now() + Math.random();
                  setProbes(prev => [
                    { text: coaching.time_check, id: coachingId, type: "coaching" },
                    ...prev,
                  ].slice(0, 10));
                  // Auto-dismiss coaching cards after 30 seconds
                  setTimeout(() => setDismissed(p => new Set([...p, coachingId])), 30000);
                }
              }

              if (summary) setLastSummary(summary);
              analyzeStatusRef.current = "done";
              setAnalyzeStatus("done");
            }

            if (event.type === "error") {
              setAnalyzeError(event.message);
              analyzeStatusRef.current = "error";
              setAnalyzeStatus("error");
            }
          } catch { /* incomplete chunk, continue */ }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setAnalyzeError(err.message);
        analyzeStatusRef.current = "error";
        setAnalyzeStatus("error");
      }
    }
  }, [transcript, candidateName, roleTitle, objectives, enabledSignals]);

  // Keep ref always current so setInterval/ws handlers avoid stale closures
  // NOTE: This must be AFTER runAnalysis is declared — const TDZ would throw otherwise
  useEffect(() => { runAnalysisRef.current = runAnalysis; }, [runAnalysis]);
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);
  useEffect(() => { micActiveRef.current = micActive; }, [micActive]);

  // ── KEYBOARD SHORTCUTS (live phase) ────────────────────────────────────��─
  const [showShortcuts, setShowShortcuts] = useState(false);
  useEffect(() => {
    if (phase !== "live") return;
    function handleKey(e) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "m") { e.preventDefault(); toggleMic(); }
      if (meta && e.key === "a") { e.preventDefault(); runAnalysisRef.current?.("manual"); }
      if (e.key === "/" && !e.target.closest("textarea,input")) { e.preventDefault(); setShowShortcuts(s => !s); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [phase, micActive]);

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
      // Negotiation signals
      anchor_detection:    { high: "Strong anchor detected — counterpart set a reference point.", low: "No significant anchoring attempts." },
      concession_tracking: { high: "Counterpart making more concessions — you have momentum.", low: "You're giving more than getting — hold the line." },
      leverage_signals:    { high: "Counterpart has strong leverage — tread carefully.", low: "You have leverage — press your advantage." },
      emotional_pressure:  { high: "Emotional pressure tactics detected — stay rational.", low: "" },
      zone_of_agreement:   { high: "Parties converging — close to a deal.", low: "Far apart — significant gap remains." },
      commitment_language: { high: "Firm commitment language — they're ready to agree.", low: "Lots of hedging — no real commitment yet." },
      // Coaching signals
      psychological_safety:      { high: "Employee feels safe — sharing openly.", low: "Employee shutting down — increase safety." },
      accountability_acceptance: { high: "Employee taking ownership of the issue.", low: "Deflecting responsibility — probe deeper." },
      defensiveness:             { high: "High defensiveness — consider de-escalating.", low: "" },
      growth_mindset:            { high: "Growth mindset present — open to change.", low: "Fixed mindset signals — 'that's just how I am.'" },
      action_commitment:         { high: "Concrete commitments being made.", low: "No specific action items agreed — push for specifics." },
      // Discovery signals
      coverage_completeness:     { high: "Thorough coverage — most areas explored.", low: "Major discovery gaps remain — broaden questions." },
      symptom_severity:          { high: "Critical issue — high urgency.", low: "Minor issue — lower priority." },
      root_cause_proximity:      { high: "Root cause identified or nearly identified.", low: "Still circling surface symptoms." },
      client_trust:              { high: "Client sharing openly and candidly.", low: "Client guarded — build more trust." },
      recommendation_readiness:  { high: "Enough info to make a recommendation.", low: "Too many unknowns — need more discovery." },
    };
    return labels[type]?.[dir] || summary || `${type} score: ${score}`;
  }

  // ── MINDSET SWITCH ───────────────────────────────────────────────────────
  // ── RESUME / APPLICATION UPLOAD ──────────────────────────────────────────
  function handleResumeUpload(file) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { alert("File too large. Maximum 25MB."); return; }
    const ext = file.name.toLowerCase().split(".").pop();
    let type;
    if (ext === "pdf") type = "pdf";
    else if (ext === "docx") type = "docx";
    else if (ext === "doc") type = "doc";
    else if (["jpg","jpeg","png","gif","webp"].includes(ext)) type = "image";
    else if (["txt","rtf","md"].includes(ext)) type = "text";
    else { alert("Unsupported file type."); return; }

    if (resumeUrl) URL.revokeObjectURL(resumeUrl);
    const url = URL.createObjectURL(file);
    setResumeFile(file); setResumeUrl(url); setResumeType(type);
    setResumeName(file.name); setResumeHtml(""); setPdfPage(1); setPdfNumPages(null);

    if (type === "docx") {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToHtml({ arrayBuffer: e.target.result });
        setResumeHtml(result.value);
      };
      reader.readAsArrayBuffer(file);
    }
    if (type === "text") {
      const reader = new FileReader();
      reader.onload = (e) => setResumeHtml(e.target.result);
      reader.readAsText(file);
    }
  }

  function clearResume() {
    if (resumeUrl) URL.revokeObjectURL(resumeUrl);
    setResumeFile(null); setResumeUrl(null); setResumeType(null);
    setResumeName(""); setResumeHtml(""); setPdfNumPages(null); setPdfPage(1);
  }

  const hasResume = !!resumeUrl;

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

  async function savePlaybook() {
    const name = playbookName.trim();
    if (!name || !supaUser) return;
    const existing = savedPlaybooks.find(p => p.name === name);
    const row = {
      created_by: supaUser.id, created_by_email: supaUser.email,
      name, mindset, role_title: roleTitle,
      enabled_signals: enabledSignals,
      objectives: objectives.map(o => o.text),
      is_shared: true, updated_at: new Date().toISOString(),
    };
    if (existing?._id) {
      await SUPA.from("disco_playbooks").update(row).eq("id", existing._id);
    } else {
      await SUPA.from("disco_playbooks").insert(row);
    }
    await loadPlaybooks();
    setSelectedPlaybook(name);
    setPlaybookName("");
  }

  async function deletePlaybook(name) {
    const pb = savedPlaybooks.find(p => p.name === name);
    if (pb?._id) await SUPA.from("disco_playbooks").delete().eq("id", pb._id);
    await loadPlaybooks();
    if (selectedPlaybook === name) setSelectedPlaybook("");
  }

  function exportPlaybook() {
    const pb = savedPlaybooks.find(p => p.name === selectedPlaybook);
    if (!pb) return;
    const exportObj = {
      name: pb.name,
      mindset: pb.mindset,
      roleTitle: pb.roleTitle,
      enabledSignals: pb.enabledSignals,
      objectives: pb.objectives,
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `disco-playbook-${pb.name.toLowerCase().replace(/\s+/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function importPlaybook(e) {
    const file = e.target.files?.[0];
    if (!file || !supaUser) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (typeof parsed.name !== "string" || typeof parsed.mindset !== "string" || !Array.isArray(parsed.objectives)) {
        alert("Invalid playbook file");
        return;
      }
      const row = {
        created_by: supaUser.id, created_by_email: supaUser.email,
        name: parsed.name, mindset: parsed.mindset,
        role_title: parsed.roleTitle || "",
        enabled_signals: parsed.enabledSignals || {},
        objectives: parsed.objectives,
        is_shared: true, updated_at: new Date().toISOString(),
      };
      // Check for existing playbook with same name (upsert instead of duplicate)
      const existing = savedPlaybooks.find(p => p.name === parsed.name);
      if (existing?._id) {
        await SUPA.from("disco_playbooks").update(row).eq("id", existing._id);
      } else {
        await SUPA.from("disco_playbooks").insert(row);
      }
      await loadPlaybooks();
    } catch {
      alert("Invalid playbook file");
    }
    // reset so the same file can be re-imported
    if (importFileRef.current) importFileRef.current.value = "";
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
    sessionStartRef.current = new Date().toISOString();
    setPhase("live");
    setTranscript([]); setProbes([]); setSignals([]);
    setDismissed(new Set()); setScores({}); setElapsed(0); setPacing("normal");
    analyzeStatusRef.current = "idle"; setAnalyzeStatus("idle"); setLastSummary(""); setAnalyzeError("");
    setDebrief(null);
    setEmailTo(""); setEmailStatus("idle"); setEmailError("");
    speakerMapRef.current = {};
    speakersSeenRef.current = [];
    setSpeakerMap({});
    setMonitorProbe(null);
    setMonitorSignal(null);
    setRightPanelTab("probes");
    setViewMode(window.innerWidth < 1100 ? "monitor" : "dashboard");

    const milestones = new Set([900, 1800, 2700]); // 15min, 30min, 45min
    const milestoneLabels = { 900: "15 minutes", 1800: "30 minutes", 2700: "45 minutes" };
    timerRef.current = setInterval(() => setElapsed(e => {
      const next = e + 1;
      if (milestones.has(next)) {
        const coachingId = Date.now() + Math.random();
        setProbes(prev => [
          { text: `You've been in session for ${milestoneLabels[next]}.`, id: coachingId, type: "coaching" },
          ...prev,
        ].slice(0, 10));
        setTimeout(() => setDismissed(p => new Set([...p, coachingId])), 30000);
      }
      return next;
    }), 1000);

    // Periodic analysis every 20 seconds — use ref to avoid stale closure
    periodicRef.current = setInterval(() => {
      runAnalysisRef.current?.("periodic");
    }, 20000);

    // Auto-start mic
    toggleMic();
  }

  async function endSession() {
    clearInterval(timerRef.current);
    clearInterval(periodicRef.current);
    analyzeRef.current?.abort();

    // Stop mic + tear down Deepgram WS so chunks don't keep streaming after end.
    if (micActiveRef.current) {
      try { recorderRef.current?.stop(); } catch { /* */ }
      try { recorderRef.current?.stream?.getTracks().forEach(t => t.stop()); } catch { /* */ }
      try { micWsRef.current?.close(); } catch { /* */ }
      recorderRef.current = null;
      micWsRef.current = null;
      interimRef.current = "";
      micActiveRef.current = false;
      setMicActive(false);
      setHotMic(null);
    }

    // Fire debrief
    setDebriefLoading(true);
    setPhase("debrief");

    try {
      const res = await fetch(`${API_BASE}/debrief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: { candidateName, roleTitle, objectives: objectives.map(o => o.text), mindset },
          transcript,
          signals: scores,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDebrief(data.debrief);
        // Auto-save session to DB (non-blocking)
        saveSessionToDB(transcript, scores, data.debrief).catch(() => {});
      }
    } catch (err) {
      setAnalyzeError(err.message);
    } finally {
      setDebriefLoading(false);
    }
  }

  async function saveSessionToDB(txScript, scrs, deb) {
    if (!supaUser) return;
    const { data: session, error } = await SUPA.from("disco_sessions").insert({
      user_id: supaUser.id,
      user_email: supaUser.email,
      candidate_name: candidateName,
      role_title: roleTitle,
      mindset,
      playbook_name: selectedPlaybook || null,
      started_at: sessionStartRef.current,
      ended_at: new Date().toISOString(),
      duration_seconds: elapsed,
    }).select().single();
    if (error || !session) return;
    await SUPA.from("disco_session_results").insert({
      session_id: session.id,
      transcript: txScript,
      final_scores: scrs,
      debrief: deb || {},
    });
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
    if (micActiveRef.current) {
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
      const isPhone = label => /iphone|ipad|android|bluetooth|airpods|continuity/i.test(label || "");

      async function acquireStream() {
        // ── Path 1 (normal): loadDevices() on the setup screen already identified
        //   the right mic and stored it in micDeviceIdRef. Just open it directly.
        if (micDeviceIdRef.current) {
          try {
            const s = await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: { exact: micDeviceIdRef.current } },
              video: false,
            });
            if (!isPhone(s.getAudioTracks()[0]?.label)) return s;
            s.getTracks().forEach(t => t.stop()); // saved pref was a phone — fall through
          } catch { /* device unavailable — fall through */ }
        }

        // ── Path 2 (fallback): No good saved device. Open the system default first —
        //   this populates enumerateDevices() labels so we can filter properly.
        const anyStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const anyLabel  = anyStream.getAudioTracks()[0]?.label || "";

        if (!isPhone(anyLabel)) {
          // System default is a real mic. Save its exact deviceId for next time.
          const devId = anyStream.getAudioTracks()[0]?.getSettings()?.deviceId;
          if (devId) { micDeviceIdRef.current = devId; setMicDeviceId(devId); localStorage.setItem("disco-mic-device", devId); }
          return anyStream;
        }

        // ── Path 3: System default was a phone mic. Labels are now populated.
        //   Enumerate, filter out all phone devices BY LABEL (never open them),
        //   and use the first non-phone device found.
        anyStream.getTracks().forEach(t => t.stop());
        const all = await navigator.mediaDevices.enumerateDevices();
        for (const device of all.filter(d => d.kind === "audioinput" && !isPhone(d.label))) {
          try {
            const s = await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: { exact: device.deviceId } },
              video: false,
            });
            if (!isPhone(s.getAudioTracks()[0]?.label)) {
              micDeviceIdRef.current = device.deviceId;
              setMicDeviceId(device.deviceId);
              localStorage.setItem("disco-mic-device", device.deviceId);
              return s;
            }
            s.getTracks().forEach(t => t.stop());
          } catch { continue; }
        }

        // ── Path 4: Absolute last resort
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }

      const stream = await acquireStream();
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
            // Only trigger if analysis hasn't run in the last 20s — use ref to avoid stale closure
            if (Date.now() - lastAnalyzedRef.current > 20000) {
              runAnalysisRef.current?.("utterance_end");
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

  // Probe feed content — reusable in center panel (no resume) or right panel tab (with resume)
  const compact = hasResume; // smaller text when in sidebar
  function renderProbeFeed() {
    return <>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2, flexWrap:"wrap" }}>
        <span style={{ fontSize:9, letterSpacing:4, color:"#38bdf8" }}>SUGGESTED PROBES</span>
        {activeProbes.length > 0 && (
          <span style={{ fontSize:9, background:"#0ea5e925", border:"1px solid #0ea5e950", color:"#38bdf8", padding:"1px 8px", borderRadius:10 }}>{activeProbes.length}</span>
        )}
        {activeProbes.length > 0 && (
          <button onClick={() => setDismissed(p => new Set([...p, ...activeProbes.map(f=>f.id)]))} style={{
            marginLeft:"auto", background:"none", border:"none", color:C.muted, fontSize:9, fontFamily:"inherit", letterSpacing:2, cursor:"pointer", padding:0,
          }}>CLEAR</button>
        )}
        <button onClick={() => runAnalysis("manual")} style={{
          marginLeft: activeProbes.length > 0 ? 0 : "auto",
          background:"#1e3a5f", border:"1px solid #3b82f6", borderRadius:3, color:"#93c5fd",
          fontSize:9, fontFamily:"inherit", letterSpacing:2, cursor:"pointer", padding:"3px 10px",
        }}>ANALYZE NOW</button>
      </div>
      {analyzeError && (
        <div style={{ padding:"8px 12px", background:"#2a1010", border:"1px solid #ef444460", borderRadius:4, fontSize:10, color:"#fca5a5" }}>
          ⚠ {analyzeError}
        </div>
      )}
      {activeProbes.length === 0 && !analyzeError && (
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:C.dim, fontSize:11, flexDirection:"column", gap:8 }}>
          <span style={{ fontSize:24, color:C.dim }}>→</span>
          <span>{compact ? "Waiting for probes..." : "Add transcript entries below, then hit Analyze Now"}</span>
        </div>
      )}
      {activeProbes.map(probe => {
        const isCoachingCard = probe.type === "coaching";
        return (
          <div key={probe.id} style={{
            padding: compact ? "14px 16px" : "18px 20px",
            background: isCoachingCard ? "#1a1708" : "#0c1d2e",
            border: isCoachingCard ? "1px solid #f59e0b40" : "1px solid #0ea5e940",
            borderLeft: isCoachingCard ? "4px solid #f59e0b" : "4px solid #0ea5e9",
            borderRadius:"0 8px 8px 0",
            display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10,
            animation:"probeIn .3s ease",
          }}>
            <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
              <span style={{ fontSize: compact ? 18 : 22, color: isCoachingCard ? "#fcd34d" : "#38bdf8", flexShrink:0, lineHeight:1, marginTop:2 }}>{isCoachingCard ? "\u23F1" : "\u2192"}</span>
              <span style={{ fontSize: compact ? 15 : 17, color: isCoachingCard ? "#fcd34d" : "#e0f2fe", lineHeight:1.55, fontWeight:500 }}>{probe.text}</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
              {!isCoachingCard && (
                <button onClick={() => navigator.clipboard.writeText(probe.text)} style={{
                  background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:12, padding:"0 2px", fontFamily:"inherit", lineHeight:1,
                }} onMouseEnter={e=>e.target.style.color="#38bdf8"} onMouseLeave={e=>e.target.style.color=C.muted} title="Copy">⎘</button>
              )}
              <button onClick={() => setDismissed(p => new Set([...p, probe.id]))} style={{
                background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:16, padding:"0 2px", fontFamily:"inherit", lineHeight:1,
              }} onMouseEnter={e=>e.target.style.color= isCoachingCard ? "#fcd34d" : "#38bdf8"} onMouseLeave={e=>e.target.style.color=C.muted}>×</button>
            </div>
          </div>
        );
      })}
    </>;
  }

  // ── AUTH GATE ─────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'IBM Plex Mono','Courier New',monospace" }}>
      <div style={{ color:C.muted, fontSize:11, letterSpacing:4 }}>AUTHENTICATING...</div>
    </div>
  );

  if (!supaUser) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'IBM Plex Mono','Courier New',monospace" }}>
      <style>{GLOBAL_STYLES}</style>
      <div style={{ width:"100%", maxWidth:380, padding:32, background:C.surface, border:`1px solid ${C.edge}`, borderRadius:6, animation:"fadeUp .4s ease" }}>
        <div style={{ fontSize:9, letterSpacing:6, color:C.muted, marginBottom:8 }}>INTERVIEW INTELLIGENCE SYSTEM</div>
        <h1 style={{ fontSize:22, fontWeight:700, color:C.bright, margin:"0 0 28px", letterSpacing:-1 }}>Sign In</h1>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:9, letterSpacing:3, color:C.muted, marginBottom:6 }}>EMAIL</div>
            <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required autoFocus
              autoComplete="username" inputMode="email" autoCapitalize="off" autoCorrect="off" name="email"
              style={{ width:"100%", padding:"10px 12px", background:C.surfaceAlt, border:`1px solid ${C.edge}`, borderRadius:3, color:C.bright, fontSize:13, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }} />
          </div>
          <div style={{ marginBottom:22 }}>
            <div style={{ fontSize:9, letterSpacing:3, color:C.muted, marginBottom:6 }}>PASSWORD</div>
            <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required
              autoComplete="current-password" name="password"
              style={{ width:"100%", padding:"10px 12px", background:C.surfaceAlt, border:`1px solid ${C.edge}`, borderRadius:3, color:C.bright, fontSize:13, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }} />
          </div>
          {authError && <div style={{ fontSize:11, color:"#f87171", marginBottom:14 }}>⚠ {authError}</div>}
          <button type="submit" style={{ width:"100%", padding:"11px", background:"#1d4ed8", border:"none", borderRadius:3, color:"#fff", fontSize:11, letterSpacing:3, fontFamily:"inherit", cursor:"pointer", fontWeight:600 }}>
            SIGN IN
          </button>
        </form>
        <div style={{ marginTop:20, fontSize:10, color:C.muted, textAlign:"center" }}>
          Contact your admin for account access.
        </div>
      </div>
    </div>
  );

  // ── HISTORY ───────────────────────────────────────────────────────────────
  if (phase === "history") return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.body, fontFamily:"'IBM Plex Mono','Courier New',monospace", padding: isPhone ? "20px 14px" : "32px 24px", overflowX:"hidden" }}>
      <style>{GLOBAL_STYLES}</style>
      <div style={{ maxWidth:960, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28, borderBottom:`1px solid ${C.edge}`, paddingBottom:20, flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ fontSize:9, letterSpacing:6, color:C.muted, marginBottom:6 }}>INTERVIEW INTELLIGENCE SYSTEM</div>
            <h1 style={{ fontSize:24, fontWeight:700, color:C.bright, margin:0, letterSpacing:-1 }}>Session History</h1>
          </div>
          <button onClick={() => setPhase("setup")} style={{ padding:"8px 20px", background:"transparent", border:`1px solid ${C.edge}`, borderRadius:3, color:C.muted, fontSize:10, fontFamily:"inherit", letterSpacing:3, cursor:"pointer" }}>← BACK</button>
        </div>

        {historyLoading ? (
          <div style={{ color:C.muted, fontSize:11, letterSpacing:3 }}>LOADING...</div>
        ) : history.length === 0 ? (
          <div style={{ color:C.muted, fontSize:13, textAlign:"center", paddingTop:60 }}>No sessions recorded yet.</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
            {history.map(s => {
              const isOpen = historySession?.id === s.id;
              const result = s.disco_session_results?.[0];
              const dur = s.duration_seconds ? `${Math.floor(s.duration_seconds/60)}m ${s.duration_seconds%60}s` : "—";
              const dateStr = new Date(s.started_at).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric", hour:"2-digit", minute:"2-digit" });
              return (
                <div key={s.id}>
                  <div onClick={() => setHistorySession(isOpen ? null : s)}
                    style={ isPhone
                      ? { display:"flex", flexDirection:"column", gap:4, padding:"12px 14px", paddingRight:34, position:"relative", background:isOpen ? C.surfaceAlt : C.surface, border:`1px solid ${isOpen ? "#3b82f6" : C.edge}`, borderRadius:isOpen ? "4px 4px 0 0" : 4, cursor:"pointer", transition:"all .15s" }
                      : { display:"grid", gridTemplateColumns:"1fr 1fr 120px 90px 30px", alignItems:"center", gap:16, padding:"14px 18px", background:isOpen ? C.surfaceAlt : C.surface, border:`1px solid ${isOpen ? "#3b82f6" : C.edge}`, borderRadius:isOpen ? "4px 4px 0 0" : 4, cursor:"pointer", transition:"all .15s" }
                    }>
                    <div>
                      <div style={{ color:C.bright, fontWeight:600, fontSize:13 }}>{s.candidate_name || "—"}</div>
                      <div style={{ color:C.muted, fontSize:10, marginTop:2 }}>{s.role_title || "—"}</div>
                    </div>
                    <div style={{ color:C.muted, fontSize:11 }}>{dateStr}</div>
                    {!isPhone && <div style={{ color:C.muted, fontSize:11 }}>{s.user_email?.split("@")[0]}</div>}
                    <div style={{ color:C.muted, fontSize:11 }}>{dur}</div>
                    <div style={ isPhone ? { position:"absolute", top:12, right:14, color:C.muted, fontSize:14 } : { color:C.muted, fontSize:14 }}>{isOpen ? "▲" : "▼"}</div>
                  </div>
                  {isOpen && result && (
                    <div style={{ background:C.surfaceAlt, border:`1px solid #3b82f6`, borderTop:"none", borderRadius:"0 0 4px 4px", padding:24 }}>
                      {result.debrief?.verdict && (
                        <div style={{ marginBottom:20 }}>
                          <div style={{ fontSize:9, letterSpacing:4, color:C.muted, marginBottom:8 }}>VERDICT</div>
                          <div style={{ fontSize:13, color:C.bright, fontWeight:600 }}>{result.debrief.verdict}</div>
                          {result.debrief.headline && <div style={{ fontSize:11, color:C.body, marginTop:4 }}>{result.debrief.headline}</div>}
                        </div>
                      )}
                      {result.final_scores && Object.keys(result.final_scores).length > 0 && (
                        <div style={{ marginBottom:20 }}>
                          <div style={{ fontSize:9, letterSpacing:4, color:C.muted, marginBottom:10 }}>SIGNAL SCORES</div>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                            {Object.entries(result.final_scores).map(([k, v]) => (
                              <div key={k} style={{ padding:"4px 10px", background:C.surface, border:`1px solid ${C.edge}`, borderRadius:3, fontSize:10, color:C.body }}>
                                {k}: <span style={{ color: v >= 65 ? "#6ee7b7" : v <= 40 ? "#f87171" : C.body, fontWeight:600 }}>{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.debrief?.observations?.length > 0 && (
                        <div style={{ marginBottom:20 }}>
                          <div style={{ fontSize:9, letterSpacing:4, color:C.muted, marginBottom:8 }}>OBSERVATIONS</div>
                          {result.debrief.observations.map((o, i) => (
                            <div key={i} style={{ fontSize:11, color:C.body, marginBottom:4, paddingLeft:12, borderLeft:`2px solid ${C.edge}` }}>{typeof o === "string" ? o : o.text}</div>
                          ))}
                        </div>
                      )}
                      {result.transcript?.length > 0 && (
                        <details style={{ marginTop:8 }}>
                          <summary style={{ fontSize:9, letterSpacing:4, color:C.muted, cursor:"pointer" }}>TRANSCRIPT ({result.transcript.length} lines)</summary>
                          <div style={{ marginTop:12, maxHeight:300, overflowY:"auto", display:"flex", flexDirection:"column", gap:6 }}>
                            {result.transcript.map((t, i) => (
                              <div key={i} style={{ fontSize:11 }}>
                                <span style={{ color: t.speaker === "INTERVIEWER" ? "#38bdf8" : "#6ee7b7", marginRight:8 }}>{t.speaker}</span>
                                <span style={{ color:C.body }}>{t.text}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ── SETUP ──────────────────────────────────────────────────────────────
  if (phase === "setup") return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.body, fontFamily:"'IBM Plex Mono','Courier New',monospace", padding: isPhone ? "20px 14px max(20px, env(safe-area-inset-bottom)) 14px" : "32px 24px", overflowX:"hidden" }}>
      <style>{GLOBAL_STYLES}</style>

      {/* ── ONBOARDING OVERLAY ── */}
      {onboardingStep !== null && (() => {
        const dismissOnboarding = () => {
          localStorage.setItem("disco-onboarded", "true");
          setOnboardingStep(null);
        };
        const steps = [
          {
            heading: "Welcome to Disco",
            body: "Start by choosing a mindset \u2014 Interview or Sales \u2014 and loading a playbook. Each playbook pre-configures the role, objectives, and signal modules for your session.",
            visual: (
              <div style={{ display:"flex", gap:8, justifyContent:"center", marginTop:18, marginBottom:6 }}>
                {["INTERVIEW", "SALES"].map(label => (
                  <span key={label} style={{
                    padding:"6px 18px", borderRadius:4, fontSize:10, letterSpacing:2, fontWeight:600,
                    border:`1px solid ${C.edge}`, background:C.surfaceAlt, color:C.muted,
                  }}>{label}</span>
                ))}
              </div>
            ),
          },
          {
            heading: "During the Session",
            body: "The center panel shows suggested probes \u2014 verbatim questions you can ask. The right panel tracks behavioral signals in real-time. Everything updates every 20 seconds automatically.",
            visual: (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:0, marginTop:18, marginBottom:6 }}>
                <div style={{
                  flex:1, padding:"10px 14px", background:"#0c1d2e", border:"1px solid #0ea5e940",
                  borderRadius:"4px 0 0 4px", textAlign:"center",
                }}>
                  <div style={{ fontSize:9, letterSpacing:3, color:"#38bdf8", marginBottom:4 }}>PROBES</div>
                  <div style={{ fontSize:11, color:C.muted }}>\u2190 center</div>
                </div>
                <div style={{ width:1, background:C.edge, alignSelf:"stretch" }}/>
                <div style={{
                  flex:1, padding:"10px 14px", background:C.surfaceAlt, border:`1px solid ${C.edge}`,
                  borderRadius:"0 4px 4px 0", textAlign:"center",
                }}>
                  <div style={{ fontSize:9, letterSpacing:3, color:"#fcd34d", marginBottom:4 }}>SIGNALS</div>
                  <div style={{ fontSize:11, color:C.muted }}>right \u2192</div>
                </div>
              </div>
            ),
          },
          {
            heading: "Mic & Transcription",
            body: "The mic auto-starts and transcribes the conversation via Deepgram. You can also type entries manually. When you end the session, you\u2019ll get a full AI debrief with verdict, observations, and a follow-up email draft.",
            visual: (
              <div style={{ textAlign:"center", marginTop:18, marginBottom:6 }}>
                <span style={{ fontSize:36, display:"inline-block" }}>\ud83c\udf99</span>
              </div>
            ),
          },
        ];
        const step = steps[onboardingStep - 1];
        const isLast = onboardingStep === 3;
        return (
          <div style={{
            position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:9999,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <div style={{
              background:C.surface, border:`1px solid ${C.edge}`, borderRadius:10,
              padding:"32px 36px", maxWidth:460, width:"90%", position:"relative",
              animation:"fadeUp .4s ease",
            }}>
              {/* Skip button */}
              <button onClick={dismissOnboarding} style={{
                position:"absolute", top:14, right:16, background:"none", border:"none",
                color:C.muted, fontSize:10, letterSpacing:2, fontFamily:"inherit", cursor:"pointer",
              }}>SKIP</button>

              {/* Step dots */}
              <div style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:22 }}>
                {[1,2,3].map(n => (
                  <div key={n} style={{
                    width:8, height:8, borderRadius:"50%",
                    background: n === onboardingStep ? "#3b82f6" : "transparent",
                    border: `1.5px solid ${n === onboardingStep ? "#3b82f6" : C.muted}`,
                    transition:"all .2s",
                  }}/>
                ))}
              </div>

              {/* Heading */}
              <h2 style={{ fontSize:20, fontWeight:600, color:C.bright, margin:"0 0 12px", textAlign:"center" }}>
                {step.heading}
              </h2>

              {/* Body */}
              <p style={{ fontSize:13, color:C.body, lineHeight:1.7, margin:"0 0 4px", textAlign:"center" }}>
                {step.body}
              </p>

              {/* Visual */}
              {step.visual}

              {/* Navigation */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:22 }}>
                {onboardingStep > 1 ? (
                  <button onClick={() => setOnboardingStep(s => s - 1)} style={{
                    padding:"8px 18px", background:"transparent", border:`1px solid ${C.edge}`,
                    borderRadius:4, color:C.muted, fontSize:10, letterSpacing:2,
                    fontFamily:"inherit", cursor:"pointer",
                  }}>BACK</button>
                ) : <div/>}
                <button onClick={() => {
                  if (isLast) { dismissOnboarding(); }
                  else { setOnboardingStep(s => s + 1); }
                }} style={{
                  padding:"8px 22px", border:"none", borderRadius:4,
                  background: isLast ? "#166534" : "#1d4ed8",
                  color:"#fff", fontSize:10, letterSpacing:2, fontWeight:600,
                  fontFamily:"inherit", cursor:"pointer",
                }}>{isLast ? "GET STARTED" : "NEXT"}</button>
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ maxWidth:800, margin:"0 auto", animation:"fadeUp .4s ease" }}>
        <div style={{ marginBottom:32, borderBottom:`1px solid ${C.edge}`, paddingBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, flexWrap:"wrap", gap:8 }}>
            <div style={{ fontSize:9, letterSpacing:isPhone ? 3 : 6, color:C.muted }}>INTERVIEW INTELLIGENCE SYSTEM{isPhone ? "" : " · PRE-SESSION BRIEF"}</div>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              {!isPhone && <span style={{ fontSize:10, color:C.muted }}>{supaUser?.email}</span>}
              <button onClick={() => { loadHistory(); setPhase("history"); }} style={{ padding:"4px 12px", background:"transparent", border:`1px solid ${C.edge}`, borderRadius:3, color:C.muted, fontSize:9, letterSpacing:2, fontFamily:"inherit", cursor:"pointer" }}>HISTORY</button>
              <button onClick={handleSignOut} style={{ padding:"4px 12px", background:"transparent", border:`1px solid ${C.edge}`, borderRadius:3, color:C.muted, fontSize:9, letterSpacing:2, fontFamily:"inherit", cursor:"pointer" }}>SIGN OUT</button>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <h1 style={{ fontSize: isPhone ? 22 : 28, fontWeight:700, margin:0, color:C.bright, letterSpacing:-1 }}>Configure Session</h1>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
              {Object.entries(MINDSETS).map(([key, m]) => (
                <button key={key} onClick={() => changeMindset(key)} style={{
                  padding: isPhone ? "5px 10px" : "6px 16px", borderRadius:4, fontSize:10, letterSpacing:2,
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
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20, padding:"10px 12px", background:C.surface, border:`1px solid ${C.edge}`, borderRadius:4, flexWrap:"wrap" }}>
          <span style={{ fontSize:9, letterSpacing:3, color:C.muted, flexShrink:0 }}>PLAYBOOKS</span>
          <select
            value={selectedPlaybook}
            onChange={e => setSelectedPlaybook(e.target.value)}
            style={{ flex:"1 1 200px", minWidth:140, background:C.bg, border:`1px solid ${C.edge}`, borderRadius:3, color: selectedPlaybook ? C.body : C.muted, padding:"6px 8px", fontSize:13, fontFamily:"inherit" }}
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
          <button onClick={exportPlaybook} disabled={!selectedPlaybook} style={{
            padding:"5px 12px", background:"transparent",
            border:`1px solid ${C.edge}`, borderRadius:3,
            color:C.muted, fontSize:9, fontFamily:"inherit", letterSpacing:2,
            cursor: selectedPlaybook ? "pointer" : "default",
          }}>{"\u2B07"}</button>
          <button onClick={() => importFileRef.current?.click()} style={{
            padding:"5px 12px", background:"transparent",
            border:`1px solid ${C.edge}`, borderRadius:3,
            color:C.muted, fontSize:9, fontFamily:"inherit", letterSpacing:2,
            cursor:"pointer",
          }}>{"\u2B06"}</button>
          <input ref={importFileRef} type="file" accept=".json" onChange={importPlaybook} style={{ display:"none" }}/>
          {!isPhone && <div style={{ width:1, height:20, background:C.edge, flexShrink:0 }}/>}
          <input
            value={playbookName}
            onChange={e => setPlaybookName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && savePlaybook()}
            placeholder="Save as..."
            style={{ flex: isPhone ? "1 1 100%" : "0 0 130px", minWidth:0, width: isPhone ? "auto" : 130, background:C.bg, border:`1px solid ${C.edge}`, borderRadius:3, color:C.body, padding:"6px 8px", fontSize:13, fontFamily:"inherit" }}
          />
          <button onClick={savePlaybook} disabled={!playbookName.trim()} style={{
            padding:"5px 12px", background: playbookName.trim() ? "#166534" : C.edge,
            border:"none", borderRadius:3, color: playbookName.trim() ? "#6ee7b7" : C.muted,
            fontSize:9, fontFamily:"inherit", letterSpacing:2, cursor: playbookName.trim() ? "pointer" : "default",
          }}>SAVE</button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns: isPhone ? "1fr" : "1fr 1fr", gap: isPhone ? 24 : 32 }}>
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

            {/* Resume / Application upload */}
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:9, letterSpacing:3, color:C.muted, marginBottom:8 }}>RESUME / APPLICATION</div>
              <input ref={resumeInputRef} type="file" accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.gif,.webp,.txt,.md,.rtf"
                onChange={e => { handleResumeUpload(e.target.files?.[0]); if (resumeInputRef.current) resumeInputRef.current.value = ""; }}
                style={{ display:"none" }}
              />
              {resumeFile ? (
                <div style={{
                  display:"flex", alignItems:"center", gap:10, padding:"12px 14px",
                  background:C.surface, border:`1px solid ${C.edge}`, borderRadius:6,
                }}>
                  <span style={{ fontSize:16, flexShrink:0 }}>📄</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, color:C.body, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{resumeName}</div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{(resumeFile.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <button onClick={clearResume} style={{
                    background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:16, fontFamily:"inherit",
                  }}>✕</button>
                </div>
              ) : (
                <div
                  onClick={() => resumeInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#3b82f6"; }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = C.edge; }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = C.edge; handleResumeUpload(e.dataTransfer.files?.[0]); }}
                  style={{
                    padding:"24px 16px", border:`2px dashed ${C.edge}`, borderRadius:8,
                    display:"flex", flexDirection:"column", alignItems:"center", gap:6,
                    cursor:"pointer", transition:"border-color .2s",
                  }}
                >
                  <span style={{ fontSize:20, color:C.muted }}>📄</span>
                  <span style={{ fontSize:11, color:C.muted }}>Drop file here or click to browse</span>
                  <span style={{ fontSize:9, color:C.muted, opacity:.6 }}>PDF · DOCX · JPG · PNG · TXT</span>
                </div>
              )}
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

        {audioDevices.length > 0 && (
          <div style={{ marginTop:16, display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:9, letterSpacing:2, color:C.muted, flexShrink:0 }}>🎙 MIC</span>
            <select
              value={micDeviceId}
              onChange={e => {
                setMicDeviceId(e.target.value);
                micDeviceIdRef.current = e.target.value;
                localStorage.setItem("disco-mic-device", e.target.value);
              }}
              style={{
                flex:1, padding:"6px 10px", background:C.surfaceAlt,
                border:`1px solid ${C.edge}`, borderRadius:3,
                color:C.body, fontSize:11, fontFamily:"inherit", cursor:"pointer",
              }}
            >
              {audioDevices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone ${d.deviceId.slice(0,6)}`}
                </option>
              ))}
            </select>
          </div>
        )}

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
    <div style={{ minHeight:"100vh", background:C.bg, color:C.body, fontFamily:"'IBM Plex Mono','Courier New',monospace", padding: isPhone ? "20px 14px" : 28, overflowX:"hidden" }}>
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
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:16 }}>
              {Object.entries(scores).map(([key,val]) => {
                const sig = SIGNAL_TYPES[key]; if (!sig) return null;
                const rationale = debrief.scoring_rationale?.[key];
                return (
                  <div key={key} style={{
                    padding:"12px 14px", background:sig.bg, border:`1px solid ${sig.border}60`,
                    borderRadius:6, display:"flex", alignItems:"center", gap:10, maxWidth:280,
                  }}>
                    <div style={{ position:"relative", flexShrink:0 }}>
                      <Ring score={val} color={sig.color} size={44}/>
                      <span style={{
                        position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:12, fontWeight:700, color:sig.color,
                      }}>{val}</span>
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:11, color:sig.color }}>{sig.icon} <span style={{ fontSize:9, color:C.muted, letterSpacing:1 }}>{sig.label.toUpperCase()}</span></div>
                      {rationale && <div style={{ fontSize:10, color:C.body, lineHeight:1.5, marginTop:4, opacity:0.8 }}>{rationale}</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Risk factors */}
            {debrief.risk_factors?.length > 0 && (
              <div style={{ marginBottom:20 }}>
                <SectionLabel>Risk Factors</SectionLabel>
                {debrief.risk_factors.map((rf, i) => {
                  const sig = SIGNAL_TYPES[rf.signal];
                  return (
                    <div key={i} style={{
                      marginBottom:5, padding:"10px 14px",
                      background:"#1a0a0a", borderLeft:"3px solid #f87171",
                      borderRadius:"0 4px 4px 0",
                    }}>
                      <div style={{ fontSize:10, color:"#f87171", letterSpacing:1, marginBottom:4 }}>
                        {sig ? `${sig.icon} ${sig.label.toUpperCase()}` : rf.signal?.toUpperCase()} — {rf.score}
                      </div>
                      <div style={{ fontSize:12, color:C.body, lineHeight:1.7, fontStyle:"italic" }}>"{rf.evidence}"</div>
                    </div>
                  );
                })}
              </div>
            )}

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

        {/* Session transcript */}
        {transcript.length > 0 && (
          <details style={{ marginBottom:20 }}>
            <summary style={{
              fontSize:10, letterSpacing:4, color:C.muted, cursor:"pointer", marginBottom:10,
              textTransform:"uppercase",
            }}>Full Transcript ({transcript.length} lines)</summary>
            <div style={{
              maxHeight:400, overflowY:"auto", padding:16,
              background:C.surface, border:`1px solid ${C.edge}`, borderRadius:6,
              display:"flex", flexDirection:"column", gap:8,
            }}>
              {transcript.map((t, i) => (
                <div key={i} style={{ fontSize:11, lineHeight:1.6 }}>
                  <span style={{
                    fontSize:9, letterSpacing:2, marginRight:10, flexShrink:0,
                    color: t.speaker === "INTERVIEWER" ? "#60a5fa" : "#4ade80",
                  }}>{t.speaker === "INTERVIEWER" ? "YOU" : candidateName.split(" ")[0]?.toUpperCase()}</span>
                  <span style={{ color:C.body }}>{t.text}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <div style={{ display:"flex", gap:10 }}>
          <button onClick={() => setPhase("setup")} style={{
            padding:"10px 24px", background:"transparent", border:`1px solid ${C.edge}`,
            borderRadius:3, color:C.muted, fontSize:10, fontFamily:"inherit",
            letterSpacing:3, cursor:"pointer",
          }}>← NEW SESSION</button>
          {transcript.length > 0 && (
            <button onClick={() => {
              const lines = [`Interview Transcript — ${candidateName} (${roleTitle})`, `Duration: ${fmt(elapsed)}`, ""];
              transcript.forEach(t => lines.push(`[${t.speaker}]: ${t.text}`));
              const blob = new Blob([lines.join("\n")], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `transcript-${candidateName.toLowerCase().replace(/\s+/g, "-")}.txt`;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }} style={{
              padding:"10px 24px", background:"transparent", border:`1px solid ${C.edge}`,
              borderRadius:3, color:C.muted, fontSize:10, fontFamily:"inherit",
              letterSpacing:3, cursor:"pointer",
            }}>↓ TRANSCRIPT</button>
          )}
          {debrief && (
            <button onClick={() => {
              const vc = { "Strong Yes":"#22c55e", "Lean Yes":"#86efac", "Neutral":"#94a3b8", "Lean No":"#fca5a5", "Strong No":"#ef4444", "Strong Progress":"#22c55e", "Making Progress":"#86efac", "Stalled":"#94a3b8", "Resistant":"#fca5a5", "Escalation Needed":"#ef4444", "Clear Diagnosis":"#22c55e", "Partial Clarity":"#86efac", "Needs Follow-Up":"#94a3b8", "Inconclusive":"#fca5a5", "Misaligned Expectations":"#ef4444" };
              const verdictColor = vc[debrief.verdict] || "#94a3b8";
              const scoreColor = v => v >= 65 ? "#22c55e" : v <= 40 ? "#ef4444" : "#94a3b8";
              const obsColor = t => t === "positive" ? "#22c55e" : t === "concern" ? "#ef4444" : "#94a3b8";
              const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

              const scoresHtml = Object.entries(scores).map(([key, val]) => {
                const sig = SIGNAL_TYPES[key]; if (!sig) return "";
                const rationale = debrief.scoring_rationale?.[key];
                return `<tr>
                  <td style="padding:8px 12px;border-bottom:1px solid #252538;color:${scoreColor(val)};font-weight:700;width:50px;text-align:center;">${val}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #252538;color:#c4c9d4;">${esc(sig.label)}${rationale ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px;">${esc(rationale)}</div>` : ""}</td>
                </tr>`;
              }).join("");

              const risksHtml = (debrief.risk_factors || []).map(rf => {
                const sig = SIGNAL_TYPES[rf.signal];
                return `<div style="margin-bottom:6px;padding:10px 14px;background:#1a0a0a;border-left:3px solid #f87171;border-radius:0 4px 4px 0;">
                  <div style="font-size:10px;letter-spacing:1px;color:#f87171;margin-bottom:4px;">${sig ? `${esc(sig.label.toUpperCase())}` : esc((rf.signal||"").toUpperCase())} — ${rf.score}</div>
                  <div style="font-size:12px;color:#c4c9d4;line-height:1.7;font-style:italic;">"${esc(rf.evidence)}"</div>
                </div>`;
              }).join("");

              const obsHtml = (debrief.observations || []).map(obs =>
                `<div style="margin-bottom:6px;padding:10px 14px;background:#161622;border-left:3px solid ${obsColor(obs.type)};border-radius:0 4px 4px 0;">
                  <span style="font-size:12px;color:#c4c9d4;line-height:1.7;">${esc(obs.text)}</span>
                </div>`
              ).join("");

              const stepsHtml = (debrief.next_steps || []).map(s =>
                `<div style="display:flex;gap:10px;margin-bottom:6px;padding:9px 12px;background:#161622;border:1px solid #252538;border-radius:4px;">
                  <span style="color:#60a5fa;flex-shrink:0;">→</span>
                  <span style="font-size:12px;color:#c4c9d4;">${esc(s)}</span>
                </div>`
              ).join("");

              const emailHtml = debrief.follow_up_email_draft
                ? `<div style="margin-bottom:28px;">
                    <div style="font-size:10px;letter-spacing:4px;color:#9ca3af;margin-bottom:10px;text-transform:uppercase;">Follow-Up Email Draft</div>
                    <div style="padding:16px;background:#161622;border:1px solid #252538;border-radius:4px;font-size:12px;color:#c4c9d4;line-height:1.8;white-space:pre-wrap;">${esc(debrief.follow_up_email_draft)}</div>
                  </div>` : "";

              const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Debrief — ${esc(candidateName)}</title></head>
<body style="margin:0;padding:0;background:#0d0d14;font-family:'Courier New',monospace;">
<div style="max-width:680px;margin:0 auto;padding:32px 24px;">
  <div style="font-size:9px;letter-spacing:5px;color:#9ca3af;margin-bottom:8px;">INTERVIEW DEBRIEF</div>
  <h1 style="font-size:24px;font-weight:700;margin:0 0 4px;color:#f1f5f9;">${esc(candidateName)}</h1>
  <div style="font-size:12px;color:#9ca3af;margin-bottom:24px;">${esc(roleTitle)} · Duration: ${fmt(elapsed)}</div>

  <div style="padding:14px 20px;margin-bottom:20px;border-radius:6px;background:#161622;border:1px solid #252538;display:flex;align-items:center;gap:16px;">
    <div>
      <div style="font-size:9px;letter-spacing:3px;color:#9ca3af;margin-bottom:4px;">HIRING VERDICT</div>
      <div style="font-size:20px;font-weight:700;color:${verdictColor};">${esc(debrief.verdict)}</div>
    </div>
    <div style="margin-left:auto;font-size:12px;color:#9ca3af;max-width:400px;line-height:1.6;">${esc(debrief.headline)}</div>
  </div>

  <div style="font-size:10px;letter-spacing:4px;color:#9ca3af;margin-bottom:10px;text-transform:uppercase;">Signal Scores</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;background:#161622;border:1px solid #252538;border-radius:6px;">
    ${scoresHtml}
  </table>

  ${risksHtml ? `<div style="font-size:10px;letter-spacing:4px;color:#9ca3af;margin-bottom:10px;text-transform:uppercase;">Risk Factors</div><div style="margin-bottom:20px;">${risksHtml}</div>` : ""}

  <div style="font-size:10px;letter-spacing:4px;color:#9ca3af;margin-bottom:10px;text-transform:uppercase;">Observations</div>
  <div style="margin-bottom:20px;">${obsHtml}</div>

  <div style="font-size:10px;letter-spacing:4px;color:#9ca3af;margin-bottom:10px;text-transform:uppercase;">Recommended Next Steps</div>
  <div style="margin-bottom:20px;">${stepsHtml}</div>

  ${emailHtml}

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #252538;font-size:10px;color:#9ca3af80;letter-spacing:2px;">GENERATED BY INTERVIEW COPILOT</div>
</div>
</body></html>`;

              const blob = new Blob([html], { type: "text/html" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `debrief-${candidateName.toLowerCase().replace(/\s+/g, "-")}.html`;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }} style={{
              padding:"10px 24px", background:"transparent", border:`1px solid ${C.edge}`,
              borderRadius:3, color:C.muted, fontSize:10, fontFamily:"inherit",
              letterSpacing:3, cursor:"pointer",
            }}>↓ REPORT</button>
          )}
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
        padding:"max(14px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) 14px max(20px, env(safe-area-inset-left))",
        display:"flex", alignItems:"center", gap:10, flexWrap:"wrap",
        borderBottom:`1px solid ${C.edge}22`,
      }}>
        <span style={{
          width:7, height:7, borderRadius:"50%", background:"#ef4444", flexShrink:0,
          animation:"micPulse 1.2s ease-in-out infinite", boxShadow:"0 0 8px #ef444490",
        }}/>
        <span style={{ fontSize:12, color:C.muted, maxWidth:"38%", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{candidateName}</span>
        <span style={{ fontSize:11, color:C.dim }}>·</span>
        <span style={{ fontSize:12, color:C.muted, maxWidth:"38%", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{roleTitle}</span>
        <span style={{ fontSize:13, color:C.muted, fontVariantNumeric:"tabular-nums", marginLeft:"auto" }}>{fmt(elapsed)}</span>
        <span style={{
          width:8, height:8, borderRadius:"50%", flexShrink:0,
          background: pacing === "slow" ? "#f59e0b" : pacing === "rushed" ? "#f87171" : "#4ade80",
          boxShadow: `0 0 6px ${pacing === "slow" ? "#f59e0b" : pacing === "rushed" ? "#f87171" : "#4ade80"}`,
          transition:"all 0.5s ease",
        }} title={`Pacing: ${pacing}`}/>
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
          <div style={{ fontSize:11, color:C.dim, marginTop:14, letterSpacing:1 }}>tap to dismiss</div>
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
          color: analyzeStatus === "analyzing" ? C.muted : C.dim,
          fontSize:14, textAlign:"center", display:"flex", alignItems:"center", gap:10,
        }}>
          {analyzeStatus === "analyzing"
            ? <><span style={{ animation:"spin 1s linear infinite", display:"inline-block", fontSize:16 }}>◌</span> analyzing...</>
            : "listening..."
          }
        </div>
      )}

      {/* Mic button — bottom right */}
      <button onClick={toggleMic} style={{
        position:"absolute",
        bottom:`max(28px, env(safe-area-inset-bottom))`,
        right:`max(28px, env(safe-area-inset-right))`,
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
        position:"absolute",
        bottom:`max(40px, calc(env(safe-area-inset-bottom) + 12px))`,
        left:`max(28px, env(safe-area-inset-left))`,
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
      gridTemplateColumns: hasResume
        ? (isTablet ? "1fr 380px" : "1fr 420px")
        : (isTablet ? (showSignals ? "1fr 280px" : "1fr 0px") : "1fr 320px"),
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
          <span style={{
            width:8, height:8, borderRadius:"50%", flexShrink:0,
            background: pacing === "slow" ? "#f59e0b" : pacing === "rushed" ? "#f87171" : "#4ade80",
            boxShadow: `0 0 6px ${pacing === "slow" ? "#f59e0b" : pacing === "rushed" ? "#f87171" : "#4ade80"}`,
            transition:"all 0.5s ease",
          }} title={`Pacing: ${pacing}`}/>
          <button onClick={() => setShowShortcuts(s => !s)} style={{
            padding:"8px 10px", background:"transparent", border:`1px solid ${C.edge}`,
            borderRadius:4, color:C.muted, fontSize:11, fontFamily:"inherit", cursor:"pointer",
          }} title="Keyboard shortcuts ( / )">?</button>
          <button onClick={endSession} style={{
            padding:"8px 18px", background:"transparent", border:`1px solid ${C.edge}`,
            borderRadius:4, color:C.muted, fontSize:11, fontFamily:"inherit", letterSpacing:2, cursor:"pointer",
          }}>END</button>
        </div>
      </div>

      {/* ── CENTER PANEL ── */}
      {hasResume ? (
        /* ── RESUME VIEWER ── */
        <div style={{ gridColumn:"1/2", overflow:"hidden", display:"flex", flexDirection:"column", background:C.bg }}>
          {/* Toolbar */}
          <div style={{
            display:"flex", alignItems:"center", gap:10, padding:"6px 16px",
            background:C.surface, borderBottom:`1px solid ${C.edge}`, flexShrink:0,
          }}>
            <span style={{ fontSize:12, color:C.muted }}>📄</span>
            <span style={{ fontSize:10, color:C.body, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{resumeName}</span>
            {resumeType === "pdf" && (
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <button onClick={() => setPdfPage(p => Math.max(1, p-1))} disabled={pdfPage <= 1}
                  style={{ background:"none", border:`1px solid ${C.edge}`, borderRadius:3, color: pdfPage <= 1 ? C.dim : C.body, fontSize:11, padding:"2px 8px", cursor: pdfPage <= 1 ? "default" : "pointer", fontFamily:"inherit" }}>‹</button>
                <span style={{ fontSize:10, color:C.muted, minWidth:50, textAlign:"center" }}>{pdfPage} / {pdfNumPages || "?"}</span>
                <button onClick={() => setPdfPage(p => Math.min(pdfNumPages||1, p+1))} disabled={pdfPage >= pdfNumPages}
                  style={{ background:"none", border:`1px solid ${C.edge}`, borderRadius:3, color: pdfPage >= pdfNumPages ? C.dim : C.body, fontSize:11, padding:"2px 8px", cursor: pdfPage >= pdfNumPages ? "default" : "pointer", fontFamily:"inherit" }}>›</button>
                <span style={{ width:1, height:14, background:C.edge, margin:"0 4px" }}/>
                <button onClick={() => setPdfScale(s => Math.max(0.5, +(s-0.15).toFixed(2)))}
                  style={{ background:"none", border:`1px solid ${C.edge}`, borderRadius:3, color:C.body, fontSize:11, padding:"2px 8px", cursor:"pointer", fontFamily:"inherit" }}>−</button>
                <span style={{ fontSize:10, color:C.muted, minWidth:36, textAlign:"center" }}>{Math.round(pdfScale*100)}%</span>
                <button onClick={() => setPdfScale(s => Math.min(3, +(s+0.15).toFixed(2)))}
                  style={{ background:"none", border:`1px solid ${C.edge}`, borderRadius:3, color:C.body, fontSize:11, padding:"2px 8px", cursor:"pointer", fontFamily:"inherit" }}>+</button>
              </div>
            )}
            <button onClick={clearResume} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:14, fontFamily:"inherit", flexShrink:0 }}>✕</button>
          </div>
          {/* Content */}
          <div style={{ flex:1, overflow:"auto", display:"flex", justifyContent:"center", padding:16 }}>
            {resumeType === "pdf" && (
              <Document file={resumeUrl} onLoadSuccess={({ numPages }) => setPdfNumPages(numPages)}
                loading={<div style={{ color:C.muted, fontSize:12 }}>Loading PDF...</div>}
                error={<div style={{ color:"#f87171", fontSize:12 }}>Failed to load PDF</div>}
              >
                <Page pageNumber={pdfPage} scale={pdfScale} renderTextLayer={true} renderAnnotationLayer={true} />
              </Document>
            )}
            {resumeType === "docx" && resumeHtml && (
              <div style={{
                maxWidth:680, width:"100%", color:C.body, fontSize:13, lineHeight:1.8, fontFamily:"inherit",
              }} dangerouslySetInnerHTML={{ __html: resumeHtml }} />
            )}
            {resumeType === "docx" && !resumeHtml && (
              <div style={{ color:C.muted, fontSize:12 }}>Converting document...</div>
            )}
            {resumeType === "image" && (
              <img src={resumeUrl} alt={resumeName} style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain", borderRadius:4 }} />
            )}
            {resumeType === "text" && (
              <pre style={{ maxWidth:680, width:"100%", whiteSpace:"pre-wrap", color:C.body, fontSize:13, lineHeight:1.7, fontFamily:"inherit", margin:0 }}>{resumeHtml}</pre>
            )}
            {resumeType === "doc" && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, color:C.muted, fontSize:12 }}>
                <span style={{ fontSize:32 }}>📄</span>
                <span>Legacy .doc format cannot be previewed in-browser.</span>
                <button onClick={() => window.open(resumeUrl)} style={{
                  padding:"8px 18px", background:"#1d4ed8", border:"none", borderRadius:4,
                  color:"#fff", fontSize:11, fontFamily:"inherit", letterSpacing:2, cursor:"pointer",
                }}>OPEN IN NEW TAB</button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── PROBE FEED (no resume) ── */
        <div style={{ overflow:"auto", padding:"16px 20px", display:"flex", flexDirection:"column", gap:10 }}>
          {renderProbeFeed()}
        </div>
      )}

      {/* ── RIGHT PANEL ── */}
      <div style={{
        gridRow:"2/5", gridColumn:"2/3", overflow:"auto",
        borderLeft:`1px solid ${C.edge}`, background:C.surfaceAlt,
        display: (isTablet && !showSignals && !hasResume) ? "none" : "flex",
        flexDirection:"column",
        padding:0,
      }}>
        {/* Tab bar (only when resume is active) */}
        {hasResume && (
          <div style={{ display:"flex", borderBottom:`1px solid ${C.edge}`, flexShrink:0 }}>
            {[["probes","PROBES","#38bdf8"],["signals","SIGNALS","#fcd34d"]].map(([key,label,color]) => (
              <button key={key} onClick={() => setRightPanelTab(key)} style={{
                flex:1, padding:"10px 0", fontSize:9, letterSpacing:3, fontFamily:"inherit", cursor:"pointer",
                border:"none", background: rightPanelTab === key ? C.surfaceAlt : "transparent",
                color: rightPanelTab === key ? color : C.muted,
                borderBottom: rightPanelTab === key ? `2px solid ${color}` : "2px solid transparent",
              }}>{label}{key === "probes" && activeProbes.length > 0 ? ` (${activeProbes.length})` : ""}</button>
            ))}
          </div>
        )}

        {/* Probes tab content (when resume active and probes tab selected) */}
        {hasResume && rightPanelTab === "probes" && (
          <div style={{ flex:1, overflow:"auto", padding:"12px 10px", display:"flex", flexDirection:"column", gap:8 }}>
            {renderProbeFeed()}
          </div>
        )}

        {/* Signals content (always when no resume, or when signals tab selected) */}
        <div style={{
          flex:1, overflow:"auto", padding:"14px 12px",
          display: hasResume && rightPanelTab !== "signals" ? "none" : "block",
        }}>
        <div style={{ marginBottom:14 }}>
          <SectionLabel>Scores</SectionLabel>
          {Object.entries(SIGNAL_TYPES)
            .filter(([k]) => enabledSignals[k] && k !== "followup")
            .map(([key,sig]) => (
              <div key={key} style={{ marginBottom:9 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:18, letterSpacing:0, color:C.muted }}>{sig.icon} {sig.label}</span>
                  <span style={{ fontSize:10, color: scores[key] ? sig.color : C.dim, fontVariantNumeric:"tabular-nums" }}>
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
        </div>{/* close signals content wrapper */}
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

      {/* ── KEYBOARD SHORTCUTS OVERLAY ── */}
      {showShortcuts && (
        <div onClick={() => setShowShortcuts(false)} style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,.65)", display:"flex",
          alignItems:"center", justifyContent:"center", zIndex:9999,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:C.surface, border:`1px solid ${C.edge}`, borderRadius:8,
            padding:"24px 32px", maxWidth:320,
          }}>
            <div style={{ fontSize:10, letterSpacing:4, color:C.muted, marginBottom:16 }}>KEYBOARD SHORTCUTS</div>
            {[
              ["⌘ M", "Toggle mic"],
              ["⌘ A", "Analyze now"],
              ["⌘ Enter", "Submit text"],
              ["/", "Toggle this panel"],
            ].map(([key, desc]) => (
              <div key={key} style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                <span style={{ fontSize:11, color:C.body }}>{desc}</span>
                <kbd style={{ fontSize:10, color:"#38bdf8", background:C.bg, padding:"2px 8px", borderRadius:3, border:`1px solid ${C.edge}` }}>{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
