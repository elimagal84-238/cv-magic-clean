import React, { useMemo, useState } from "react";
import { InvokeLLM } from "../lib/core";

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function labelForScore(s) {
  if (s >= 85) return "Excellent";
  if (s >= 70) return "Good";
  if (s >= 40) return "Partial";
  return "Low match";
}
function barColor(s) {
  if (s >= 85) return "bg-green-700";
  if (s >= 70) return "bg-green-500";
  if (s >= 40) return "bg-yellow-500";
  return "bg-red-500";
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

export default function CvMatcher() {
  // INPUTS (top)
  const [jobText, setJobText] = useState("");
  const [cvText, setCvText] = useState("");

  // CENTER CONTROL
  const [model, setModel] = useState("gpt-4o-mini"); // one model for now
  const [volume, setVolume] = useState(5);           // 1..9
  const [runCount, setRunCount] = useState(0);       // increments each run

  // RESULTS (bottom)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [matchScore, setMatchScore] = useState(0);
  const [strengths, setStrengths] = useState([]);
  const [gaps, setGaps] = useState([]);
  const [recommendations, setRecommendations] = useState([]);

  const [adaptedCV, setAdaptedCV] = useState("");
  const [coverLetter, setCoverLetter] = useState("");

  const canRun = useMemo(() =>
    jobText.trim().length > 0 && cvText.trim().length > 0, [jobText, cvText]
  );

  // Temperature logic: first run temp = volume/10; each subsequent run increase both
  const computed = useMemo(() => {
    const v = clamp(volume, 1, 9);
    const runs = Math.max(runCount, 0);
    const effectiveVolume = clamp(v + (runs > 0 ? runs : 0), 1, 9);
    // temp starts as volume/10 and increases +0.1 each extra run (capped to 0.9)
    let baseTemp = v / 10;
    if (runs > 0) baseTemp = Math.min(0.9, baseTemp + runs * 0.1);
    return { effectiveVolume, temperature: Number(baseTemp.toFixed(1)) };
  }, [volume, runCount]);

  const prompt = useMemo(() => {
    // Language auto: “Write outputs in the same language as the JOB POSTING.”
    return `You are an ATS-style evaluator and resume rewriter.
Return STRICT JSON with keys: analysis, adapted_cv, cover_letter.

analysis must include:
- match_score (0-100, integer)
- strengths (string[])
- gaps (string[])
- recommendations (string[])

Rules:
- Write outputs in the SAME language as the JOB POSTING text.
- Do NOT invent facts. You may rephrase, reorder, and normalize formatting.
- If alignment is already strong and no rewrite is needed, say so in recommendations and produce adapted_cv = original CV (lightly normalized).
- Rewrite freedom level (1=only synonyms, 9=free tailoring): ${computed.effectiveVolume} of 9.
- Be strict JSON. No extra prose around it.

JOB POSTING:
${jobText}

ORIGINAL CV:
${cvText}`;
  }, [jobText, cvText, computed.effectiveVolume]);

  async function runOnce({ doubleCheck = false } = {}) {
    if (!canRun) return;
    setLoading(true);
    setError("");

    try {
      const payload = {
        model,
        temperature: computed.temperature,
        prompt: promptFor(doubleCheck),
      };
      const res = await InvokeLLM(payload);
      const raw = res?.content ?? res;
      const parsed = safeParse(raw);
      if (!parsed) throw new Error("פלט לא תקין מהמודל (לא JSON תקין)");

      const a = parsed.analysis || {};
      const s = Number(a.match_score) || 0;
      setMatchScore(clamp(s, 0, 100));
      setStrengths(Array.isArray(a.strengths) ? a.strengths : []);
      setGaps(Array.isArray(a.gaps) ? a.gaps : []);
      setRecommendations(Array.isArray(a.recommendations) ? a.recommendations : []);

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

  function promptFor(doubleCheck) {
    if (!doubleCheck) return prompt;
    // Double-check: analyze the already-adapted CV vs job posting
    return `You are an ATS-style evaluator.
Return STRICT JSON with key "analysis" (match_score, strengths, gaps, recommendations) and
copy "adapted_cv" = the input ADAPTED CV unchanged, and "cover_letter" = "".

JOB POSTING:
${jobText}

ADAPTED CV TO CHECK:
${adaptedCV || "(empty)"}`
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">התאמת קורות חיים למשרה</h1>
        <p className="text-sm text-gray-600">הדבק טקסט של מודעה וקו״ח, בחר מודל ונפח (Volume), ולחץ הרצה.</p>
      </header>

      {/* Top inputs */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col">
          <label className="mb-2 text-sm font-medium">מודעת דרושים</label>
          <textarea className="min-h-[180px] border rounded-xl p-3"
            placeholder="הדבק כאן את טקסט המשרה…"
            value={jobText} onChange={(e) => setJobText(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="mb-2 text-sm font-medium">קורות חיים (קלט)</label>
          <textarea className="min-h-[180px] border rounded-xl p-3"
            placeholder="הדבק כאן את קורות החיים…"
            value={cvText} onChange={(e) => setCvText(e.target.value)} />
        </div>
      </section>

      {/* Center control box (the 5th box) */}
      <section className="border rounded-2xl p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="text-sm">
            <label className="block mb-1 font-medium">מודל</label>
            <select className="border rounded-lg px-2 py-1 w-full" value={model}
              onChange={(e) => setModel(e.target.value)}>
              <option value="gpt-4o-mini">GPT-4o mini</option>
              <option value="gpt-4.1-mini">GPT-4.1 mini</option>
              <option value="claude-3-haiku">Claude 3 Haiku (proxy)</option>
              <option value="gemini-1.5-flash">Gemini 1.5 Flash (proxy)</option>
            </select>
          </div>
          <div className="text-sm">
            <label className="block mb-1 font-medium">Volume (1–9)</label>
            <input type="range" min={1} max={9} value={volume}
              onChange={(e) => setVolume(Number(e.target.value))} className="w-full" />
            <div className="flex justify-between text-xs text-gray-600">
              <span>נפח: {volume}</span>
              <span>Temp: {computed.temperature}</span>
              <span>Runs: {runCount}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => runOnce({ doubleCheck: false })}
              disabled={!canRun || loading}
              className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50 w-full">
              {loading ? "מייצר…" : "הרצה (ניתוח + טיוטות)"}
            </button>
          </div>
        </div>

        {/* ATS panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 space-y-3 border rounded-xl p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">מדד התאמה</span>
              <span className="font-medium">{matchScore}% · {labelForScore(matchScore)}</span>
            </div>
            <div className="w-full h-3 rounded-full bg-gray-200 overflow-hidden">
              <div className={`h-full ${barColor(matchScore)}`} style={{ width: `${matchScore}%` }} />
            </div>

            <div>
              <h4 className="font-medium mb-1">חוזקות</h4>
              <ul className="list-disc ps-5 space-y-1 text-sm">
                {(strengths?.length ? strengths : ["—"]).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-1">פערים</h4>
              <ul className="list-disc ps-5 space-y-1 text-sm">
                {(gaps?.length ? gaps : ["—"]).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-1">המלצות</h4>
              <ul className="list-disc ps-5 space-y-1 text-sm">
                {(recommendations?.length ? recommendations : ["—"]).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>

            <button
              onClick={() => runOnce({ doubleCheck: true })}
              disabled={!adaptedCV || loading}
              className="mt-2 px-3 py-2 rounded-lg border hover:bg-gray-50 w-full text-sm">
              בדיקה מחדש של הקו״ח המותאמים (Double-Check)
            </button>
          </div>

          {/* Bottom two text boxes */}
          <div className="md:col-span-1 border rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">קורות חיים מותאמים</h4>
              <button onClick={() => copy(adaptedCV)} className="px-3 py-1 text-sm rounded-lg border hover:bg-gray-50">
                העתק
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-sm leading-6">{adaptedCV || "—"}</pre>
          </div>

          <div className="md:col-span-1 border rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">מכתב מקדים</h4>
              <button onClick={() => copy(coverLetter)} className="px-3 py-1 text-sm rounded-lg border hover:bg-gray-50">
                העתק
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-sm leading-6">{coverLetter || "—"}</pre>
          </div>
        </div>

        {error ? (
          <div className="p-3 rounded-xl border border-red-300 bg-red-50 text-red-800 text-sm">{error}</div>
        ) : null}
      </section>

      <footer className="text-xs text-gray-500">
        טיפ: אם הפלט נראה כמו JSON גולמי — הרץ שוב. המערכת מנסה לפרסר תגובות גם אם עטופות בטקסט.
      </footer>
    </div>
  );
}
