import React, { useCallback, useEffect, useMemo, useState } from "react";
import { InvokeLLM } from "@/lib/core"; // assumes you created lib/core.js with InvokeLLM

/**
 * CV Matcher — fixed version
 * - Calls LLM once to get BOTH: structured analysis (JSON) + readable drafts
 * - Safely parses JSON (even if model returns it as a string)
 * - Renders score bar + strengths/gaps
 * - Renders TWO text boxes: Adapted CV and Cover Letter (markdown-ish text)
 * - Has Copy buttons that copy the visible text
 * - Volume slider controls rewrite freedom (1–9)
 *
 * Drop-in replacement for your existing cv-matcher.jsx
 */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function safeParseJSON(maybeJSON) {
  if (maybeJSON == null) return null;
  if (typeof maybeJSON === "object") return maybeJSON;
  try {
    return JSON.parse(maybeJSON);
  } catch (e) {
    // Try to extract JSON if the model wrapped it in code fences
    const match = String(maybeJSON).match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (_) {}
    }
    return null;
  }
}

function toLines(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/\r?\n/).filter(Boolean);
  return [String(value)];
}

function CopyButton({ text, label = "העתק" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text || "");
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch (e) {
          console.error("Copy failed", e);
        }
      }}
      className="px-3 py-1 text-sm rounded-lg border hover:bg-gray-50"
      disabled={!text}
    >
      {copied ? "הועתק" : label}
    </button>
  );
}

function MatchIndicator({ score = 0 }) {
  const value = clamp(Number(score) || 0, 0, 100);
  const barColor = value < 40 ? "bg-red-500" : value < 70 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>מדד התאמה</span>
        <span className="font-medium">{value}%</span>
      </div>
      <div className="w-full h-3 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function CVMatcher() {
  const [cvText, setCvText] = useState("");
  const [jobText, setJobText] = useState("");
  const [volume, setVolume] = useState(5);
  const [model, setModel] = useState("gpt-4o-mini");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Parsed analysis
  const [matchScore, setMatchScore] = useState(0);
  const [strengths, setStrengths] = useState([]);
  const [gaps, setGaps] = useState([]);
  const [recommendations, setRecommendations] = useState([]);

  // Readable drafts
  const [adaptedCV, setAdaptedCV] = useState("");
  const [coverLetter, setCoverLetter] = useState("");

  const canRun = useMemo(() => cvText.trim().length > 0 && jobText.trim().length > 0, [cvText, jobText]);

  const prompt = useMemo(() => {
    const v = clamp(Number(volume) || 5, 1, 9);
    return `You are an ATS-aware resume rewriter and recruiter-grade evaluator.
Language: Hebrew (use professional, clear style). If a block was provided in English, you may keep it in English. Otherwise Hebrew.

TASKS (return JSON):
1) ANALYZE the candidate CV vs the job posting. Output a JSON object key "analysis" with the following exact keys:
   - match_score: number (0-100)
   - strengths: string[]
   - gaps: string[]
   - recommendations: string[]
2) GENERATE drafts based on the allowed rewrite freedom level (1=only synonyms, 9=free creative tailoring):
   - adapted_cv: a full adapted CV text ready to paste (markdown ok). Do not invent facts; you may rephrase and reorder. If facts are missing, propose realistic placeholders in brackets [ ] without asserting they are real.
   - cover_letter: a short, role-specific cover letter (120-220 words) in Hebrew unless job is clearly in English.

Constraints:
- DO NOT wrap the final response in prose; return ONE top-level JSON object with keys: analysis, adapted_cv, cover_letter.
- Be strict about JSON validity.
- Rewrite freedom level: ${v} of 9.

INPUT JOB POSTING:\n${jobText}\n\nINPUT CV:\n${cvText}`;
  }, [cvText, jobText, volume]);

  const runLLM = useCallback(async () => {
    if (!canRun) return;
    setLoading(true);
    setError("");

    try {
      const res = await InvokeLLM({
        model,
        prompt,
        // You can pass temperature/other params within InvokeLLM if supported
      });

      // res may be string or object { content }
      const raw = res?.content ?? res;
      const parsed = safeParseJSON(raw);

      if (!parsed) throw new Error("המודל החזיר פלט לא תקין (לא JSON תקין)");

      const a = parsed.analysis ?? {};
      setMatchScore(Number(a.match_score) || 0);
      setStrengths(toLines(a.strengths));
      setGaps(toLines(a.gaps));
      setRecommendations(toLines(a.recommendations));

      setAdaptedCV(parsed.adapted_cv || "");
      setCoverLetter(parsed.cover_letter || "");
    } catch (e) {
      console.error(e);
      setError(e?.message || "כשל בעיבוד הפלט מהמודל");
    } finally {
      setLoading(false);
    }
  }, [canRun, model, prompt]);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">התאמת קורות חיים למשרה</h1>
          <p className="text-sm text-gray-600">הדבק משרה וקורות חיים, בחר רמת חופש (Volume), וקבל ניתוח + טיוטות מוכנות.</p>
        </div>
        <div className="flex gap-3 items-end">
          <div className="text-sm">
            <label className="block mb-1">מודל</label>
            <select value={model} onChange={e=>setModel(e.target.value)} className="border rounded-lg px-2 py-1">
              <option value="gpt-4o-mini">GPT‑4o mini</option>
              <option value="gpt-4.1-mini">GPT‑4.1 mini</option>
              <option value="claude-3-haiku">Claude 3 Haiku (proxy)</option>
              <option value="gemini-1.5-flash">Gemini 1.5 Flash (proxy)</option>
            </select>
          </div>
          <div className="text-sm">
            <label className="block mb-1">Volume (1–9)</label>
            <input type="range" min={1} max={9} value={volume} onChange={e=>setVolume(Number(e.target.value))} className="w-40" />
            <div className="text-right text-xs text-gray-600">{volume}</div>
          </div>
          <button
            onClick={runLLM}
            disabled={!canRun || loading}
            className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
          >
            {loading ? "מייצר…" : "נתח והפק טיוטות"}
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col">
          <label className="mb-2 text-sm font-medium">מודעת הדרושים</label>
          <textarea
            value={jobText}
            onChange={(e) => setJobText(e.target.value)}
            placeholder="הדבק כאן את טקסט המשרה…"
            className="min-h-[180px] border rounded-xl p-3"
          />
        </div>
        <div className="flex flex-col">
          <label className="mb-2 text-sm font-medium">קורות חיים (קלט)</label>
          <textarea
            value={cvText}
            onChange={(e) => setCvText(e.target.value)}
            placeholder="הדבק כאן את קורות החיים הגולמיים…"
            className="min-h-[180px] border rounded-xl p-3"
          />
        </div>
      </section>

      {error && (
        <div className="p-3 rounded-xl border border-red-300 bg-red-50 text-red-800 text-sm">{error}</div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        <div className="md:col-span-1 border rounded-2xl p-4 space-y-4">
          <MatchIndicator score={matchScore} />
          <div>
            <h3 className="font-medium mb-1">חוזקות</h3>
            <ul className="list-disc ps-5 space-y-1 text-sm">
              {strengths.length ? strengths.map((s,i)=>(<li key={i}>{s}</li>)) : <li className="text-gray-500">—</li>}
            </ul>
          </div>
          <div>
            <h3 className="font-medium mb-1">פערים</h3>
            <ul className="list-disc ps-5 space-y-1 text-sm">
              {gaps.length ? gaps.map((s,i)=>(<li key={i}>{s}</li>)) : <li className="text-gray-500">—</li>}
            </ul>
          </div>
          <div>
            <h3 className="font-medium mb-1">המלצות</h3>
            <ul className="list-disc ps-5 space-y-1 text-sm">
              {recommendations.length ? recommendations.map((s,i)=>(<li key={i}>{s}</li>)) : <li className="text-gray-500">—</li>}
            </ul>
          </div>
        </div>

        {/* Bottom two boxes: readable text */}
        <div className="md:col-span-1 border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">קורות חיים מותאמים</h3>
            <CopyButton text={adaptedCV} />
          </div>
          <pre className="whitespace-pre-wrap text-sm leading-6">{adaptedCV || "—"}</pre>
        </div>

        <div className="md:col-span-1 border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">מכתב מקדים</h3>
            <CopyButton text={coverLetter} />
          </div>
          <pre className="whitespace-pre-wrap text-sm leading-6">{coverLetter || "—"}</pre>
        </div>
      </section>

      <footer className="text-xs text-gray-500 pt-4">
        טיפ: אם אתה רואה שוב JSON גולמי, כנראה שהמודל לא שמר על פורמט — הרץ שוב או החלף מודל. אפשר גם להקשיח ולבדוק שהתגובה מכילה מפתחות analysis/adapted_cv/cover_letter לפני עיבוד.
      </footer>
    </div>
  );
}
