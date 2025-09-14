import React, { useMemo, useState } from "react";
import { InvokeLLM } from "../lib/core";

// ===== helpers =====
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function labelForScore(s) {
  if (s >= 85) return "התאמה מצוינת";
  if (s >= 60) return "התאמה טובה";
  if (s > 0)  return "התאמה נמוכה";
  return "";
}
function safeParse(jsonish) {
  if (!jsonish) return null;
  if (typeof jsonish === "object") return jsonish;
  try { return JSON.parse(jsonish); } catch {}
  const m = String(jsonish).match(/\{[\s\S]*\}$/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text || ""); } catch {}
}

// SVG ring
function Ring({ value = 0, size = 140, stroke = 12, label, sublabel }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const v = clamp(Number(value) || 0, 0, 100);
  const offset = circumference * (1 - v / 100);
  const color = v >= 85 ? "#22c55e" : v >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="block">
        <circle cx={size/2} cy={size/2} r={radius} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
        <circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
          className="font-semibold" style={{ fontSize: size * 0.26 }} fill="#111827">{Math.round(v)}</text>
      </svg>
      {label && <div className="mt-1 text-sm font-medium text-gray-800">{label}</div>}
      {sublabel && <div className="-mt-0.5 text-xs text-gray-500">{sublabel}</div>}
    </div>
  );
}
function SmallRing({ value, label }) {
  return (
    <div className="flex flex-col items-center">
      <Ring value={value} size={82} stroke={8} />
      <div className="mt-1 text-xs text-gray-600">{label}</div>
    </div>
  );
}

export default function CvMatcher() {
  // ===== inputs =====
  const [jobText, setJobText] = useState("");
  const [cvText, setCvText]   = useState("");

  // ===== controls =====
  const [model, setModel]   = useState("gpt-4.1-mini");
  const [volume, setVolume] = useState(5); // 1..9
  const temperature = 0.5; // 🔒 fixed & hidden per request
  const [runCount, setRunCount] = useState(0);

  // ===== results =====
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const [matchScore, setMatchScore] = useState(0);
  const [sub, setSub] = useState({ skills: null, experience: null, keywords: null });
  const [strengths, setStrengths] = useState([]);
  const [gaps, setGaps] = useState([]);
  const [recs, setRecs] = useState([]);

  const [adaptedCV, setAdaptedCV] = useState("");
  const [coverLetter, setCoverLetter] = useState("");

  const canRun = useMemo(() => jobText.trim() && cvText.trim(), [jobText, cvText]);
  const scoreLabel = useMemo(() => labelForScore(matchScore), [matchScore]);

  // ===== prompt builders =====
  const basePrompt = useMemo(() => {
    return `You are an ATS-style evaluator and resume rewriter.
Return STRICT JSON with keys: analysis, adapted_cv, cover_letter.

analysis must include:
- match_score (0-100, integer)
- strengths (string[])
- gaps (string[])
- recommendations (string[])
- skills_match (0-100, integer)
- experience_match (0-100, integer)
- keywords_match (0-100, integer)

Rules:
- Be concise and concrete. Bullet points are welcome.
- Preserve truthful facts; do not invent employment or education.
- Write outputs in the SAME language as the JOB POSTING.

JOB POSTING:\n${jobText}\n\nRESUME:\n${cvText}`;
  }, [jobText, cvText]);

  const doublePrompt = useMemo(() => {
    return `You are an ATS-style evaluator.
Return STRICT JSON with key "analysis" (match_score, strengths, gaps, recommendations, skills_match, experience_match, keywords_match)
and copy "adapted_cv" = the input ADAPTED CV unchanged, and "cover_letter" = "".

JOB POSTING:\n${jobText}\n\nADAPTED CV TO CHECK:\n${adaptedCV || "(empty)"}`;
  }, [jobText, adaptedCV]);

  async function runOnce(doubleCheck = false) {
    if (!canRun) return;
    setLoading(true); setError("");
    try {
      const res = await InvokeLLM({ model, temperature, prompt: doubleCheck ? doublePrompt : basePrompt });
      const raw  = res?.content ?? res;
      const parsed = safeParse(raw);
      if (!parsed) throw new Error("פלט לא תקין מהמודל (לא JSON)");

      const a = parsed.analysis || {};
      setMatchScore(clamp(Number(a.match_score) || 0, 0, 100));
      setSub({
        skills: a.skills_match ?? null,
        experience: a.experience_match ?? null,
        keywords: a.keywords_match ?? null,
      });
      setStrengths(Array.isArray(a.strengths) ? a.strengths : []);
      setGaps(Array.isArray(a.gaps) ? a.gaps : []);
      setRecs(Array.isArray(a.recommendations) ? a.recommendations : []);

      if (!doubleCheck) {
        setAdaptedCV(String(parsed.adapted_cv || ""));
        setCoverLetter(String(parsed.cover_letter || ""));
        setRunCount((x) => x + 1);
      }
    } catch (e) {
      setError(e?.message || "שגיאה בהרצה");
    } finally {
      setLoading(false);
    }
  }

  // ===== UI =====
  return (
    <div className="mx-auto max-w-6xl p-4 space-y-6">
      {/* header */}
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">התאמת קורות חיים למשרה</h1>
        <p className="text-sm text-gray-600">הדבק מודעת דרושים וקו״ח. בחר מודל ודרגת חופש, והרץ.</p>
      </header>

      {/* inputs */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="mb-2 text-sm font-medium">דרישות המשרה</div>
          <textarea
            value={jobText}
            onChange={(e) => setJobText(e.target.value)}
            placeholder="הדבק כאן את מודעת הדרושים"
            className="w-full h-48 resize-y rounded-xl border border-gray-200 p-3 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="mb-2 text-sm font-medium">קורות החיים שלך</div>
          <textarea
            value={cvText}
            onChange={(e) => setCvText(e.target.value)}
            placeholder="הדבק כאן את קו״ח"
            className="w-full h-48 resize-y rounded-xl border border-gray-200 p-3 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
      </section>

      {/* central console + compact content card */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* central console */}
        <div className="bg-white rounded-2xl shadow-sm p-6 col-span-1 lg:col-span-2">
          <h3 className="text-lg font-medium mb-4">דירוג התאמה</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="md:col-span-1 flex justify-center">
              <Ring value={matchScore} size={170} stroke={12} label={scoreLabel} />
            </div>
            <div className="md:col-span-2">
              <div className="grid grid-cols-3 gap-6">
                <SmallRing value={sub.skills} label="כישורים" />
                <SmallRing value={sub.experience} label="ניסיון" />
                <SmallRing value={sub.keywords} label="מילות מפתח" />
              </div>

              {/* notes accordion */}
              <details className="mt-6 group">
                <summary className="cursor-pointer list-none select-none flex items-center gap-2 text-sm font-medium text-gray-800">
                  <span>הערות נוספות</span>
                  <svg className="h-4 w-4 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.585l3.71-3.354a.75.75 0 011.04 1.08l-4.24 3.83a.75.75 0 01-1.04 0l-4.24-3.83a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
                </summary>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <ul className="bg-gray-50 rounded-xl p-3 text-sm leading-6">
                    <div className="font-semibold mb-2">חוזקות</div>
                    {strengths?.length ? strengths.map((s, i) => (
                      <li key={i} className="list-disc mr-5">{s}</li>
                    )) : <li className="text-gray-500">—</li>}
                  </ul>
                  <ul className="bg-gray-50 rounded-xl p-3 text-sm leading-6">
                    <div className="font-semibold mb-2">פערים</div>
                    {gaps?.length ? gaps.map((s, i) => (
                      <li key={i} className="list-disc mr-5">{s}</li>
                    )) : <li className="text-gray-500">—</li>}
                  </ul>
                  <ul className="bg-gray-50 rounded-xl p-3 text-sm leading-6">
                    <div className="font-semibold mb-2">המלצות</div>
                    {recs?.length ? recs.map((s, i) => (
                      <li key={i} className="list-disc mr-5">{s}</li>
                    )) : <li className="text-gray-500">—</li>}
                  </ul>
                </div>
              </details>
            </div>
          </div>
        </div>

        {/* compact content card */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <h3 className="text-lg font-medium">יצירת תוכן</h3>
          <div className="space-y-3">
            <label className="block text-sm text-gray-700">מודל AI</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-xl border border-gray-200 p-2.5 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              <option value="gpt-4.1-mini">GPT-4.1 mini</option>
              <option value="gpt-4o-mini">GPT-4o mini</option>
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-700">דרגת חופש</label>
              <span className="text-xs text-gray-500">{volume} / 9</span>
            </div>
            <div className="px-1">
              <input type="range" min={1} max={9} step={1} value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full accent-black" />
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                {Array.from({ length: 9 }).map((_, i) => <span key={i}>{i+1}</span>)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button onClick={() => runOnce(false)} disabled={!canRun || loading}
              className="rounded-xl px-4 py-2 bg-black text-white text-sm font-medium disabled:opacity-60">
              {loading ? "מייצר…" : "הרצה (ניתוח + טיוב)"}
            </button>
            <button onClick={() => runOnce(true)} disabled={!adaptedCV || loading}
              className="rounded-xl px-4 py-2 border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
              Double‑Check
            </button>
          </div>

          <div className="text-xs text-gray-500">Runs: {runCount}</div>
        </div>
      </section>

      {/* outputs */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-medium">קורות חיים מותאמים</h3>
            <button onClick={() => copy(adaptedCV)} className="text-xs underline">העתק</button>
          </div>
          <pre className="whitespace-pre-wrap text-sm leading-6 text-gray-800">{adaptedCV || "—"}</pre>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-medium">מכתב מקדים</h3>
            <button onClick={() => copy(coverLetter)} className="text-xs underline">העתק</button>
          </div>
          <pre className="whitespace-pre-wrap text-sm leading-6 text-gray-800">{coverLetter || "—"}</pre>
        </div>
      </section>

      {error ? (
        <div className="p-3 rounded-xl border border-red-300 bg-red-50 text-red-800 text-sm">{error}</div>
      ) : null}

      <footer className="text-xs text-gray-500">טיפ: אם הפלט נראה כמו JSON גולמי — הרץ שוב. יש ניסיון אוטומטי לתקן/לפרסר.</footer>
    </div>
  );
}

