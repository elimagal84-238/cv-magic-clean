// pages/cv-matcher.jsx
import React from "react";
import ScoreMeters from "@/components/ScoreMeters";
import { Document, Packer, Paragraph } from "docx";

const LS_KEYS = {
  jd: "cv-magic.jd",
  cv: "cv-magic.cv",
  role: "cv-magic.role",
  model: "cv-magic.model",
  target: "cv-magic.target",
  slider: "cv-magic.slider",
};

const ROLE_PRESETS = [
  { id: "copywriter", label: "Copywriter" },
  { id: "surgeon", label: "Surgeon" },
  { id: "pm", label: "Product Manager" },
  { id: "dev", label: "Software Engineer" },
];

const MODELS = [
  { id: "chatgpt", label: "ChatGPT (OpenAI)" },
  { id: "gemini", label: "Gemini" },
  { id: "claude", label: "Claude" },
];

const TARGETS = [
  { id: "all", label: "All" },
  { id: "cover", label: "Cover Letter only" },
  { id: "cv", label: "Tailored CV only" },
];

function clamp01(n) {
  const x = Number(n ?? 0);
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
function clamp100(n) {
  const x = Number(n ?? 0);
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(100, x));
}

// small helper: copy text to clipboard
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text || "");
    alert("Copied.");
  } catch {
    alert("Copy failed.");
  }
}

// read client file as text (txt/docx/pdf supported)
async function readFileAsText(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();

  if (ext === "txt") {
    return await file.text();
  }

  if (ext === "docx") {
    // dynamic import keeps build happy
    const mammoth = await import("mammoth/mammoth.browser");
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    return value || "";
  }

  if (ext === "pdf") {
    // dynamic import + worker auto
    const pdfjs = await import("pdfjs-dist");
    // For Next.js + Vercel this usually works without manual worker URL.
    // If needed, you can uncomment and point to the module file:
    // pdfjs.GlobalWorkerOptions.workerSrc = await import("pdfjs-dist/build/pdf.worker.min.mjs");

    const typedArray = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data: typedArray });
    const pdf = await loadingTask.promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n";
    }
    return text;
  }

  // fallback
  return await file.text();
}

// export a single block string to .docx (download)
async function exportDocx(filename, text) {
  const paragraphs = (text || "")
    .split(/\r?\n/)
    .map((line) => new Paragraph({ text: line || " " }));
  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CvMatcherPage() {
  // inputs
  const [jobDescription, setJobDescription] = React.useState("");
  const [cvText, setCvText] = React.useState("");

  // controls
  const [rolePreset, setRolePreset] = React.useState(ROLE_PRESETS[0].id);
  const [modelPref, setModelPref] = React.useState(MODELS[0].id);
  const [target, setTarget] = React.useState(TARGETS[0].id);
  const [slider, setSlider] = React.useState(5);

  // outputs
  const [coverLetter, setCoverLetter] = React.useState("");
  const [tailoredCv, setTailoredCv] = React.useState("");

  // meters
  const [scores, setScores] = React.useState({
    keywords: 0,
    requirements: 0,
    match: 0,
    experience: 0,
    skills: 0,
  });

  // chat box (placeholder – you can wire it to /api/openai-chat)
  const [assistantDraft, setAssistantDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const runIndexRef = React.useRef(0);

  // ------------- localStorage -------------
  React.useEffect(() => {
    try {
      setJobDescription(localStorage.getItem(LS_KEYS.jd) || "");
      setCvText(localStorage.getItem(LS_KEYS.cv) || "");
      setRolePreset(localStorage.getItem(LS_KEYS.role) || ROLE_PRESETS[0].id);
      setModelPref(localStorage.getItem(LS_KEYS.model) || MODELS[0].id);
      setTarget(localStorage.getItem(LS_KEYS.target) || TARGETS[0].id);
      setSlider(Number(localStorage.getItem(LS_KEYS.slider) || 5));
    } catch {}
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.jd, jobDescription || "");
      localStorage.setItem(LS_KEYS.cv, cvText || "");
      localStorage.setItem(LS_KEYS.role, rolePreset);
      localStorage.setItem(LS_KEYS.model, modelPref);
      localStorage.setItem(LS_KEYS.target, target);
      localStorage.setItem(LS_KEYS.slider, String(slider));
    } catch {}
  }, [jobDescription, cvText, rolePreset, modelPref, target, slider]);

  // ------------- file uploads -------------
  const onDrop = async (file, which) => {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      if (which === "jd") setJobDescription(text);
      else setCvText(text);
    } catch (e) {
      console.error(e);
      alert("Cannot read file: " + (e?.message || e));
    }
  };

  const FileDrop = ({ value, onChange, label, which }) => {
    const inputRef = React.useRef(null);

    const onClick = () => inputRef.current?.click();

    const onInput = async (e) => {
      const f = e.target.files?.[0];
      if (f) await onDrop(f, which);
      e.target.value = ""; // reset
    };

    const onPasteUrl = async () => {
      const url = prompt("Paste a URL to fetch:");
      if (!url) return;
      try {
        const res = await fetch("/api/fetch-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (data?.text) onChange(data.text);
        else alert("URL fetch failed.");
      } catch (e) {
        console.error(e);
        alert("URL fetch failed.");
      }
    };

    const onDropArea = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const f = e.dataTransfer?.files?.[0];
      if (f) await onDrop(f, which);
    };

    return (
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDropArea}
        className="rounded-xl shadow border bg-white p-4 relative"
      >
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={onClick}
            className="text-sm rounded-lg border px-3 py-1 bg-white hover:bg-gray-50"
          >
            Upload File or Drop here
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => onChange("")}
              className="text-xs rounded-lg border px-2 py-1 bg-white hover:bg-gray-50"
              title="Undo text"
            >
              Undo
            </button>
            <button
              onClick={() => onChange("")}
              className="text-xs rounded-lg border px-2 py-1 bg-white hover:bg-gray-50"
              title="Clear"
            >
              Clear
            </button>
          </div>
        </div>

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={12}
          placeholder={label}
          className="w-full rounded-lg border p-3 text-sm"
        />

        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={onPasteUrl}
            className="text-xs rounded-lg border px-2 py-1 bg-white hover:bg-gray-50"
          >
            Paste URL
          </button>
          <span className="text-[11px] text-gray-500">
            * Upload: PDF/DOCX/TXT (≤10MB) • URL proxy via /api/fetch-url.
          </span>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".txt,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="hidden"
          onChange={onInput}
        />
      </div>
    );
  };

  // ------------- RUN MATCH -------------
  const onRun = async () => {
    if (!jobDescription.trim() || !cvText.trim()) {
      alert("Please paste both Job Description and your CV.");
      return;
    }

    setBusy(true);
    setCoverLetter("");
    setTailoredCv("");
    try {
      runIndexRef.current += 1;

      const body = {
        job_description: jobDescription,
        cv_text: cvText,
        role_preset: rolePreset,
        slider: Number(slider), // 1..9
        run_index: runIndexRef.current,
        temperature: undefined, // server will derive if needed
        model_pref: modelPref, // "chatgpt" | "gemini" | "claude"
        target, // "all" | "cover" | "cv"
      };

      const res = await fetch("/api/openai-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Server error");
      }

      const data = await res.json();
      setCoverLetter(data?.cover_letter || "");
      setTailoredCv(data?.tailored_cv || "");

      const a = data?.ats || data?.scores || {};
      setScores({
        keywords: clamp100(a.keywords ?? 0),
        requirements: clamp100(a.requirements ?? 0),
        match: clamp100(a.match ?? a.overall ?? 0),
        experience: clamp100(a.experience ?? 0),
        skills: clamp100(a.skills ?? 0),
      });
    } catch (e) {
      console.error(e);
      alert("Run failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6">
      {/* INPUTS */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FileDrop
          which="jd"
          value={jobDescription}
          onChange={setJobDescription}
          label="Paste the job ad here…"
        />
        <FileDrop
          which="cv"
          value={cvText}
          onChange={setCvText}
          label="Paste your CV text here… (saved locally)"
        />
      </div>

      {/* METERS */}
      <ScoreMeters scores={scores} />

      {/* CONTROLS + ASSISTANT */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        {/* Controls */}
        <div className="rounded-xl shadow border bg-white p-4">
          <div className="text-lg font-semibold mb-3">Controls</div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="text-xs text-gray-500">Role Preset</label>
              <select
                id="role-preset"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={rolePreset}
                onChange={(e) => setRolePreset(e.target.value)}
              >
                {ROLE_PRESETS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-gray-500 mt-1">
                Min: 0.4 | Max: 0.9 | Step: 0.1
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500">Creativity (1..9)</label>
              <input
                type="range"
                min={1}
                max={9}
                step={1}
                className="w-full"
                value={slider}
                onChange={(e) => setSlider(Number(e.target.value))}
              />
              <div className="text-[11px] text-gray-500 mt-1">Value: {slider}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Model</label>
                <select
                  id="model"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={modelPref}
                  onChange={(e) => setModelPref(e.target.value)}
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Target</label>
                <select
                  id="target"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  {TARGETS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-3 text-[11px] text-gray-500">
            Server via <code>/api/openai-match</code>. URL proxy via <code>/api/fetch-url</code>. Chat via{" "}
            <code>/api/openai-chat</code>.
          </div>

          <div className="mt-4">
            <button
              onClick={onRun}
              disabled={busy}
              className="rounded-xl border px-4 py-2 bg-black text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {busy ? "Running…" : "Run"}
            </button>
          </div>
        </div>

        {/* Live Assistant */}
        <div className="rounded-xl shadow border bg-white p-4">
          <div className="text-lg font-semibold mb-3">Live Assistant</div>

          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setAssistantDraft((assistantDraft || "") + "\n• ")}
              className="text-xs rounded-lg border px-3 py-1 bg-white hover:bg-gray-50"
            >
              Apply to Cover Letter
            </button>
            <button
              onClick={() => setAssistantDraft((assistantDraft || "") + "\n• ")}
              className="text-xs rounded-lg border px-3 py-1 bg-white hover:bg-gray-50"
            >
              Apply to Tailored CV
            </button>
          </div>

          <div className="flex items-end gap-2">
            <textarea
              rows={6}
              value={assistantDraft}
              onChange={(e) => setAssistantDraft(e.target.value)}
              placeholder="הצ׳אט ייפתח לאחר הרצה ראשונה (placeholder)."
              className="w-full rounded-lg border p-3 text-sm"
            />
            <button className="rounded-xl border px-4 py-2 bg-black text-white hover:bg-gray-800">
              Send
            </button>
          </div>

          <div className="mt-2">
            <div className="text-xs text-gray-600 whitespace-pre-wrap rounded-lg bg-white border p-2">
              {`•:ATS-מה תובנות ראשוניות
• המינוחים נראים טוב.
• חיב הדרישות מכוסות היטב.
• מילות המפתח האותיות יפה.
• רמת הניסיון נראית מותאמת.`}
            </div>
          </div>
        </div>
      </div>

      {/* OUTPUTS */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <div className="rounded-xl shadow border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-lg font-semibold">Cover Letter</div>
            <div className="flex gap-2">
              <button
                onClick={() => copyToClipboard(coverLetter)}
                className="text-xs rounded-lg border px-3 py-1 bg-white hover:bg-gray-50"
              >
                Copy
              </button>
              <button
                onClick={() => exportDocx("cover-letter.docx", coverLetter)}
                className="text-xs rounded-lg border px-3 py-1 bg-white hover:bg-gray-50"
              >
                Export DOCX
              </button>
            </div>
          </div>
          <textarea
            rows={12}
            value={coverLetter}
            onChange={(e) => setCoverLetter(e.target.value)}
            className="w-full rounded-lg border p-3 text-sm"
          />
        </div>

        <div className="rounded-xl shadow border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-lg font-semibold">Tailored CV</div>
            <div className="flex gap-2">
              <button
                onClick={() => copyToClipboard(tailoredCv)}
                className="text-xs rounded-lg border px-3 py-1 bg-white hover:bg-gray-50"
              >
                Copy
              </button>
              <button
                onClick={() => exportDocx("tailored-cv.docx", tailoredCv)}
                className="text-xs rounded-lg border px-3 py-1 bg-white hover:bg-gray-50"
              >
                Export DOCX
              </button>
            </div>
          </div>
          <textarea
            rows={12}
            value={tailoredCv}
            onChange={(e) => setTailoredCv(e.target.value)}
            className="w-full rounded-lg border p-3 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
