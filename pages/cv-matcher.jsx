// /src/components/cv-matcher.jsx
// CV-Magic — v1.4.0 (full file)
// Adds: Live Assistant chat (full-width) that opens only after first Run,
// begins with natural-language ATS insights, and talks to /api/assist.
// JD clears on refresh + Clear button; CV persisted locally + Clear.
// Mobile-friendly gauges, sliders with role profiles, and outputs.

import React, { useEffect, useMemo, useState, useRef } from "react";

// ---------- utils ----------
const STORAGE_KEYS = { CV: "cvMagic_userCV_v1" };
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const ringStyle = (v) => ({ background: `conic-gradient(currentColor ${clamp(v) * 3.6}deg, rgba(0,0,0,0.08) 0deg)` });

const classes = {
  card: "rounded-2xl shadow-sm border border-gray-200 bg-white p-4",
  label: "text-xs font-medium text-gray-500",
  input: "w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300",
  btn: "inline-flex items-center justify-center rounded-xl px-4 py-2 font-medium bg-black text-white hover:bg-gray-800 disabled:opacity-50",
  btnGhost: "inline-flex items-center justify-center rounded-xl px-3 py-2 font-medium border border-gray-300 hover:bg-gray-50",
  title: "text-sm font-semibold text-gray-700",
};

const ROLE_PROFILES = {
  "General (default)": { tempMin: 0.2, tempMax: 0.8, strictMin: 0.3, strictMax: 0.8 },
  "Software Engineer": { tempMin: 0.1, tempMax: 0.6, strictMin: 0.6, strictMax: 0.95 },
  "Product Manager": { tempMin: 0.2, tempMax: 0.9, strictMin: 0.4, strictMax: 0.85 },
  "Data Analyst": { tempMin: 0.1, tempMax: 0.7, strictMin: 0.5, strictMax: 0.9 },
  "Marketing": { tempMin: 0.3, tempMax: 1.0, strictMin: 0.2, strictMax: 0.8 },
  "Copywriter": { tempMin: 0.4, tempMax: 1.0, strictMin: 0.2, strictMax: 0.8 },
};

// ---------- naive analyzers ----------
const tokenize = (t) =>
  (t || "")
    .toLowerCase()
    .replace(/[^a-z\u0590-\u05FF0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);

const uniq = (arr) => Array.from(new Set(arr));

function keywordOverlapScore(jd, cv) {
  const jdT = uniq(tokenize(jd));
  const cvT = uniq(tokenize(cv));
  if (!jdT.length) return 0;
  const overlap = jdT.filter((t) => cvT.includes(t));
  return clamp(Math.round((overlap.length / jdT.length) * 100));
}

function skillsScore(jd, cv) {
  const skillish = (w) => /[0-9+\-/#.]|^[A-Z]{2,}$/.test(w);
  const jdT = uniq(tokenize(jd)).filter(skillish);
  const cvT = uniq(tokenize(cv));
  if (!jdT.length) return 0;
  const hit = jdT.filter((t) => cvT.includes(t));
  return clamp(Math.round((hit.length / jdT.length) * 100));
}

function experienceScore(jd, cv) {
  const nums = (t) => (t.match(/\b(\d{1,2})\b/g) || []).map((n) => parseInt(n, 10));
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const j = sum(nums(jd));
  const c = sum(nums(cv));
  if (!j && !c) return 50;
  if (!j) return 70;
  const ratio = c / (j || 1);
  return clamp(50 + Math.min(50, Math.round((ratio - 1) * 25)));
}

function requirementsCoverageScore(jd, cv) {
  const lines = (jd.match(/^-|\*|•/gm) ? jd.split(/\n/) : []).filter((l) => /^(\-|\*|•)/.test(l.trim()));
  if (!lines.length) return Math.max(40, keywordOverlapScore(jd, cv) - 10);
  const covered = lines.filter((l) => keywordOverlapScore(l, cv) >= 40);
  return clamp(Math.round((covered.length / lines.length) * 100));
}

function overallMatchScore(p) {
  const { keywords, skills, experience, requirements } = p;
  return clamp(Math.round(keywords * 0.25 + skills * 0.25 + experience * 0.2 + requirements * 0.3));
}

// ---------- generators ----------
function paraphrase(text, temperature = 0.3, strictness = 0.7) {
  if (!text) return "";
  let out = text;
  if (temperature > 0.6) {
    const pairs = [
      ["improve", "enhance"], ["manage", "lead"], ["build", "develop"],
      ["create", "craft"], ["optimize", "streamline"], ["experience", "background"],
    ];
    pairs.forEach(([a, b]) => (out = out.replace(new RegExp(`\\b${a}\\b`, "gi"), b)));
  }
  if (strictness > 0.7) out = out.replace(/\bexpert\b/gi, "experienced");
  return out;
}

function generateCoverLetter(jd, cv, match) {
  const name = (cv.match(/^\s*([A-Z][^\n]+)/im) || [,"Candidate"])[1];
  const company = (jd.match(/\b(?:at|@)\s+([A-Z][A-Za-z0-9&\-\s]+)/i) || [,"your company"])[1].trim();
  return [
    `${name}`,
    ``,
    `Dear Hiring Team at ${company},`,
    ``,
    `I’m excited to apply for the role described. Based on my background, I estimate a fit of ~${match}%.`,
    `I look forward to discussing how I can contribute.`,
    ``,
    `Best regards,`,
    `${name}`,
  ].join("\n");
}

function generateTailoredCV(jd, cv, { temp, strict }) {
  const jdWords = uniq(tokenize(jd)).slice(0, 20);
  const highlights = jdWords.slice(0, 10).join(", ");
  return [
    `TARGETED SUMMARY`,
    `• Focus areas: ${highlights}`,
    ``,
    `EXPERIENCE & SKILLS (Tailored)`,
    `${paraphrase(cv, temp, strict)}`,
  ].join("\n");
}

function scoresToTips(s) {
  const parts = [];
  if (s.keywords < 60) parts.push("חסר חפיפה למילות מפתח במודעת הדרושים — שלב עוד מונחים ייחודיים.");
  if (s.skills < 60) parts.push("זיהוי כישורים נמוך — הדגש טכנולוגיות/כלים/שיטות ספציפיות.");
  if (s.experience < 60) parts.push("וותק/מספרים לא בולטים — הוסף שנים, היקפים ותוצאות מדידות.");
  if (s.requirements < 60) parts.push("כיסוי דרישות חלקי — עבור סעיפי בולטים ויישר ניסוחים.");
  if (!parts.length) parts.push("נראה טוב! נלטש ניסוחים ונחזק ראיות מספריות.");
  return parts;
}

// ---------- Chat Panel ----------
function ChatPanel({ visible, context, onApplyToCover, onApplyToCV }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const boxRef = useRef(null);

  // seed first tips when opening
  useEffect(() => {
    if (!visible) return;
    if (messages.length) return;
    const tips = scoresToTips(context.scores);
    const intro = {
      role: "assistant",
      text:
        `ברוך הבא ל-Live Assistant. להלן תובנות מה-ATS:\n` +
        tips.map((t, i) => `• ${t}`).join("\n") +
        `\nאיך תרצה לשפר תחילה — קורות חיים או מכתב מקדים?`,
    };
    setMessages([intro]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!boxRef.current) return;
    boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    const msg = input.trim();
    if (!msg) return;
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setInput("");
    try {
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You are CV-Magic's Live Assistant. Be concise. Improve CV and cover letters using the provided context and ATS scores. Hebrew UI.",
            },
            {
              role: "user",
              content:
                `Context:\nJD:\n${context.jd}\n\nCV:\n${context.cv}\n\nScores:${JSON.stringify(
                  context.scores
                )}\nTemp:${context.temp} Strict:${context.strict}\n\nUser: ${msg}`,
            },
          ],
        }),
      });
      const data = await res.json();
      const answer = data?.message || "שגיאה: לא התקבלה תשובה.";
      setMessages((m) => [...m, { role: "assistant", text: answer }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "אירעה שגיאה מצד השרת." }]);
    }
  }

  return (
    <div className={`${visible ? "" : "hidden"} ${classes.card}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className={classes.title}>Live Assistant</h3>
        <div className="flex gap-2">
          <button className={classes.btnGhost} onClick={() => onApplyToCover(messages)}>
            Apply to Cover Letter
          </button>
          <button className={classes.btnGhost} onClick={() => onApplyToCV(messages)}>
            Apply to Tailored CV
          </button>
        </div>
      </div>
      <div
        ref={boxRef}
        className="h-64 overflow-y-auto rounded-xl border border-gray-200 p-3 bg-gray-50"
      >
        {messages.map((m, i) => (
          <div key={i} className={`mb-3 ${m.role === "user" ? "text-right" : "text-left"}`}>
            <div
              className={`inline-block max-w-[85%] px-3 py-2 rounded-2xl ${
                m.role === "user" ? "bg-black text-white" : "bg-white border border-gray-200"
              }`}
            >
              <pre className="whitespace-pre-wrap break-words text-sm">{m.text}</pre>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className={classes.input}
          placeholder="כתוב הודעה…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className={classes.btn} onClick={send}>Send</button>
      </div>
    </div>
  );
}

// ---------- main component ----------
export default function CVMatcher() {
  const [jobDesc, setJobDesc] = useState("");
  const [userCV, setUserCV] = useState("");
  const [roleProfile, setRoleProfile] = useState("General (default)");
  const [temp, setTemp] = useState(0.3);
  const [strict, setStrict] = useState(0.7);
  const [scores, setScores] = useState({ match: 0, skills: 0, experience: 0, keywords: 0, requirements: 0 });
  const [coverLetter, setCoverLetter] = useState("");
  const [tailoredCV, setTailoredCV] = useState("");
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false); // controls chat visibility

  // persist CV; JD not persisted by design
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CV);
    if (saved) setUserCV(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CV, userCV || "");
  }, [userCV]);

  const ranges = useMemo(() => ROLE_PROFILES[roleProfile], [roleProfile]);
  useEffect(() => {
    setTemp((t) => Math.min(Math.max(t, ranges.tempMin), ranges.tempMax));
    setStrict((s) => Math.min(Math.max(s, ranges.strictMin), ranges.strictMax));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleProfile]);

  function clearJD() { setJobDesc(""); }
  function clearCV() { setUserCV(""); localStorage.removeItem(STORAGE_KEYS.CV); }
  const copy = (t) => navigator.clipboard?.writeText(t || "");

  async function runAnalysis() {
    setRunning(true);
    try {
      const k = keywordOverlapScore(jobDesc, userCV);
      const s = skillsScore(jobDesc, userCV);
      const e = experienceScore(jobDesc, userCV);
      const r = requirementsCoverageScore(jobDesc, userCV);
      const m = overallMatchScore({ keywords: k, skills: s, experience: e, requirements: r });
      setScores({ match: m, skills: s, experience: e, keywords: k, requirements: r });
      setCoverLetter(generateCoverLetter(jobDesc, userCV, m));
      setTailoredCV(generateTailoredCV(jobDesc, userCV, { temp, strict }));
      setHasRun(true);
    } finally {
      setRunning(false);
    }
  }

  function reRunAI() {
    setCoverLetter((t) => paraphrase(t, temp, strict));
    setTailoredCV((t) => paraphrase(t, temp + 0.1, strict));
  }

  function applyMessagesToCover(msgs) {
    const last = msgs.filter((m) => m.role === "assistant").slice(-1)[0]?.text || "";
    if (!last) return;
    setCoverLetter((t) => `${t}\n\n---\nAssistant suggestions:\n${last}`);
  }
  function applyMessagesToCV(msgs) {
    const last = msgs.filter((m) => m.role === "assistant").slice(-1)[0]?.text || "";
    if (!last) return;
    setTailoredCV((t) => `${t}\n\n---\nAssistant suggestions:\n${last}`);
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6">
      {/* Top: Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={classes.card}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={classes.title}>Job Description</h3>
            <button onClick={clearJD} className={classes.btnGhost}>Clear</button>
          </div>
          <textarea
            className={classes.input + " h-48"}
            placeholder="Paste the job ad here… (clears on refresh/exit)"
            value={jobDesc}
            onChange={(e) => setJobDesc(e.target.value)}
          />
          <p className="mt-2 text-xs text-gray-500">* Clears on refresh/exit.</p>
        </div>

        <div className={classes.card}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={classes.title}>Your CV</h3>
            <button onClick={clearCV} className={classes.btnGhost}>Clear</button>
          </div>
          <textarea
            className={classes.input + " h-48"}
            placeholder="Paste your CV here… (saved locally)"
            value={userCV}
            onChange={(e) => setUserCV(e.target.value)}
          />
          <p className="mt-2 text-xs text-gray-500">* Saved locally (localStorage).</p>
        </div>
      </div>

      {/* Middle: ATS Console */}
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Gauges */}
        <div className="xl:col-span-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <GaugeCard title="Keywords" value={scores.keywords} />
          <GaugeCard title="Requirements Coverage" value={scores.requirements} />
          <GaugeCard title="Match Score" value={scores.match} />
          <GaugeCard title="Experience" value={scores.experience} />
          <GaugeCard title="Skills" value={scores.skills} />
        </div>

        {/* Controls */}
        <div className={classes.card}>
          <div className="flex flex-col gap-3">
            <div>
              <label className={classes.label}>Role Strictness</label>
              <select className={classes.input} value={roleProfile} onChange={(e) => setRoleProfile(e.target.value)}>
                {Object.keys(ROLE_PROFILES).map((k) => (<option key={k} value={k}>{k}</option>))}
              </select>
            </div>

            <SliderRow
              label="Creativity (Temperature)"
              hint={`Range ${ranges.tempMin}–${ranges.tempMax}`}
              min={ranges.tempMin}
              max={ranges.tempMax}
              step={0.05}
              value={temp}
              onChange={(v) => setTemp(v)}
            />

            <SliderRow
              label="Role Strictness"
              hint={`Range ${ranges.strictMin}–${ranges.strictMax}`}
              min={ranges.strictMin}
              max={ranges.strictMax}
              step={0.05}
              value={strict}
              onChange={(v) => setStrict(v)}
            />

            <div className="flex items-center gap-3">
              <button className={classes.btn} onClick={runAnalysis} disabled={!jobDesc || !userCV || running}>
                {running ? "Running…" : "Run"}
              </button>
              <span className="text-xs text-gray-500">Chat opens after first run.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chat (full width, only after first run) */}
      <div className="mt-4">
        <ChatPanel
          visible={hasRun}
          context={{ jd: jobDesc, cv: userCV, scores, temp, strict }}
          onApplyToCover={applyMessagesToCover}
          onApplyToCV={applyMessagesToCV}
        />
      </div>

      {/* Bottom: Outputs */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={classes.card}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={classes.title}>Cover Letter</h3>
            <div className="flex gap-2">
              <button className={classes.btnGhost} onClick={() => navigator.clipboard?.writeText(coverLetter)}>Copy</button>
              <button className={classes.btnGhost} onClick={reRunAI}>Re-run with AI</button>
            </div>
          </div>
          <textarea className={classes.input + " h-64"} value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} placeholder="Generated cover letter will appear here…" />
        </div>

        <div className={classes.card}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={classes.title}>Tailored CV</h3>
            <div className="flex gap-2">
              <button className={classes.btnGhost} onClick={() => navigator.clipboard?.writeText(tailoredCV)}>Copy</button>
              <button className={classes.btnGhost} onClick={reRunAI}>Re-run with AI</button>
            </div>
          </div>
          <textarea className={classes.input + " h-64"} value={tailoredCV} onChange={(e) => setTailoredCV(e.target.value)} placeholder="Generated tailored CV will appear here…" />
        </div>
      </div>
    </div>
  );
}

// ---------- subcomponents ----------
function SliderRow({ label, hint, min, max, step, value, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className={classes.label}>{label}</label>
        <span className="text-xs text-gray-400">{hint}</span>
      </div>
      <div className="flex items-center gap-3 mt-1">
        <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
        <div className="min-w-[52px] text-right text-xs tabular-nums text-gray-700">{value.toFixed(2)}</div>
      </div>
    </div>
  );
}

function GaugeCard({ title, value }) {
  const ringColor = value >= 75 ? "text-green-600" : value >= 50 ? "text-amber-500" : "text-red-600";
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-3">
      <div className="text-xs text-gray-500 mb-2">{title}</div>
      <div className={`relative h-20 w-20 rounded-full ${ringColor}`} style={ringStyle(value)} aria-label={`${title} ${value}%`}>
        <div className="absolute inset-2 rounded-full bg-white flex items-center justify-center">
          <div className={`text-sm font-semibold ${value >= 75 ? "text-green-700" : value >= 50 ? "text-amber-700" : "text-red-700"}`}>{value}%</div>
        </div>
      </div>
      <div className="w-full mt-3 h-2 rounded-full bg-gray-100">
        <div className={`h-2 rounded-full ${value >= 75 ? "bg-green-600" : value >= 50 ? "bg-amber-500" : "bg-red-600"}`} style={{ width: `${clamp(value)}%` }} />
      </div>
    </div>
  );
}
