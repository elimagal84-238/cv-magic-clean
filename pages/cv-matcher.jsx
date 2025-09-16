// pages/cv-matcher.jsx
// Old layout kept, now with a real Live Assistant wired to /api/openai-chat.

import { useEffect, useMemo, useRef, useState } from "react";

const LS_KEYS = { cv: "cvMagic.cvText", slider: "cvMagic.creativitySlider", role: "cvMagic.rolePreset", runIdx: "cvMagic.runIndex" };
const ROLE_PRESETS = {
  Surgeon: { min: 0.1, max: 0.4, step: 0.05 },
  Accountant: { min: 0.15, max: 0.45, step: 0.05 },
  "Product Manager": { min: 0.3, max: 0.7, step: 0.07 },
  Copywriter: { min: 0.4, max: 0.9, step: 0.1 },
};

const clamp01 = (x) => Math.max(0, Math.min(1, Number(x || 0)));
const clamp100 = (x) => Math.max(0, Math.min(100, Math.round(Number(x || 0))));
const scoreColor = (pct) => (pct >= 67 ? "text-green-600" : pct >= 34 ? "text-yellow-600" : "text-red-600");
const cn = (...xs) => xs.filter(Boolean).join(" ");
const saveLS = (k, v) => { try { localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch {} };
const loadLS = (k, defv) => { try { const s = localStorage.getItem(k); if (!s) return defv; if (/^[{\[]/.test(s)) return JSON.parse(s); return s; } catch { return defv; } };

// ----- ring gauge -----
function RingGauge({ label, value = 0, size = 150, stroke = 14, onClick, title }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(value || 0)));
  const dash = (pct / 100) * c;
  const color = scoreColor(pct);
  return (
    <button className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} onClick={onClick} title={title || label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#eee" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={stroke} fill="none"
          className={color} strokeDasharray={`${dash} ${c - dash}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-semibold text-sm">{label}</div>
        <div className={cn("text-xl font-semibold", color)}>{pct}%</div>
      </div>
    </button>
  );
}

// ----- Live Assistant (NEW) -----
function LiveAssistant({ visible, jobDesc, userCV, scores, onApplyCover, onApplyCV }) {
  const [msgs, setMsgs] = useState([]);      // {role:'user'|'assistant', text}
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [msgs]);

  // open with seeded message after first run
  useEffect(() => {
    if (!visible) return;
    if (msgs.length) return;
    const seed = [
      "תובנות ראשונות מה-ATS:",
      scores.skills < 40 ? "• הוסף אזכורים מפורשים למיומנויות וכלים מהמודעה." : "• המיומנויות נראות טוב.",
      scores.requirements < 50 ? "• כיסה דרישות אחת-לאחת עם bullets קצרים." : "• רוב הדרישות מכוסות היטב.",
      scores.keywords < 35 ? "• שלב מילות מפתח עיקריות בניסוח טבעי." : "• מילות המפתח תואמות יפה.",
      scores.experience < 55 ? "• ציין שנות ניסיון במספרים ברורים." : "• רמת הניסיון נראית תואמת."
    ].join("\n");
    setMsgs([{ role: "assistant", text: seed }]);
  }, [visible]); // eslint-disable-line

  async function send() {
    const content = input.trim();
    if (!content || busy) return;
    setMsgs((m) => [...m, { role: "user", text: content }]);
    setInput(""); setBusy(true);
    try {
      const resp = await fetch("/api/openai-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          job_description: jobDesc,
          cv_text: userCV,
          ats_scores: scores,
          messages: [...msgs, { role: "user", text: content }],
          temperature: 0.3,
        }),
      });
      const j = await resp.json();
      if (j?.reply) setMsgs((m) => [...m, { role: "assistant", text: j.reply }]);
      else setMsgs((m) => [...m, { role: "assistant", text: "תקלה זמנית, נסה שוב." }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "שגיאת רשת. נסה שוב." }]);
    } finally { setBusy(false); }
  }

  function applyTo(target) {
    const last = [...msgs].reverse().find(m => m.role === "assistant")?.text || "";
    if (!last) return;
    target(last);
  }

  if (!visible) return (
    <div className="rounded-xl shadow border bg-white p-4">
      <h3 className="font-semibold text-gray-800 mb-2">Live Assistant</h3>
      <textarea readOnly className="w-full rounded-lg border px-3 py-2 text-sm h-48 bg-gray-50"
        value={`הצ׳אט נפתח לאחר הרצה ראשונה.`} />
    </div>
  );

  return (
    <div className="rounded-xl shadow border bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-800">Live Assistant</h3>
        <div className="flex gap-2">
          <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => applyTo(onApplyCover)}>Apply to Cover Letter</button>
          <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => applyTo(onApplyCV)}>Apply to Tailored CV</button>
        </div>
      </div>
      <div ref={boxRef} className="border rounded-lg p-3 h-48 overflow-auto bg-gray-50">
        {msgs.map((m, i) => (
          <div key={i} className={cn("mb-2", m.role === "user" && "text-right")}>
            <div className="inline-block px-3 py-2 rounded-lg bg-white whitespace-pre-wrap break-words text-sm">
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className="w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="כתוב הודעה…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60" onClick={send} disabled={busy}>
          {busy ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}

export default function CVMatcher() {
  const [jd, setJD] = useState("");
  const [cv, setCV] = useState("");
  const [rolePreset, setRolePreset] = useState(loadLS(LS_KEYS.role, ROLE_PRESETS["Product Manager"]));
  const [slider, setSlider] = useState(Number(loadLS(LS_KEYS.slider, 5)) || 5);
  const [runIdx, setRunIdx] = useState(Number(loadLS(LS_KEYS.runIdx, 0)) || 0);
  const [model, setModel] = useState("chatgpt");
  const [target, setTarget] = useState("all");

  const [scores, setScores] = useState({ match: 0, keywords: 0, requirements: 0, experience: 0, skills: 0 });
  const [cover, setCover] = useState("");
  const [tailored, setTailored] = useState("");
  const [hasRun, setHasRun] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => { const s = String(loadLS(LS_KEYS.cv, "") || ""); if (s && !cv) setCV(s); }, []);
  useEffect(() => { saveLS(LS_KEYS.cv, String(cv || "")); }, [cv]);

  async function run() {
    setRunning(true);
    try {
      const body = { job_description: jd, cv_text: cv, role_preset: rolePreset, slider, run_index: runIdx, model_pref: model, target };
      const resp = await fetch("/api/openai-match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await resp.json();
      setScores({
        match: clamp100(j.match_score),
        keywords: clamp100(j.keywords_match),
        requirements: clamp100(j.requirements_match),
        experience: clamp100(j.experience_match),
        skills: clamp100(j.skills_match),
      });
      setCover(String(j.cover_letter || ""));
      setTailored(String(j.tailored_cv || ""));
      setHasRun(true);
      setRunIdx((x) => { const n = (Number(x || 0) + 1) % 99999; saveLS(LS_KEYS.runIdx, n); return n; });
    } catch (e) {
      alert("Run failed: " + (e?.message || "unknown"));
    } finally { setRunning(false); }
  }

  const slots = useMemo(() => {
    const A = jd.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    const B = cv.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    const m = Math.max(A.length, B.length);
    return Array.from({ length: m }, (_, i) => ({ left: A[i] || "", right: B[i] || "" }));
  }, [jd, cv]);

  const applyCover = (text) => setCover((t) => `${t}\n\n---\nAssistant suggestions:\n${text}`);
  const applyCV = (text) => setTailored((t) => `${t}\n\n---\nAssistant suggestions:\n${text}`);

  return (
    <div className="container mx-auto p-4 md:p-6">
      {/* Inputs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl shadow border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800">Job Description</h3>
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setJD("")}>Clear</button>
          </div>
          <textarea className="w-full rounded-lg border px-3 py-2 text-sm h-48" placeholder="Paste the job ad here…" value={jd} onChange={(e) => setJD(e.target.value)} />
          <p className="mt-2 text-xs text-gray-500">* Clears on refresh/exit.</p>
        </div>
        <div className="rounded-xl shadow border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800">Your CV</h3>
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setCV("")}>Clear</button>
          </div>
          <textarea className="w-full rounded-lg border px-3 py-2 text-sm h-48" placeholder="Paste your CV text here… (saved locally)" value={cv} onChange={(e) => setCV(e.target.value)} />
          <p className="mt-2 text-xs text-gray-500">* Saved locally (localStorage).</p>
        </div>
      </div>

      {/* Gauges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
        <RingGauge label="Keywords" value={scores.keywords} />
        <RingGauge label="Requirements" value={scores.requirements} title="Requirements Coverage" />
        <RingGauge label="Match" value={scores.match} title="Match Score" />
        <RingGauge label="Experience" value={scores.experience} />
        <RingGauge label="Skills" value={scores.skills} />
      </div>

      {/* Controls + Chat */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <div className="rounded-xl shadow border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-gray-800">Controls</div>
            <button className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60" onClick={run} disabled={running}>{running ? "Running…" : "Run"}</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
            <div>
              <div className="text-xs text-gray-500 mb-1">Role Preset</div>
              <select className="w-full rounded-lg border px-3 py-2 text-sm"
                value={JSON.stringify(rolePreset)}
                onChange={(e) => { const v = JSON.parse(e.target.value); setRolePreset(v); saveLS(LS_KEYS.role, v); }}>
                {Object.entries(ROLE_PRESETS).map(([name, v]) => (<option key={name} value={JSON.stringify(v)}>{name}</option>))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Min: {rolePreset.min} | Max: {rolePreset.max} | Step: {rolePreset.step}</p>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Creativity (1..9)</div>
              <input type="range" min={1} max={9} step={1} className="w-full"
                value={slider} onChange={(e) => { const v = Number(e.target.value); setSlider(v); saveLS(LS_KEYS.slider, v); }} />
              <div className="text-xs text-gray-500 mt-1">Value: {slider}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Model</div>
              <select className="w-full rounded-lg border px-3 py-2 text-sm" value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="chatgpt">ChatGPT (OpenAI)</option>
                <option value="gemini">Gemini (Google)</option>
                <option value="claude">Claude (Anthropic)</option>
              </select>
              <div className="text-xs text-gray-500 mb-1 mt-3">Target</div>
              <select className="w-full rounded-lg border px-3 py-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="all">All</option>
                <option value="cover">Cover Letter only</option>
                <option value="cv">Tailored CV only</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">Server scoring & generation via <code>/api/openai-match</code>. Live chat via <code>/api/openai-chat</code>.</p>
        </div>

        <LiveAssistant
          visible={hasRun}
          jobDesc={jd}
          userCV={cv}
          scores={scores}
          onApplyCover={(text) => setCover((t) => `${t}\n\n---\nAssistant suggestions:\n${text}`)}
          onApplyCV={(text) => setTailored((t) => `${t}\n\n---\nAssistant suggestions:\n${text}`)}
        />
      </div>

      {/* Outputs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <div className="rounded-xl shadow border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800">Cover Letter</h3>
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => navigator.clipboard?.writeText(cover)}>Copy</button>
          </div>
          <textarea className="w-full rounded-lg border px-3 py-2 text-sm h-48" value={cover} onChange={(e) => setCover(e.target.value)} />
        </div>
        <div className="rounded-xl shadow border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800">Tailored CV</h3>
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => navigator.clipboard?.writeText(tailored)}>Copy</button>
          </div>
          <textarea className="w-full rounded-lg border px-3 py-2 text-sm h-48" value={tailored} onChange={(e) => setTailored(e.target.value)} />
        </div>
      </div>
    </div>
  );
}
