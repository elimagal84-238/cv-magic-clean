// pages/cv-matcher.jsx
// CV-Magic — Matcher UI (enhanced + Drag&Drop)
// - Upload PDF/DOCX/TXT + Drag&Drop + URL for JD and CV
// - Export DOCX for outputs
// - Clean buttons + subtle hover
// - Live chat, RTL/LTR auto, responsive gauges

import { useEffect, useMemo, useRef, useState } from "react";

const LS_KEYS = {
  cv: "cvMagic.cvText",
  jd: "cvMagic.jdText",
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

const FILE_SIZE_LIMIT_MB = 10;
const ACCEPT_MIME =
  ".pdf,.docx,.txt,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const clamp100 = (x) => Math.max(0, Math.min(100, Math.round(Number(x || 0))));
const scoreColor = (pct) =>
  pct >= 67 ? "text-green-600" : pct >= 34 ? "text-yellow-600" : "text-red-600";
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
    if (/^[{\[]/.test(s)) return JSON.parse(s);
    return s;
  } catch {
    return d;
  }
};
const autoDir = (s) => (/[\u0590-\u05FF]/.test(String(s || "")) ? "rtl" : "ltr");

// ---------- Minimal buttons ----------
const btn =
  "inline-flex items-center justify-center rounded-md border border-gray-900/70 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-60";
const btnPrimary =
  "inline-flex items-center justify-center rounded-md border border-gray-900 bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 transition-colors disabled:opacity-60";

// ---------- Ring Gauge ----------
function RingGauge({ label, value = 0, size = 150, stroke = 14 }) {
  const r = (size - stroke) / 2,
    c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(value || 0)));
  const dash = (pct / 100) * c;
  const color = scoreColor(pct);
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#eee"
          strokeWidth={stroke}
          fill="none"
        />
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

// ---------- File/URL helpers ----------
async function readFileToText(file) {
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > FILE_SIZE_LIMIT_MB) {
    throw new Error(`File too large (>${FILE_SIZE_LIMIT_MB}MB).`);
  }
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "txt" || file.type.startsWith("text/")) {
    return await file.text();
  }
  if (ext === "pdf" || file.type === "application/pdf") {
    // ✅ תאימות ל-pdfjs-dist v4 ב-Next.js
    const pdfjs = await import("pdfjs-dist");
    await import("pdfjs-dist/build/pdf.worker.mjs");
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data }).promise;
    let text = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text +=
        content.items.map((it) => ("str" in it ? it.str : "")).join(" ") +
        "\n\n";
    }
    return text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  }
  if (ext === "docx") {
    // ✅ שים לב ל-.js — פותר "module not found" בבילד
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

// ---------- Export DOCX ----------
async function exportDocx(filename, title, bodyText) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import(
    "docx"
  );
  const paras = [];
  if (title)
    paras.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }));
  const lines = String(bodyText || "").split(/\n/);
  for (const line of lines) {
    if (!line.trim()) {
      paras.push(new Paragraph(""));
      continue;
    }
    if (/^\s*[•\-]\s+/.test(line)) {
      paras.push(
        new Paragraph({
          text: line.replace(/^\s*[•\-]\s+/, ""),
          bullet: { level: 0 },
        })
      );
    } else {
      paras.push(new Paragraph({ children: [new TextRun(line)] }));
    }
  }
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

// ---------- DropZone ----------
function DropZone({ onFile, children }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn(
        "rounded-md border p-2 transition-colors",
        over ? "border-gray-900 bg-gray-50" : "border-transparent"
      )}
      aria-label="Drop file here"
    >
      <label className="inline-flex gap-2 items-center cursor-pointer">
        <input
          type="file"
          hidden
          accept={ACCEPT_MIME}
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        {children}
      </label>
    </div>
  );
}

// ---------- Live Assistant (chat) ----------
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
  }, [visible]); // eslint-disable-line

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
      setMsgs((m) => [
        ...m,
        { role: "assistant", text: j?.reply || "תקלה זמנית, נסה שוב." },
      ]);
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
        <textarea
          readOnly
          className="w-full rounded-md border px-3 py-2 text-sm h-48 bg-gray-50"
          value="הצ׳אט נפתח לאחר הרצה ראשונה."
        />
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
      <div
        ref={boxRef}
        className="border rounded-md p-3 h-48 overflow-auto bg-gray-50"
      >
        {msgs.map((m, i) => (
          <div
            key={i}
            className={cn("mb-2", m.role === "user" && "text-right")}
            dir={autoDir(m.text)}
          >
            <div className="inline-block px-3 py-2 rounded-md bg-white whitespace-pre-wrap break-words text-sm">
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          dir="auto"
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="כתוב הודעה…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className={btnPrimary} onClick={send} disabled={busy}>
          {busy ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}

export default function CVMatcher() {
  const [jd, setJD] = useState("");
  const [cv, setCV] = useState("");
  const [rolePreset, setRolePreset] = useState(
    loadLS(LS_KEYS.role, ROLE_PRESETS["Product Manager"])
  );
  const [slider, setSlider] = useState(Number(loadLS(LS_KEYS.slider, 5)) || 5);
  const [runIdx, setRunIdx] = useState(Number(loadLS(LS_KEYS.runIdx, 0)) || 0);
  const [model, setModel] = useState("chatgpt");
  const [target, setTarget] = useState("all");

  const [scores, setScores] = useState({
    match: 0,
    keywords: 0,
    requirements: 0,
    experience: 0,
    skills: 0,
  });
  const [cover, setCover] = useState("");
  const [tailored, setTailored] = useState("");
  const [hasRun, setHasRun] = useState(false);
  const [running, setRunning] = useState(false);

  const [gaugeSize, setGaugeSize] = useState(150);
  useEffect(() => {
    const handle = () => setGaugeSize(window.innerWidth < 640 ? 120 : 150);
    handle();
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  useEffect(() => {
    const cvSaved = String(loadLS(LS_KEYS.cv, "") || "");
    if (cvSaved && !cv) setCV(cvSaved);
    const jdSaved = String(loadLS(LS_KEYS.jd, "") || "");
    if (jdSaved && !jd) setJD(jdSaved);
  }, []); // eslint-disable-line

  useEffect(() => {
    saveLS(LS_KEYS.cv, String(cv || ""));
  }, [cv]);
  useEffect(() => {
    saveLS(LS_KEYS.jd, String(jd || ""));
  }, [jd]);

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
      const resp = await fetch("/api/openai-match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(await resp.text());
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
      setRunIdx((x) => {
        const n = (Number(x || 0) + 1) % 99999;
        saveLS(LS_KEYS.runIdx, n);
        return n;
      });
    } catch (e) {
      alert("Run failed: " + (e?.message || "unknown"));
    } finally {
      setRunning(false);
    }
  }

  const slots = useMemo(() => {
    const A = jd.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    const B = cv.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    const m = Math.max(A.length, B.length);
    return Array.from({ length: m }, (_, i) => ({
      left: A[i] || "",
      right: B[i] || "",
    }));
  }, [jd, cv]);

  const applyCover = (text) =>
    setCover((t) => `${t}\n\n---\nAssistant suggestions:\n${text}`);
  const applyCV = (text) =>
    setTailored((t) => `${t}\n\n---\nAssistant suggestions:\n${text}`);

  // ---- Drag&Drop / Upload / URL handlers ----
  async function handleFile(which, file) {
    if (!file) return;
    try {
      const text = await readFileToText(file);
      if (which === "jd")
        setJD((p) => (p ? `${p}\n\n${text}` : text));
      else setCV((p) => (p ? `${p}\n\n${text}` : text));
    } catch (e) {
      alert("Cannot read file: " + (e?.message || "unknown"));
    }
  }
  async function handleUrl(which) {
    const url = prompt("הדבק/י URL:");
    if (!url) return;
    try {
      const text = await fetchUrlText(url);
      if (which === "jd")
        setJD((p) => (p ? `${p}\n\n${text}` : text));
      else setCV((p) => (p ? `${p}\n\n${text}` : text));
    } catch (e) {
      alert("URL fetch error: " + (e?.message || "unknown"));
    }
  }

  return (
    <div className="container mx-auto p-4 md:p-6">
      {/* Inputs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* JD */}
        <div className="rounded-xl shadow border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800">Job Description</h3>
            <button className={btn} onClick={() => setJD("")}>
              Clear
            </button>
          </div>

          <DropZone onFile={(file) => handleFile("jd", file)}>
            <button className={btn}>Upload File or Drop here</button>
          </DropZone>

          <textarea
            dir="auto"
            className="w-full rounded-md border px-3 py-2 text-sm h-48 mt-2"
            placeholder="Paste the job ad here…"
            value={jd}
            onChange={(e) => setJD(e.target.value)}
          />

          <div className="mt-2 flex flex-wrap gap-2">
            <button className={btn} onClick={() => handleUrl("jd")}>
              Paste URL
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            * Clears on refresh/exit. Upload: PDF/DOCX/TXT (≤{FILE_SIZE_LIMIT_MB}
            MB) • URL proxy via /api/fetch-url.
          </p>
        </div>

        {/* CV */}
        <div className="rounded-xl shadow border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800">Your CV</h3>
            <button className={btn} onClick={() => setCV("")}>
              Clear
            </button>
          </div>

          <DropZone onFile={(file) => handleFile("cv", file)}>
            <button className={btn}>Upload File or Drop here</button>
          </DropZone>

          <textarea
            dir="auto"
            className="w-full rounded-md border px-3 py-2 text-sm h-48 mt-2"
            placeholder="Paste your CV text here… (saved locally)"
            value={cv}
            onChange={(e) => setCV(e.target.value)}
          />

          <div className="mt-2 flex flex-wrap gap-2">
            <button className={btn} onClick={() => handleUrl("cv")}>
              Paste URL
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            * Saved locally (localStorage).
          </p>
        </div>
      </div>

      {/* Gauges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
        <RingGauge label="Keywords" value={scores.keywords} size={gaugeSize} />
        <RingGauge
          label="Requirements"
          value={scores.requirements}
          size={gaugeSize}
        />
        <RingGauge label="Match" value={scores.match} size={gaugeSize} />
        <RingGauge
          label="Experience"
          value={scores.experience}
          size={gaugeSize}
        />
        <RingGauge label="Skills" value={scores.skills} size={gaugeSize} />
      </div>

      {/* Controls + Chat */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <div className="rounded-xl shadow border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-gray-800">Controls</div>
            <button className={btnPrimary} onClick={run} disabled={running}>
              {running ? (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
              ) : null}
              {running ? "Running…" : "Run"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
            <div>
              <div className="text-xs text-gray-500 mb-1">Role Preset</div>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={JSON.stringify(rolePreset)}
                onChange={(e) => {
                  const v = JSON.parse(e.target.value);
                  setRolePreset(v);
                  saveLS(LS_KEYS.role, v);
                }}
              >
                {Object.entries(ROLE_PRESETS).map(([name, v]) => (
                  <option key={name} value={JSON.stringify(v)}>
                    {name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Min: {rolePreset.min} | Max: {rolePreset.max} | Step:{" "}
                {rolePreset.step}
              </p>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Creativity (1..9)</div>
              <input
                type="range"
                min={1}
                max={9}
                step={1}
                className="w-full"
                value={slider}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSlider(v);
                  saveLS(LS_KEYS.slider, v);
                }}
              />
              <div className="text-xs text-gray-500 mt-1">Value: {slider}</div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Model</div>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="chatgpt">ChatGPT (OpenAI)</option>
                <option value="gemini">Gemini (Google)</option>
                <option value="claude">Claude (Anthropic)</option>
              </select>

              <div className="text-xs text-gray-500 mb-1 mt-3">Target</div>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="all">All</option>
                <option value="cover">Cover Letter only</option>
                <option value="cv">Tailored CV only</option>
              </select>
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            Server via <code>/api/openai-match</code>. URL proxy via{" "}
            <code>/api/fetch-url</code>. Chat via <code>/api/openai-chat</code>.
          </p>
        </div>

        <LiveAssistant
          visible={hasRun}
          jobDesc={jd}
          userCV={cv}
          scores={scores}
          onApplyCover={applyCover}
          onApplyCV={applyCV}
        />
      </div>

      {/* Outputs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <div className="rounded-xl shadow border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800">Cover Letter</h3>
            <div className="flex gap-2">
              <button
                className={btn}
                onClick={() => navigator.clipboard?.writeText(cover)}
              >
                Copy
              </button>
              <button
                className={btn}
                onClick={() =>
                  exportDocx("cover_letter.docx", "Cover Letter", cover)
                }
              >
                Export DOCX
              </button>
            </div>
          </div>
          <textarea
            dir="auto"
            className="w-full rounded-md border px-3 py-2 text-sm h-48"
            value={cover}
            onChange={(e) => setCover(e.target.value)}
          />
        </div>

        <div className="rounded-xl shadow border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800">Tailored CV</h3>
            <div className="flex gap-2">
              <button
                className={btn}
                onClick={() => navigator.clipboard?.writeText(tailored)}
              >
                Copy
              </button>
              <button
                className={btn}
                onClick={() =>
                  exportDocx("tailored_cv.docx", "Tailored CV", tailored)
                }
              >
                Export DOCX
              </button>
            </div>
          </div>
          <textarea
            dir="auto"
            className="w-full rounded-md border px-3 py-2 text-sm h-48"
            value={tailored}
            onChange={(e) => setTailored(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
