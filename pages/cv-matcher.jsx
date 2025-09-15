// pages/cv-matcher.jsx
import { useEffect, useMemo, useState } from "react";

const LS_KEYS = {
  cv: "cvMagic.cvText",
  slider: "cvMagic.creativitySlider",
  role: "cvMagic.rolePreset",
  runIdx: "cvMagic.runIndex",
};

const ROLE_PRESETS = {
  Surgeon: { min: 0.1, max: 0.4, step: 0.05 },
  Accountant: { min: 0.15, max: 0.45, step: 0.05 },
  "Product Manager": { min: 0.3, max: 0.7, step: 0.07 },
  Copywriter: { min: 0.4, max: 0.9, step: 0.1 },
};

const defaultRole = "Surgeon";

// ---------- helpers ----------
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
function computeTemp(slider /*1..9*/, rolePreset, runIndex) {
  const base01 = (Number(slider) - 1) / 8; // 0..1
  const tBase = lerp(rolePreset.min, rolePreset.max, clamp01(base01));
  return Math.min(rolePreset.max, tBase + (runIndex || 0) * rolePreset.step);
}
function scoreColor(p) {
  if (p < 50) return "#ef4444"; // red-500
  if (p < 75) return "#f59e0b"; // amber-500
  return "#22c55e"; // green-500
}

// ---------- ring gauge ----------
function RingGauge({ label, value = 0, size = 150, stroke = 14, onClick, title }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(value || 0)));
  const dash = (pct / 100) * c;
  const color = scoreColor(pct);
  return (
    <button
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      onClick={onClick}
      title={title}
      type="button"
    >
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-semibold">{pct}%</div>
        <div className="text-xs text-gray-600">{label}</div>
      </div>
    </button>
  );
}

// ---------- copy helper ----------
async function copyText(txt) {
  try {
    await navigator.clipboard.writeText(txt || "");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = txt || "";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

export default function CVMatcher() {
  // top inputs
  const [job, setJob] = useState("");
  const [cv, setCv] = useState("");

  // console scores
  const [scores, setScores] = useState({
    match: 0,
    keywords: 0,
    reqcov: 0,
    experience: 0,
    skills: 0,
  });

  // bottom outputs
  const [cover, setCover] = useState("");
  const [tailored, setTailored] = useState("");

  // controls
  const [slider, setSlider] = useState(3); // 1..9
  const [role, setRole] = useState(defaultRole);
  const [runIndex, setRunIndex] = useState(0);
  const [modelCL, setModelCL] = useState("chatgpt");
  const [modelCV, setModelCV] = useState("chatgpt");
  const [isRunning, setIsRunning] = useState(false);

  // persistence: CV, slider, role, runIndex
  useEffect(() => {
    try {
      const cv0 = localStorage.getItem(LS_KEYS.cv);
      const s0 = localStorage.getItem(LS_KEYS.slider);
      const r0 = localStorage.getItem(LS_KEYS.role);
      const i0 = localStorage.getItem(LS_KEYS.runIdx);
      if (cv0) setCv(cv0);
      if (s0) setSlider(Number(s0));
      if (r0 && ROLE_PRESETS[r0]) setRole(r0);
      if (i0) setRunIndex(Number(i0));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.cv, cv || "");
      localStorage.setItem(LS_KEYS.slider, String(slider));
      localStorage.setItem(LS_KEYS.role, role);
      localStorage.setItem(LS_KEYS.runIdx, String(runIndex));
    } catch {}
  }, [cv, slider, role, runIndex]);

  // temperature for current settings
  const temp = useMemo(() => computeTemp(slider, ROLE_PRESETS[role], runIndex), [slider, role, runIndex]);

  // main run
  async function runOnce(target = "all", modelPref = "chatgpt") {
    if (!job || !cv) {
      alert("Paste both Job Description and Your CV.");
      return;
    }
    setIsRunning(true);
    try {
      const body = {
        job_description: job,
        cv_text: cv,
        role_preset: ROLE_PRESETS[role],
        slider: Number(slider),
        run_index: Number(runIndex),
        temperature: temp,
        model_pref: modelPref, // "chatgpt" | "gemini" | "claude"
        target, // "all" | "cover" | "cv"
      };
      const res = await fetch("/api/openai-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data?.error) throw new Error(data.error);

      if (data.scores) {
        setScores({
          match: data.scores.match_score ?? 0,
          keywords: data.scores.keywords ?? 0,
          reqcov: data.scores.requirements_coverage ?? 0,
          experience: data.scores.experience ?? 0,
          skills: data.scores.skills ?? 0,
        });
      }
      if (data.tailored_cv) setTailored(data.tailored_cv);
      if (data.cover_letter) setCover(data.cover_letter);

      setRunIndex((x) => x + 1);
    } catch (e) {
      console.error(e);
      alert("Run failed. See console.");
    } finally {
      setIsRunning(false);
    }
  }

  // UI
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-6xl p-6 space-y-6">
        {/* Top row: Job + CV */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Job Description card (WITH Clear button) */}
          <div className="bg-white rounded-xl shadow p-4">
            <div className="font-semibold mb-2">Job Description</div>
            <textarea
              className="w-full h-48 resize-vertical rounded-md border border-gray-300 p-2 outline-none focus:ring"
              placeholder="Paste the job ad here…"
              value={job}
              onChange={(e) => setJob(e.target.value)}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-gray-500">Clears on refresh/exit</span>
              <button
                type="button"
                className="px-3 py-1 text-sm rounded-md border bg-gray-50 hover:bg-gray-100"
                onClick={() => setJob("")}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Your CV card (persists) */}
          <div className="bg-white rounded-xl shadow p-4">
            <div className="font-semibold mb-2">Your CV</div>
            <textarea
              className="w-full h-48 resize-vertical rounded-md border border-gray-300 p-2 outline-none focus:ring"
              placeholder="Paste your CV here… (persists locally)"
              value={cv}
              onChange={(e) => setCv(e.target.value)}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-gray-500">Saved locally</span>
              <button
                type="button"
                className="px-3 py-1 text-sm rounded-md border bg-gray-50 hover:bg-gray-100"
                onClick={() => setCv("")}
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Middle: ATS console */}
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="text-lg font-semibold">ATS Console</div>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-sm text-gray-600">Role Strictness</label>
              <select
                className="rounded-md border p-1 text-sm"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setRunIndex(0);
                }}
              >
                {Object.keys(ROLE_PRESETS).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <div
                className="text-sm text-gray-500"
                title={`min=${ROLE_PRESETS[role].min.toFixed(2)}, max=${ROLE_PRESETS[role].max.toFixed(
                  2
                )}, step=${ROLE_PRESETS[role].step.toFixed(2)}`}
              >
                temp ≈ {temp.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-4 items-center justify-items-center">
            {/* left */}
            <RingGauge
              label="Keywords"
              value={scores.keywords}
              size={120}
              title="Alignment with job ad terminology"
              onClick={() => alert("Keywords tips…")}
            />
            <RingGauge
              label="Requirements Coverage"
              value={scores.reqcov}
              size={120}
              title="Coverage of must-have vs nice-to-have"
              onClick={() => alert("Requirements tips…")}
            />

            {/* center */}
            <RingGauge
              label="Match Score"
              value={scores.match}
              size={180}
              title="Overall fit for the job (click to re-run)"
              onClick={() => runOnce("all", "chatgpt")}
            />

            {/* right */}
            <RingGauge
              label="Experience"
              value={scores.experience}
              size={120}
              title="Years and recency match"
              onClick={() => alert("Experience tips…")}
            />
            <RingGauge
              label="Skills"
              value={scores.skills}
              size={120}
              title="Percentage of required skills present"
              onClick={() => alert("Skills tips…")}
            />
          </div>

          {/* Slider */}
          <div className="mt-6">
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium">Creativity</div>
              <input
                type="range"
                min={1}
                max={9}
                value={slider}
                onChange={(e) => {
                  setSlider(Number(e.target.value));
                  setRunIndex(0);
                }}
                className="flex-1"
                aria-label="Creativity"
              />
              <div className="w-10 text-right text-sm text-gray-600">{slider}</div>
              <button
                type="button"
                className="px-3 py-1 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                disabled={isRunning}
                onClick={() => runOnce("all", "chatgpt")}
                title="Re-run all (center ring action)"
              >
                {isRunning ? "Running…" : "Run"}
              </button>
            </div>
          </div>
        </div>

        {/* Bottom row: outputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Cover Letter */}
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Cover Letter</div>
              <div className="flex items-center gap-2">
                <select
                  className="rounded-md border p-1 text-sm"
                  value={modelCL}
                  onChange={(e) => setModelCL(e.target.value)}
                  title="Choose AI model"
                >
                  <option value="chatgpt">ChatGPT</option>
                  <option value="gemini">Gemini</option>
                  <option value="claude">Claude</option>
                </select>
                <button
                  type="button"
                  className="px-3 py-1 text-sm rounded-md border bg-gray-50 hover:bg-gray-100"
                  onClick={() => copyText(cover)}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="px-3 py-1 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  disabled={isRunning}
                  onClick={() => runOnce("cover", modelCL)}
                >
                  {isRunning ? "…" : "Re-run with AI"}
                </button>
              </div>
            </div>
            <textarea
              className="w-full h-44 rounded-md border border-gray-300 p-2 resize-vertical"
              placeholder="Generated cover letter will appear here…"
              value={cover}
              onChange={(e) => setCover(e.target.value)}
            />
          </div>

          {/* Tailored CV */}
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Tailored CV</div>
              <div className="flex items-center gap-2">
                <select
                  className="rounded-md border p-1 text-sm"
                  value={modelCV}
                  onChange={(e) => setModelCV(e.target.value)}
                  title="Choose AI model"
                >
                  <option value="chatgpt">ChatGPT</option>
                  <option value="gemini">Gemini</option>
                  <option value="claude">Claude</option>
                </select>
                <button
                  type="button"
                  className="px-3 py-1 text-sm rounded-md border bg-gray-50 hover:bg-gray-100"
                  onClick={() => copyText(tailored)}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="px-3 py-1 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  disabled={isRunning}
                  onClick={() => runOnce("cv", modelCV)}
                >
                  {isRunning ? "…" : "Re-run with AI"}
                </button>
              </div>
            </div>
            <textarea
              className="w-full h-44 rounded-md border border-gray-300 p-2 resize-vertical"
              placeholder="Generated tailored CV will appear here…"
              value={tailored}
              onChange={(e) => setTailored(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
