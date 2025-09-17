// pages/cv-matcher.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

// טוען את מדדי הציון ללא SSR כדי למנוע שגיאות בבילד
const ScoreMeters = dynamic(() => import("../components/ScoreMeters"), {
  ssr: false,
});

// ===== עזר: המרת ציון ל-0..100 =====
function toPct(x) {
  if (x == null || isNaN(Number(x))) return 0;
  const n = Number(x);
  // אם זה כבר בטווח 0..100 נחזיר כפי שהוא; אם בטווח 0..1 נמיר.
  if (n <= 1 && n >= 0) return Math.round(n * 100);
  return Math.round(Math.max(0, Math.min(100, n)));
}

// ניסיון לחלץ ציונים מהתגובה (תמיכה בכמה סכימות)
function extractScores(payload) {
  const fallback = {
    keywords: 0,
    requirements: 0,
    match: 0,
    experience: 0,
    skills: 0,
  };

  if (!payload || typeof payload !== "object") return fallback;

  // אופציה 1: payload.scores = { keywords, requirements, match, experience, skills }
  if (payload.scores && typeof payload.scores === "object") {
    const s = payload.scores;
    return {
      keywords: toPct(s.keywords),
      requirements: toPct(s.requirements),
      match: toPct(s.match),
      experience: toPct(s.experience),
      skills: toPct(s.skills),
    };
  }

  // אופציה 2: payload.ats?.scores או payload.ats_scores
  const ats = payload.ats?.scores || payload.ats_scores;
  if (ats && typeof ats === "object") {
    return {
      keywords: toPct(ats.keywords ?? ats.kw),
      requirements: toPct(ats.requirements ?? ats.reqs),
      match: toPct(ats.match ?? ats.overall),
      experience: toPct(ats.experience ?? ats.exp),
      skills: toPct(ats.skills ?? ats.skill),
    };
  }

  // אופציה 3: שדות מפוזרים ישירות על האובייקט
  return {
    keywords: toPct(payload.keywords),
    requirements: toPct(payload.requirements),
    match: toPct(payload.match),
    experience: toPct(payload.experience),
    skills: toPct(payload.skills),
  };
}

// ערכי ברירת מחדל
const DEFAULT_SCORES = {
  keywords: 0,
  requirements: 0,
  match: 0,
  experience: 0,
  skills: 0,
};

const ROLE_PRESETS = [
  "Copywriter",
  "Project Manager",
  "Sales",
  "Marketing",
  "Product Manager",
];

export default function CvMatcherPage() {
  // קלטים ראשיים
  const [job, setJob] = useState("");
  const [cv, setCv] = useState("");

  // שליטה
  const [rolePreset, setRolePreset] = useState(ROLE_PRESETS[0]);
  const [slider, setSlider] = useState(5); // 1..9
  const [model, setModel] = useState("ChatGPT (OpenAI)");
  const [target, setTarget] = useState("All");

  // תוצאה
  const [scores, setScores] = useState(DEFAULT_SCORES);
  const [coverLetter, setCoverLetter] = useState("");
  const [tailoredCv, setTailoredCv] = useState("");

  // מצב ריצה
  const [loading, setLoading] = useState(false);
  const runIndexRef = useRef(0);

  // שחזור/שמירה מקומית — תמיד בתוך useEffect כדי להימנע משגיאות SSR
  useEffect(() => {
    try {
      const savedJob = localStorage.getItem("cvMatcher_job");
      const savedCv = localStorage.getItem("cvMatcher_cv");
      if (savedJob) setJob(savedJob);
      if (savedCv) setCv(savedCv);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("cvMatcher_job", job || "");
    } catch {}
  }, [job]);
  useEffect(() => {
    try {
      localStorage.setItem("cvMatcher_cv", cv || "");
    } catch {}
  }, [cv]);

  const canRun = useMemo(() => !!job.trim() && !!cv.trim(), [job, cv]);

  async function handleRun() {
    if (!canRun || loading) return;
    setLoading(true);
    setCoverLetter("");
    setTailoredCv("");

    try {
      runIndexRef.current += 1;
      // יצירת טמפרטורה קלה מתוך הסליידר (1..9 -> 0.0..1.0)
      const temperature = Math.max(
        0,
        Math.min(1, (Number(slider) - 1) / 8 || 0.2)
      );

      const body = {
        job_description: job.slice(0, 50000),
        cv_text: cv.slice(0, 50000),
        role_preset: rolePreset,
        slider,
        run_index: runIndexRef.current,
        temperature,
        model_pref: "chatgpt",
        target: target.toLowerCase(), // "all" | "cover" | "cv"
      };

      const res = await fetch("/api/openai-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`API error ${res.status}`);
      }

      const payload = await res.json();

      // ציונים
      const s = extractScores(payload);
      setScores(s);

      // טקסטים
      setCoverLetter(
        payload.cover_letter ||
          payload.coverLetter ||
          payload.cover ||
          payload.outputs?.cover ||
          ""
      );
      setTailoredCv(
        payload.tailored_cv ||
          payload.tailoredCV ||
          payload.cv_tailored ||
          payload.outputs?.cv ||
          ""
      );
    } catch (err) {
      console.error(err);
      // במקרה שגיאה, נשאיר מטרים על 0 ונציג הודעה בסיסית
      alert("Run failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-4">CV Matcher</h1>

      {/* שני אזורי טקסט: מודעת עבודה + קו״ח */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-xl shadow border bg-white p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Job Description</h2>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 text-sm rounded border"
                onClick={() => setJob("")}
              >
                Clear
              </button>
            </div>
          </div>
          <textarea
            className="w-full h-64 border rounded p-3 text-sm"
            placeholder="Paste the job ad here…"
            value={job}
            onChange={(e) => setJob(e.target.value)}
          />
          <div className="mt-2 text-xs text-gray-500">
            * Upload: PDF/DOCX/TXT (10MB) • URL proxy via /api/fetch-url.
          </div>
        </section>

        <section className="rounded-xl shadow border bg-white p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Your CV</h2>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 text-sm rounded border"
                onClick={() => setCv("")}
              >
                Clear
              </button>
            </div>
          </div>
          <textarea
            className="w-full h-64 border rounded p-3 text-sm"
            placeholder="Paste your CV text here…"
            value={cv}
            onChange={(e) => setCv(e.target.value)}
          />
          <div className="mt-2 text-xs text-gray-500">
            * Saved locally (localStorage).
          </div>
        </section>
      </div>

      {/* מדדי ציון */}
      <div className="mt-6">
        <ScoreMeters
          keywords={scores.keywords}
          requirements={scores.requirements}
          match={scores.match}
          experience={scores.experience}
          skills={scores.skills}
        />
      </div>

      {/* Controls + Assistant */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <section className="rounded-xl shadow border bg-white p-4">
          <h3 className="text-lg font-semibold mb-3">Controls</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Role preset */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Role Preset</div>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={rolePreset}
                onChange={(e) => setRolePreset(e.target.value)}
              >
                {ROLE_PRESETS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-gray-400 mt-1">
                Min: 0.4 | Max: 0.9 | Step: 0.1
              </div>
            </div>

            {/* Slider (1..9) */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Creativity (1..9)</div>
              <input
                type="range"
                min={1}
                max={9}
                step={1}
                value={slider}
                onChange={(e) => setSlider(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-[11px] text-gray-500 mt-1">Value: {slider}</div>
            </div>

            {/* Model */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Model</div>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                <option>ChatGPT (OpenAI)</option>
                <option>Gemini</option>
                <option>Claude</option>
              </select>
            </div>

            {/* Target */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Target</div>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option>All</option>
                <option>Cover</option>
                <option>CV</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-xs text-gray-400">
              Server via <code>/api/openai-match</code>. URL proxy via{" "}
              <code>/api/fetch-url</code>. Chat via <code>/api/openai-chat</code>.
            </div>
            <button
              className={`px-4 py-2 rounded-lg text-white ${
                canRun && !loading ? "bg-black hover:bg-gray-800" : "bg-gray-400"
              }`}
              disabled={!canRun || loading}
              onClick={handleRun}
            >
              {loading ? "Running…" : "Run"}
            </button>
          </div>
        </section>

        <section className="rounded-xl shadow border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Live Assistant</h3>
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded border text-sm">
                Apply to Cover Letter
              </button>
              <button className="px-3 py-1 rounded border text-sm">
                Apply to Tailored CV
              </button>
            </div>
          </div>

          <div className="border rounded p-3 h-40 text-sm overflow-auto bg-gray-50">
            <ul className="list-disc pr-4">
              <li>הוסף ביטויי מפתח רלוונטיים ולשים דגש על הישגים מדידים.</li>
              <li>העדף bullets קצרים ותמציתיים.</li>
              <li>התאם סקשנים לכותרות שבמודעת הדרושים.</li>
            </ul>
          </div>

          <div className="mt-3 flex gap-2">
            <input
              className="flex-1 border rounded px-3 py-2 text-sm"
              placeholder="הודעה לעוזר…"
            />
            <button className="px-4 py-2 rounded-lg border">Send</button>
          </div>
        </section>
      </div>

      {/* תוצאות טקסטואליות */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <section className="rounded-xl shadow border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Cover Letter</h3>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded border text-sm"
                onClick={() => navigator.clipboard?.writeText(coverLetter || "")}
              >
                Copy
              </button>
              <button className="px-3 py-1 rounded border text-sm">
                Export DOCX
              </button>
            </div>
          </div>
          <textarea
            className="w-full h-56 border rounded p-3 text-sm"
            value={coverLetter}
            onChange={(e) => setCoverLetter(e.target.value)}
            placeholder="Cover letter will appear here…"
          />
        </section>

        <section className="rounded-xl shadow border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Tailored CV</h3>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded border text-sm"
                onClick={() => navigator.clipboard?.writeText(tailoredCv || "")}
              >
                Copy
              </button>
              <button className="px-3 py-1 rounded border text-sm">
                Export DOCX
              </button>
            </div>
          </div>
          <textarea
            className="w-full h-56 border rounded p-3 text-sm whitespace-pre-wrap"
            value={tailoredCv}
            onChange={(e) => setTailoredCv(e.target.value)}
            placeholder="Tailored CV will appear here…"
          />
        </section>
      </div>
    </div>
  );
}

// מאלץ SSR כדי למנוע Pre-render סטטי (שגרם ל־React #130 בלוגים)
export async function getServerSideProps() {
  return { props: {} };
}
