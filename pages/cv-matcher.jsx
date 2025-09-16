// pages/cv-matcher.jsx
// CV-Magic — Matcher (master) v2: calls /api/openai-match; UI נקי; שומר CV בלוקאל; תומך HE/EN

import React, { useEffect, useRef, useState } from "react";

const K = { CV: "cvMagic_userCV_v1" };
const clamp = (n, a=0, b=100) => Math.max(a, Math.min(b, n));

const ui = {
  container: "container mx-auto p-4 md:p-6",
  grid: "grid grid-cols-1 xl:grid-cols-2 gap-4",
  card: "rounded-xl shadow border bg-white p-4",
  title: "font-semibold text-gray-800",
  input: "w-full rounded-lg border px-3 py-2 text-sm",
  btn: "rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60",
  btnGhost: "rounded-lg border px-3 py-2 text-sm",
  badge: "inline-flex items-center gap-2 text-xs text-gray-500"
};

function Gauge({ title, value }) {
  return (
    <div className={ui.card}>
      <div className="flex items-center justify-between mb-2">
        <span className={ui.title}>{title}</span>
        <span className="text-sm text-gray-500">{clamp(value)}%</span>
      </div>
      <div className="h-2 rounded bg-gray-100 overflow-hidden">
        <div className="h-2 bg-gray-800" style={{ width: `${clamp(value)}%` }} />
      </div>
    </div>
  );
}

function tipsFromScores(s) {
  const out = [];
  if (s.skills < 40) out.push("הוסף אזכורים ישירים למיומנויות/כלים מהמודעה.");
  if (s.requirements < 50) out.push("כסה דרישות ספציפיות במשפטים קצרים וברורים.");
  if (s.keywords < 35) out.push("שלב מילות מפתח בניסוח טבעי לאורך הסיכום והניסיון.");
  if (s.experience < 55) out.push("ציין שנות ניסיון באופן מספרי (לדוגמה: '5 שנות ניסיון').");
  return out.length ? out : ["התאמה טובה. אפשר לחדד הישגים כמותיים ולהדגיש תוצאות."];
}

function Chat({ visible, ctx, applyCV, applyCover }) {
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!visible || msgs.length) return;
    const seed = tipsFromScores(ctx);
    setMsgs([{ role: "assistant", text: `תובנות מה-ATS:\n${seed.map(s=>`• ${s}`).join('\n')}\nאיך להתקדם — קורות חיים או מכתב?` }]);
  }, [visible]); // eslint-disable-line

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [msgs]);

  const send = () => {
    const m = txt.trim();
    if (!m) return;
    setMsgs((v) => [...v, { role: "user", text: m }, { role: "assistant", text: "קיבלתי. נסו להוסיף דוגמה כמותית שמוכיחה את המיומנות שנדרשת בתפקיד." }]);
    setTxt("");
  };

  if (!visible) return null;
  return (
    <div className={ui.card}>
      <div className="flex items-center justify-between mb-2">
        <h3 className={ui.title}>Live Assistant</h3>
        <div className="flex gap-2">
          <button className={ui.btnGhost} onClick={()=>applyCover(msgs)}>Apply to Cover Letter</button>
          <button className={ui.btnGhost} onClick={()=>applyCV(msgs)}>Apply to Tailored CV</button>
        </div>
      </div>
      <div ref={ref} className="border rounded-lg p-3 h-48 overflow-auto">
        {msgs.map((m,i)=>(
          <div key={i} className={`mb-2 ${m.role==='user'?'text-right':''}`}>
            <div className="inline-block px-3 py-2 rounded-lg bg-gray-50">
              <pre className="whitespace-pre-wrap break-words text-sm">{m.text}</pre>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input className={ui.input} placeholder="כתוב הודעה…" value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} />
        <button className={ui.btn} onClick={send}>Send</button>
      </div>
    </div>
  );
}

export default function CVMatcher() {
  const [jd, setJD] = useState("");
  const [cv, setCV] = useState("");
  const [scores, setScores] = useState({ match:0, skills:0, experience:0, keywords:0, requirements:0 });
  const [cover, setCover] = useState("");
  const [tailored, setTailored] = useState("");
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => { try { const s = localStorage.getItem(K.CV); if (s && !cv) setCV(s); } catch{} }, []); // load
  useEffect(() => { try { localStorage.setItem(K.CV, cv || ""); } catch{} }, [cv]); // persist

  async function run() {
    setRunning(true);
    try {
      const res = await fetch("/api/openai-match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_description: jd, cv_text: cv })
      });
      const data = await res.json();
      const k = +data.keywords_match || 0;
      const s = +data.skills_match || 0;
      const e = +data.experience_match || 0;
      const r = +data.requirements_match || 0;
      const m = +data.match_score || Math.round(k*0.25+s*0.3+r*0.25+e*0.2);
      setScores({ match:m, skills:s, experience:e, keywords:k, requirements:r });

      const who = (cv.split(/\n/)[0] || "Candidate").trim();
      setCover(`${who}\n\nDear Hiring Team,\nI'm excited to apply. Based on my background, I estimate a fit of ~${m}%.\nBest regards,\n${who}`);
      setTailored(`TARGETED SUMMARY\n• Focus areas: ${jd.slice(0,120)}...\n\nEXPERIENCE & SKILLS (Tailored)\n${cv}`);
      setHasRun(true);
    } catch {
      setScores({ match:0, skills:0, experience:0, keywords:0, requirements:0 });
    } finally { setRunning(false); }
  }

  const applyCover = (msgs) => {
    const last = msgs.filter(m=>m.role==='assistant').slice(-1)[0]?.text || "";
    if (last) setCover((t)=>`${t}\n\n---\nAssistant suggestions:\n${last}`);
  };
  const applyCV = (msgs) => {
    const last = msgs.filter(m=>m.role==='assistant').slice(-1)[0]?.text || "";
    if (last) setTailored((t)=>`${t}\n\n---\nAssistant suggestions:\n${last}`);
  };

  return (
    <div className={ui.container}>
      <div className={ui.grid}>
        {/* JD */}
        <div className={ui.card}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={ui.title}>Job Description</h3>
            <button className={ui.btnGhost} onClick={()=>setJD("")}>Clear</button>
          </div>
          <textarea className={ui.input + " h-48"} placeholder="Paste the job ad here…" value={jd} onChange={e=>setJD(e.target.value)} />
          <p className="mt-2 text-xs text-gray-500">* Clears on refresh/exit.</p>
        </div>

        {/* CV */}
        <div className={ui.card}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={ui.title}>Your CV</h3>
            <button className={ui.btnGhost} onClick={()=>setCV("")}>Clear</button>
          </div>
          <textarea className={ui.input + " h-48"} placeholder="Paste your CV text here… (saved locally)" value={cv} onChange={e=>setCV(e.target.value)} />
          <p className="mt-2 text-xs text-gray-500">* Saved locally (localStorage).</p>
        </div>

        {/* Gauges */}
        <div className="xl:col-span-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Gauge title="Keywords" value={scores.keywords} />
          <Gauge title="Requirements Coverage" value={scores.requirements} />
          <Gauge title="Match Score" value={scores.match} />
          <Gauge title="Experience" value={scores.experience} />
          <Gauge title="Skills" value={scores.skills} />
        </div>

        {/* Controls */}
        <div className={ui.card}>
          <div className="flex items-center justify-between">
            <div className={ui.title}>Controls</div>
            <button className={ui.btn} onClick={run} disabled={running}>{running ? "Running…" : "Run"}</button>
          </div>
          <p className="text-xs text-gray-500 mt-2">Server scoring via /api/openai-match (HE/EN aware).</p>
        </div>

        {/* Assistant */}
        <Chat visible={hasRun} ctx={scores} applyCV={applyCV} applyCover={applyCover} />

        {/* Outputs */}
        <div className={ui.card}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={ui.title}>Cover Letter</h3>
            <button className={ui.btnGhost} onClick={()=>navigator.clipboard?.writeText(cover)}>Copy</button>
          </div>
          <textarea className={ui.input + " h-48"} value={cover} onChange={e=>setCover(e.target.value)} />
        </div>

        <div className={ui.card}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={ui.title}>Tailored CV</h3>
            <button className={ui.btnGhost} onClick={()=>navigator.clipboard?.writeText(tailored)}>Copy</button>
          </div>
          <textarea className={ui.input + " h-48"} value={tailored} onChange={e=>setTailored(e.target.value)} />
        </div>
      </div>
    </div>
  );
}
