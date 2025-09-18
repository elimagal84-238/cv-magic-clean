// pages/cv-matcher.jsx
// CV-Magic — Matcher UI (Hybrid: LLM + deterministic)

import { useEffect, useRef, useState } from "react";

/* ---------- Polyfills (older browsers) ---------- */
if (typeof Promise !== "undefined" && !Promise.withResolvers) {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

/* ---------- constants & utils ---------- */
const LS = {
  cv: "cvMagic.cvText",
  jd: "cvMagic.jdText",
  cvHist: "cvMagic.cvHist",
  jdHist: "cvMagic.jdHist",
  slider: "cvMagic.creativitySlider",
  role: "cvMagic.rolePresetKey",
  runIdx: "cvMagic.runIndex",
};

const ROLE_PRESETS = {
  Surgeon: { label: "Surgeon", min: 0.1, max: 0.4, step: 0.05 },
  Accountant: { label: "Accountant", min: 0.15, max: 0.45, step: 0.05 },
  "Product Manager": { label: "Product Manager", min: 0.3, max: 0.7, step: 0.07 },
  Copywriter: { label: "Copywriter", min: 0.4, max: 0.9, step: 0.1 },
};

const FILE_SIZE_LIMIT_MB = 10;
const ACCEPT_MIME =
  ".pdf,.docx,.txt,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const clamp100 = (x) => {
  const n = typeof x === "string" ? parseFloat(String(x).replace(/[^\d.-]/g, "")) : Number(x);
  const v = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(v)));
};
const scoreColor = (p) => (p >= 67 ? "text-green-600" : p >= 34 ? "text-yellow-600" : "text-red-600");
const cn = (...xs) => xs.filter(Boolean).join(" ");
const saveLS = (k, v) => {
  try {
    localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  } catch {}
};
const loadLS = (k, d) => {
  try {
    const s = localStorage.getItem(k);
    if (!s) return d;
    return /^[{\[]/.test(s) ? JSON.parse(s) : s;
  } catch {
    return d;
  }
};
const autoDir = (s) => (/[\u0590-\u05FF]/.test(String(s || "")) ? "rtl" : "ltr");

/* ---------- clean buttons ---------- */
const btn =
  "inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 transition disabled:opacity-60";
const btnPrimaryOutline =
  "inline-flex items-center justify-center rounded-lg border border-gray-900 bg-white px-4 py-2 text-sm text-gray-900 hover:bg-gray-50 transition disabled:opacity-60";

/* ---------- toasts ---------- */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  function push(msg, type = "info", ttl = 3000) {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts, { id, msg, type }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), ttl);
  }
  function Toasts() {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm shadow-sm bg-white",
              t.type === "error" && "border-red-300 text-red-700",
              t.type === "success" && "border-green-300 text-green-700",
              t.type === "info" && "border-gray-200 text-gray-800"
            )}
          >
            {t.msg}
          </div>
        ))}
      </div>
    );
  }
  return { push, Toasts };
}

/* ---------- skeleton & overlay ---------- */
const Skeleton = ({ className = "" }) => (
  <div
    className={cn(
      "animate-pulse rounded-lg bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:200%_100%]",
      className
    )}
  />
);
const LoadingOverlay = ({ show, label = "Working…" }) =>
  !show ? null : (
    <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-white/60 backdrop-blur-[1px]">
      <div className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />
        {label}
      </div>
    </div>
  );

/* ---------- ring gauge ---------- */
function RingGauge({ label, value = 0, size = 150, stroke = 14, loading }) {
  if (loading) return <Skeleton className="h-[150px] w-[150px]" />;

  const raw = typeof value === "string" ? parseFloat(String(value).replace(/[^\d.-]/g, "")) : Number(value);
  const pct = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 0));

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const color = scoreColor(pct);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#eee" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className={color}
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-semibold text-sm">{label}</div>
        <div className={cn("text-xl font-semibold", color)}>{pct}%</div>
      </div>
    </div>
  );
}

/* ---------- file readers ---------- */
async function readFileToText(file) {
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > FILE_SIZE_LIMIT_MB) throw new Error(`File too large (>${FILE_SIZE_LIMIT_MB}MB).`);
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "txt" || file.type.startsWith("text/")) return await file.text();

  if (ext === "pdf" || file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    await import("pdfjs-dist/build/pdf.worker.mjs");
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data }).promise;
    let text = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n\n";
    }
    return text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth/mammoth.browser.js");
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.convertToMarkdown({ arrayBuffer });
    return value;
  }
  return await file.text();
}

async function fetchUrlText(url) {
  const r = await fetch("/api/fetch-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || "fetch failed");
  return String(j.text || "");
}

/* ---------- BIG DropZone (click + drag anywhere) ---------- */
function BigDropZone({ onFile, children, hint }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) onFile(f);
  }
  function onBrowse() {
    inputRef.current?.click();
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={onBrowse}
      className={cn(
        "rounded-lg border-2 border-dashed px-3 py-3 transition-colors cursor-pointer select-none",
        over ? "border-gray-900 bg-gray-50" : "border-gray-300 bg-white"
      )}
      title={hint}
      role="button"
    >
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={ACCEPT_MIME}
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <div className="text-sm text-gray-700">{children}</div>
      <div className="text-xs text-gray-400 mt-1">Drag & drop file here, or click to browse.</div>
    </div>
  );
}

/* ---------- chat ---------- */
function LiveAssistant({ visible, jobDesc, userCV, scores, onApplyCover, onApplyCV }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [msgs]);

  useEffect(() => {
    if (!visible || msgs.length) return;
    const seed = [
      "תובנות ראשונות מה-ATS:",
      scores.skills < 40 ? "• הוסף אזכורים מפורשים למיומנויות וכלים מהמודעה." : "• המיומנויות נראות טוב.",
      scores.requirements < 50 ? "• כסה דרישות אחת-לאחת עם bullets קצרים." : "• רוב הדרישות מכוסות היטב.",
      scores.keywords < 35 ? "• שלב מילות מפתח עיקריות בניסוח טבעי." : "• מילות המפתח תואמות יפה.",
      scores.experience < 55 ? "• ציין שנות ניסיון במספרים ברורים." : "• רמת הניסיון נראית תואמת.",
    ].join("\n");
    setMsgs([{ role: "assistant", text: seed }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function send() {
    const content = input.trim();
    if (!content || busy) return;
    setMsgs((m) => [...m, { role: "user", text: content }]);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/openai-chat", {
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
      const j = await r.json();
      setMsgs((m) => [...m, { role: "assistant", text: j?.reply || "תקלה זמנית, נסה שוב." }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "שגיאת רשת. נסה שוב." }]);
    } finally {
      setBusy(false);
    }
  }

  const applyTo = (fn) => {
    const last = [...msgs].reverse().find((m) => m.role === "assistant")?.text || "";
    if (last) fn(last);
  };

  if (!visible) {
    return (
      <div className="rounded-xl shadow border bg-white p-4">
        <h3 className="font-semibold text-gray-800 mb-2">Live Assistant</h3>
        <textarea readOnly className="w-full rounded-lg border px-3 py-2 text-sm h-48 bg-gray-50" value="הצ׳אט נפתח לאחר הרצה ראשונה." />
      </div>
    );
  }
  return (
    <div className="rounded-xl shadow border bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-800">Live Assistant</h3>
        <div className="flex gap-2">
          <button className={btn} onClick={() => applyTo(onApplyCover)}>
            Apply to Cover Letter
          </button>
          <button className={btn} onClick={() => applyTo(onApplyCV)}>
            Apply to Tailored CV
          </button>
        </div>
      </div>
      <div ref={boxRef} className="border rounded-lg p-3 h-48 overflow-auto bg-gray-50">
        {msgs.map((m, i) => (
          <div key={i} className={cn("mb-2", m.role === "user" && "text-right")} dir={autoDir(m.text)}>
            <div className="inline-block px-3 py-2 rounded-lg bg-white whitespace-pre-wrap break-words text-sm">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          dir="auto"
          className="w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="כתבו הודעה…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className={btnPrimaryOutline} onClick={send} disabled={busy}>
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

/* ---------- DOCX export ---------- */
async function exportDocx(filename, title, bodyText) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
  const paras = [];
  if (title) paras.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }));
  String(bodyText || "")
    .split(/\n/)
    .forEach((line) => {
      if (!line.trim()) paras.push(new Paragraph(""));
      else if (/^\s*[•\-]\s+/.test(line)) paras.push(new Paragraph({ text: line.replace(/^\s*[•\-]\s+/, ""), bullet: { level: 0 } }));
      else paras.push(new Paragraph({ children: [new TextRun(line)] }));
    });
  const doc = new Document({ sections: [{ children: paras }] });
  const blob = await Packer.toBlob(doc);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".docx") ? filename : `${filename}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/* ---------- main ---------- */
export default function CVMatcher() {
  const { push: toast, Toasts } = useToasts();

  const [jd, setJD] = useState("");
  const [cv, setCV] = useState("");
  const [jdHist, setJdHist] = useState(loadLS(LS.jdHist, []));
  const [cvHist, setCvHist] = useState(loadLS(LS.cvHist, []));
  const maxHist = 10;

  const [roleKey, setRoleKey] = useState(loadLS(LS.role, "Product Manager"));
  const rolePreset = ROLE_PRESETS[roleKey] || ROLE_PRESETS["Product Manager"];

  const [slider, setSlider] = useState(Number(loadLS(LS.slider, 5)) || 5);
  const [runIdx, setRunIdx] = useState(Number(loadLS(LS.runIdx, 0)) || 0);
  const [model, setModel] = useState("openai"); // "openai" | "gemini" | "claude"
  const [target, setTarget] = useState("all");

  const [scores, setScores] = useState({ match: 0, keywords: 0, requirements: 0, experience: 0, skills: 0 });
  const [cover, setCover] = useState("");
  const [tailored, setTailored] = useState("");
  const [analysis, setAnalysis] = useState(null);

  const [hasRun, setHasRun] = useState(false);
  const [running, setRunning] = useState(false);
  const [gaugeSize, setGaugeSize] = useState(150);

  useEffect(() => {
    const h = () => setGaugeSize(window.innerWidth < 640 ? 120 : 150);
    h();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    const a = String(loadLS(LS.cv, "") || "");
    if (a && !cv) setCV(a);
    const b = String(loadLS(LS.jd, "") || "");
    if (b && !jd) setJD(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => saveLS(LS.cv, String(cv || "")), [cv]);
  useEffect(() => saveLS(LS.jd, String(jd || "")), [jd]);

  useEffect(() => {
    saveLS(LS.cvHist, cvHist);
    saveLS(LS.jdHist, jdHist);
  }, [cvHist, jdHist]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (cv) setCvHist((h) => [...h, cv].slice(-maxHist));
    }, 500);
    return () => clearTimeout(id);
  }, [cv]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (jd) setJdHist((h) => [...h, jd].slice(-maxHist));
    }, 500);
    return () => clearTimeout(id);
  }, [jd]);

  useEffect(() => saveLS(LS.role, roleKey), [roleKey]);
  useEffect(() => saveLS(LS.slider, slider), [slider]);

  function undo(which) {
    if (which === "jd" && jdHist.length > 1) {
      const last = jdHist[jdHist.length - 2];
      setJD(last);
      setJdHist((h) => h.slice(0, -1));
      toast("שוחזר טקסט המשרה", "info");
    }
    if (which === "cv" && cvHist.length > 1) {
      const last = cvHist[cvHist.length - 2];
      setCV(last);
      setCvHist((h) => h.slice(0, -1));
      toast("שוחזר טקסט קורות החיים", "info");
    }
  }

  // -------- RUN (Hybrid) --------
  async function run() {
    setRunning(true);
    try {
      const body = {
        job_description: jd,
        cv_text: cv,
        role_preset: rolePreset,
        slider,
        run_index: runIdx,
        model_pref: model,
        target,
      };

      // 1) LLM: טקסטים + ציונים
      const rL = await fetch("/api/openai-match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const jL = await rL.json();
      if (!rL.ok) throw new Error(jL?.error || "openai-match failed");

      // 2) דטרמיניסטי: מדדים + ניתוח להסבר
      const rD = await fetch("/api/score-match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_description: jd, cv_text: cv }),
      });
      const jD = await rD.json();
      if (!rD.ok) throw new Error(jD?.error || "score-match failed");

      // 3) מיזוג ציונים (ברירת מחדל 70% LLM + 30% rules; ניתן לכוון)
      const blend = (a, b) => clamp100(0.7 * Number(a || 0) + 0.3 * Number(b || 0));
      const nextScores = {
        match: blend(jL.match_score, jD.match_score),
        keywords: blend(jL.keywords_match, jD.keywords_match),
        requirements: blend(jL.requirements_match, jD.requirements_match),
        experience: blend(jL.experience_match, jD.experience_match),
        skills: blend(jL.skills_match, jD.skills_match),
      };

      setScores(nextScores);
      setCover(String(jL.cover_letter || ""));
      setTailored(String(jL.tailored_cv || ""));
      setAnalysis(jD.analysis || null);
      setHasRun(true);

      setRunIdx((x) => {
        const n = (Number(x || 0) + 1) % 99999;
        saveLS(LS.runIdx, n);
        return n;
      });

      toast("ההרצה הסתיימה בהצלחה", "success");
    } catch (e) {
      console.error("run() error:", e);
      toast("שגיאה בהרצה: " + (e?.message || "unknown"), "error", 5000);
    } finally {
      setRunning(false);
    }
  }

  const applyCover = (text) => setCover((t) => `${t}\n\n---\nAssistant suggestions:\n${text}`);
  const applyCV = (text) => setTailored((t) => `${t}\n\n---\nAssistant suggestions:\n${text}`);
  const gaugesLoading = running && !hasRun;

  return (
    <div className="container mx-auto p-4 md:p-6 relative">
      <Toasts />

      {/* Inputs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* JD */}
        <div className="rounded-xl shadow border bg-white p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800">Job Description</h3>
            <div className="flex gap-2">
              <button className={btn} onClick={() => undo("jd")}>
                Undo
              </button>
              <button className={btn} onClick={() => setJD("")}>
                Clear
              </button>
            </div>
          </div>

          <BigDropZone
            onFile={async (file) => {
              try {
                const text = await readFileToText(file);
                setJD((p) => (p ? `${p}\n\n${text}` : text));
                toast(`נטען קובץ: ${file.name}`, "success");
              } catch (e) {
                toast("טעינת קובץ נכשלה: " + (e?.message || ""), "error");
              }
            }}
            hint="Upload job description file"
          >
            Upload File or Drop here
          </BigDropZone>

          <textarea
            dir="auto"
            className="w-full rounded-lg border px-3 py-2 text-sm h-48 mt-2"
            placeholder="Paste the job ad here…"
            value={jd}
            onChange={(e) => setJD(e.target.value)}
          />

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className={btn}
              onClick={async () => {
                const url = prompt("הדבק/י URL למודעה:");
                if (!url) return;
                try {
                  const text = await fetchUrlText(url);
                  setJD((p) => (p ? `${p}\n\n${text}` : text));
                  toast("נטען טקסט מ-URL", "success");
                } catch (e) {
                  toast("URL נכשל: " + (e?.message || ""), "error");
                }
              }}
            >
              Paste URL
            </button>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            * Upload: PDF/DOCX/TXT (≤{FILE_SIZE_LIMIT_MB}MB) • URL proxy via /api/fetch-url.
          </p>
          <LoadingOverlay show={running && !hasRun} />
        </div>

        {/* CV */}
        <div className="rounded-xl shadow border bg-white p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800">Your CV</h3>
            <div className="flex gap-2">
              <button className={btn} onClick={() => undo("cv")}>
                Undo
              </button>
              <button className={btn} onClick={() => setCV("")}>
                Clear
              </button>
            </div>
          </div>

          <BigDropZone
            onFile={async (file) => {
              try {
                const text = await readFileToText(file);
                setCV((p) => (p ? `${p}\n\n${text}` : text));
                toast(`נטען קובץ: ${file.name}`, "success");
              } catch (e) {
                toast("טעינת קובץ נכשלה: " + (e?.message || ""), "error");
              }
            }}
            hint="Upload CV file"
          >
            Upload File or Drop here
          </BigDropZone>

          <textarea
            dir="auto"
            className="w-full rounded-lg border px-3 py-2 text-sm h-48 mt-2"
            placeholder="Paste your CV text here… (saved locally)"
            value={cv}
            onChange={(e) => setCV(e.target.value)}
          />

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className={btn}
              onClick={async () => {
                const url = prompt("הדבק/י URL לקורות חיים:");
                if (!url) return;
                try {
                  const text = await fetchUrlText(url);
                  setCV((p) => (p ? `${p}\n\n${text}` : text));
                  toast("נטען טקסט מ-URL", "success");
                } catch (e) {
                  toast("URL נכשל: " + (e?.message || ""), "error");
                }
              }}
            >
              Paste URL
            </button>
          </div>

          <p className="mt-2 text-xs text-gray-500">* Saved locally (localStorage).</p>
          <LoadingOverlay show={running && !hasRun} />
        </div>
      </div>

      {/* Gauges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
        <RingGauge label="Keywords" value={scores.keywords} size={gaugeSize} loading={gaugesLoading} />
        <RingGauge label="Requirements" value={scores.requirements} size={gaugeSize} loading={gaugesLoading} />
        <RingGauge label="Match" value={scores.match} size={gaugeSize} loading={gaugesLoading} />
        <RingGauge label="Experience" value={scores.experience} size={gaugeSize} loading={gaugesLoading} />
        <RingGauge label="Skills" value={scores.skills} size={gaugeSize} loading={gaugesLoading} />
      </div>

      {/* Controls + Chat */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        {/* LEFT: Controls */}
        <div className="rounded-xl shadow border bg-white p-4 relative">
          <h3 className="font-semibold text-gray-800 mb-3">Controls</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
            {/* Role Preset */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Role Preset</div>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={roleKey}
                onChange={(e) => setRoleKey(e.target.value)}
              >
                {Object.keys(ROLE_PRESETS).map((k) => (
                  <option key={k} value={k}>
                    {ROLE_PRESETS[k].label}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-gray-400 mt-1">
                Min: {rolePreset.min} | Max: {rolePreset.max} | Step: {rolePreset.step}
              </div>
            </div>

            {/* Slider */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Creativity (1..9)</div>
              <input
                type="range"
                min={1}
                max={9}
                step={1}
                className="w-full"
                value={slider}
                onChange={(e) => setSlider(Number(e.target.value))}
              />
              <div className="text-[11px] text-gray-400">Value: {slider}</div>
            </div>

            {/* Model & Target */}
            <div className="space-y-2">
              <div>
                <div className="text-xs text-gray-500 mb-1">Model</div>
                <select className="w-full rounded-lg border px-3 py-2 text-sm" value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="openai">ChatGPT (OpenAI)</option>
                  <option value="gemini">Gemini (Google)</option>
                  <option value="claude">Claude (Anthropic)</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Target</div>
                <select className="w-full rounded-lg border px-3 py-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="all">All</option>
                  <option value="cover">Cover Letter</option>
                  <option value="cv">Tailored CV</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <button className={btnPrimaryOutline} onClick={run} disabled={running}>
              {running ? "Running…" : "Run"}
            </button>
          </div>

          <div className="text-[11px] text-gray-400 mt-3">
            Server via <code>/api/openai-match</code>. URL proxy via <code>/api/fetch-url</code>. Chat via{" "}
            <code>/api/openai-chat</code>.
          </div>

          <LoadingOverlay show={running && hasRun} />
        </div>

        {/* RIGHT: Live Assistant */}
        <LiveAssistant visible={hasRun} jobDesc={jd} userCV={cv} scores={scores} onApplyCover={applyCover} onApplyCV={applyCV} />
      </div>

      {/* Outputs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <div className="rounded-xl shadow border bg-white p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800">Cover Letter</h3>
            <div className="flex gap-2">
              <button
                className={btn}
                onClick={async () => {
                  await navigator.clipboard?.writeText(cover);
                  toast("הועתק ללוח", "success");
                }}
              >
                Copy
              </button>
              <button className={btn} onClick={() => exportDocx("cover_letter.docx", "Cover Letter", cover)}>
                Export DOCX
              </button>
            </div>
          </div>
          {running && !hasRun ? (
            <Skeleton className="h-48" />
          ) : (
            <textarea
              dir="auto"
              className="w-full rounded-lg border px-3 py-2 text-sm h-48"
              value={cover}
              onChange={(e) => setCover(e.target.value)}
            />
          )}
          <LoadingOverlay show={running && hasRun} />
        </div>

        <div className="rounded-xl shadow border bg-white p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800">Tailored CV</h3>
            <div className="flex gap-2">
              <button
                className={btn}
                onClick={async () => {
                  await navigator.clipboard?.writeText(tailored);
                  toast("הועתק ללוח", "success");
                }}
              >
                Copy
              </button>
              <button className={btn} onClick={() => exportDocx("tailored_cv.docx", "Tailored CV", tailored)}>
                Export DOCX
              </button>
            </div>
          </div>
          {running && !hasRun ? (
            <Skeleton className="h-48" />
          ) : (
            <textarea
              dir="auto"
              className="w-full rounded-lg border px-3 py-2 text-sm h-48"
              value={tailored}
              onChange={(e) => setTailored(e.target.value)}
            />
          )}
          <LoadingOverlay show={running && hasRun} />
        </div>
      </div>
    </div>
  );
}
