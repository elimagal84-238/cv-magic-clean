import { useState } from "react";

export default function MatcherForm() {
  const [job, setJob] = useState("");
  const [cv, setCv] = useState("");
  const [score, setScore] = useState(null);
  const [msg, setMsg] = useState("");

  function analyze() {
    if (!job.trim() || !cv.trim()) {
      setMsg("נא למלא גם דרישות משרה וגם קו״ח");
      setScore(null);
      return;
    }
    setMsg("");
    // חישוב דמה: אורך חיתוך טקסטים
    const overlap = new Set(
      job.toLowerCase().split(/\W+/).filter(Boolean)
    );
    const hit = cv
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => overlap.has(w)).length;
    const s = Math.min(100, Math.round((hit / (overlap.size || 1)) * 100));
    setScore(s);
  }

  const box = { width: "100%", minHeight: 120, padding: 8 };

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
      <h2>בדיקת התאמה בסיסית</h2>

      <label>דרישות המשרה</label>
      <textarea style={box} value={job} onChange={(e) => setJob(e.target.value)} />

      <label>קורות חיים</label>
      <textarea style={box} value={cv} onChange={(e) => setCv(e.target.value)} />

      <button onClick={analyze} style={{ padding: "10px 18px", marginTop: 8 }}>
        נתח
      </button>

      {msg && <div style={{ color: "crimson", marginTop: 10 }}>{msg}</div>}
      <div style={{ marginTop: 10 }}>ציון התאמה: {score ?? "-"}</div>
    </div>
  );
}
