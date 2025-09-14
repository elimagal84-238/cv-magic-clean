import React, { useMemo, useState } from "react";

/**
 * CV-Magic — page rebuild (LTR layout)
 * - Main headings in EN, subheadings & UI labels in HE
 * - Keep page LTR to avoid bidi issues; use dir="auto" only on free-text areas
 * - Central score console: big ring + 3 small rings
 * - Notes in collapsible section
 * - Compact action card: model select + Volume + Run / Double‑Check
 */

// Models (edit if you load from elsewhere)
const MODELS = [
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
];

// ===== Rings =====
function Ring({ value = 0, size = 120, stroke = 10, label, sublabel, colorOverride }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const offset = circumference * (1 - v / 100);
  const color = colorOverride || (v >= 85 ? "#22c55e" : v >= 60 ? "#f59e0b" : "#ef4444");
  return (
    <div className="flex flex-col items-center justify-center">
      <svg width={size} height={size} className="block">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" className="font-semibold" style={{ fontSize: size * 0.26 }} fill="#0f172a">
          {Math.round(v)}
        </text>
      </svg>
      {label && <div className="mt-1 text-sm font-medium text-gray-800">{label}</div>}
      {sublabel && <div className="text-xs text-gray-500 -mt-0.5">{sublabel}</div>}
    </div>
  );
}
function SmallRing({ value, label }) {
  return (
    <div className="flex flex-col items-center">
      <Ring value={value} size={78} stroke={8} colorOverride="#f59e0b" />
      <div className="mt-1 text-xs text-gray-600">{label}</div>
    </div>
  );
}

export default function CVMatcher() {
  // Inputs
  const [jobText, setJobText] = useState("");
  const [cvText, setCvText] = useState("");

  // Controls
  const [model, setModel] = useState(MODELS[0].id);
  const [volume, setVolume] = useState(5); // 1..9
  const temperature = 0.5; // fixed & hidden

  // Outputs
  const [score, setScore] = useState(0);
  const [subscores, setSubscores] = useState({ skills: 0, experience: 0, keywords: 0 });
  const [strengths, setStrengths] = useState([]);
  const [gaps, setGaps] = useState([]);
  const [recs, setRecs] = useState([]);
  const [adjustedCV, setAdjustedCV] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [runs, setRuns] = useState(0);
  const [loading, setLoading] = useState(false);

  const scoreLabel = useMemo(() => {
    if (score >= 85) return "התאמה מצוינת";
    if (score >= 60) return "התאמה טובה";
    if (score > 0) return "התאמה נמוכה";
    return "";
  }, [score]);

  // Actions
  async function onRun() {
    setLoading(true);
    try {
      const res = await fakeApi(jobText, cvText, model, volume, temperature);
      setScore(res.score ?? 0);
      setSubscores(res.subscores ?? { skills: 0, experience: 0, keywords: 0 });
      setStrengths(res.strengths ?? []);
      setGaps(res.gaps ?? []);
      setRecs(res.recommendations ?? []);
      setAdjustedCV(res.adjustedCV ?? "");
      setCoverLetter(res.coverLetter ?? "");
      setRuns((r) => r + 1);
    } finally {
      setLoading(false);
    }
  }
  async function onDoubleCheck() {
    setLoading(true);
    try {
      const res = await fakeDouble(adjustedCV, jobText, model);
      setAdjustedCV(res.adjustedCV ?? adjustedCV);
      setScore(res.score ?? score);
      setSubscores(res.subscores ?? subscores);
    } finally { setLoading(false); }
  }
  function copy(text) {
    if (!text) return; navigator.clipboard.writeText(text);
  }

  // ===== UI =====
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      {/* Main headings: EN title + HE subtitle */}
      <header className="text-center space-y-1">
        <h1 className="text-3xl font-bold">CV-Magic</h1>
        <p className="text-sm text-gray-600">קורות חיים מותאמים בשנייה - שליחת קורות חיים מותאמים</p>
      </header>

      {/* Inputs */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h2 className="text-base font-medium text-center mb-2">דרישות המשרה</h2>
          <textarea
            dir="auto"
            value={jobText}
            onChange={(e) => setJobText(e.target.value)}
            placeholder="הדבק כאן את מודעת הדרושים"
            className="w-full h-48 resize-y rounded-xl border border-gray-200 p-3 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h2 className="text-base font-medium text-center mb-2">קורות החיים שלך</h2>
          <textarea
            dir="auto"
            value={cvText}
            onChange={(e) => setCvText(e.target.value)}
            placeholder="הדבק כאן את קו״ח שלך"
            className="w-full h-48 resize-y rounded-xl border border-gray-200 p-3 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
      </section>

      {/* Central console + compact action card */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Central console */}
        <div className="bg-white rounded-2xl shadow-sm p-6 col-span-1 lg:col-span-2">
          <h3 className="text-lg font-medium mb-4 text-center">ציון התאמה</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="md:col-span-1 flex justify-center">
              <Ring value={score} size={160} stroke={12} label={scoreLabel} />
            </div>
            <div className="md:col-span-2">
              <div className="grid grid-cols-3 gap-6">
                <SmallRing value={subscores.skills} label="כישורים" />
                <SmallRing value={subscores.experience} label="ניסיון" />
                <SmallRing value={subscores.keywords} label="מילות מפתח" />
              </div>
              {/* Notes */}
              <details className="mt-6 group">
                <summary className="cursor-pointer list-none select-none flex items-center gap-2 text-sm font-medium text-gray-800">
                  <span>הערות והארות נוספות</span>
                  <svg className="h-4 w-4 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.585l3.71-3.354a.75.75 0 011.04 1.08l-4.24 3.83a.75.75 0 01-1.04 0l-4.24-3.83a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
                </summary>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <ul className="bg-gray-50 rounded-xl p-3 text-sm leading-6">
                    <div className="font-semibold mb-2">חוזקות</div>
                    {strengths?.length ? strengths.map((s, i) => (
                      <li key={i} className="list-disc ml-5">{s}</li>
                    )) : <li className="text-gray-500">—</li>}
                  </ul>
                  <ul className="bg-gray-50 rounded-xl p-3 text-sm leading-6">
                    <div className="font-semibold mb-2">פערים</div>
                    {gaps?.length ? gaps.map((s, i) => (
                      <li key={i} className="list-disc ml-5">{s}</li>
                    )) : <li className="text-gray-500">—</li>}
                  </ul>
                  <ul className="bg-gray-50 rounded-xl p-3 text-sm leading-6">
                    <div className="font-semibold mb-2">המלצות</div>
                    {recs?.length ? recs.map((s, i) => (
                      <li key={i} className="list-disc ml-5">{s}</li>
                    )) : <li className="text-gray-500">—</li>}
                  </ul>
                </div>
              </details>
            </div>
          </div>
        </div>

        {/* Action card */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <h3 className="text-lg font-medium text-center">הפק קורות חיים מותאמים</h3>
          <div className="space-y-3">
            <label className="block text-sm text-gray-700">מודל AI</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-xl border border-gray-200 p-2.5 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-700">דרגת חופש</label>
              <span className="text-xs text-gray-500">{volume} / 9</span>
            </div>
            <div className="px-1">
              <input type="range" min={1} max={9} step={1} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-full accent-black" />
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                {Array.from({ length: 9 }).map((_, i) => <span key={i}>{i + 1}</span>)}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button onClick={onRun} disabled={loading} className="rounded-xl px-4 py-2 bg-black text-white text-sm font-medium disabled:opacity-60">הרצה (ניתוח + טיוב)</button>
            <button onClick={onDoubleCheck} disabled={loading || !adjustedCV} className="rounded-xl px-4 py-2 border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Double‑Check</button>
          </div>
          <div className="text-xs text-gray-500">Runs: {runs}</div>
        </div>
      </section>

      {/* Outputs */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-medium">מכתב מקדים</h3>
            <button onClick={() => copy(coverLetter)} className="text-xs underline">העתק</button>
          </div>
          <pre dir="auto" className="whitespace-pre-wrap text-sm leading-6 text-gray-800">{coverLetter || "—"}</pre>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-medium">קורות חיים מותאמים</h3>
            <button onClick={() => copy(adjustedCV)} className="text-xs underline">העתק</button>
          </div>
          <pre dir="auto" className="whitespace-pre-wrap text-sm leading-6 text-gray-800">{adjustedCV || "—"}</pre>
        </div>
      </section>
    </div>
  );
}

// ===== Temporary mocks (remove when connected to backend) =====
async function fakeApi(jobText, cvText, model, volume, temperature) {
  await new Promise((r) => setTimeout(r, 400));
  const base = 60 + Math.min(30, ((jobText.length + cvText.length + volume * 7) % 41));
  const score = Math.min(100, Math.round(base));
  return {
    score,
    subscores: {
      skills: Math.max(0, score - 11),
      experience: Math.max(0, score - 8),
      keywords: Math.max(0, score - 5),
    },
    strengths: ["ניהול צוותים", "שירותיות גבוהה", "התאמה לדינמיקה ארגונית"],
    gaps: ["חסר פירוט KPI בפרויקטים אחרונים"],
    recommendations: ["להוסיף תוצאות כמותיות (מדדים) לכל תפקיד"],
    adjustedCV: `
סיכום מקצועי
—
${cvText.slice(0, 220)}...`,
    coverLetter: `שלום, מצרף/ת קורות חיים למשרתכם. להתרשמותכם, ציון התאמה כולל ${score}%.`,
  };
}
async function fakeDouble(adjustedCV, jobText, model) {
  await new Promise((r) => setTimeout(r, 300));
  const bump = Math.min(5, Math.round((adjustedCV.length + jobText.length) % 6));
  const score = Math.min(100, 82 + bump);
  return {
    score,
    subscores: { skills: score - 10, experience: score - 7, keywords: score - 4 },
    adjustedCV: `${adjustedCV}\n\n[בוצעו התאמות נוספות קלות]`,
  };
}
