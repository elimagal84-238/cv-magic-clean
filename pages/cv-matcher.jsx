// pages/cv-matcher.jsx
import React, { useState } from "react";
import ScoreMeters from "../components/ScoreMeters";
import { scoreMatch, runMatch } from "../lib/core";

export default function CvMatcherPage() {
  const [cv, setCv] = useState("");
  const [jd, setJd] = useState("");
  const [volume, setVolume] = useState(5);
  const [model, setModel] = useState("gpt-4.1-mini");
  const [loadingScore, setLoadingScore] = useState(false);
  const [loadingGen, setLoadingGen] = useState(false);
  const [score, setScore] = useState(null);
  const [tailored, setTailored] = useState("");
  const [cover, setCover] = useState("");
  const [suggestions, setSuggestions] = useState([]);

  const doScore = async () => {
    try {
      setLoadingScore(true);
      const r = await scoreMatch(cv, jd);
      setScore(r);
    } catch (e) {
      alert("Scoring failed: " + e.message);
    } finally {
      setLoadingScore(false);
    }
  };

  const doGenerate = async () => {
    try {
      setLoadingGen(true);
      const r = await runMatch(cv, jd, { volume, model, target: "cv+cover" });
      const out = r?.result || {};
      setTailored(out.tailored_cv || "");
      setCover(out.cover_letter || "");
      setSuggestions(out.suggestions || []);
      if (!score) {
        // auto-score tailored vs JD
        const s = await scoreMatch(out.tailored_cv || cv, jd);
        setScore(s);
      }
    } catch (e) {
      alert("Generation failed: " + e.message);
    } finally {
      setLoadingGen(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl sm:text-3xl font-bold mb-2">CV-Magic — Matcher</h1>
      <p className="text-sm text-gray-600 mb-6">הדבק טקסט של קורות חיים ודרישת תפקיד, חשב התאמה וייצר גרסה מותאמת.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col">
          <label className="text-sm font-medium mb-1">CV</label>
          <textarea
            className="border rounded-md p-3 h-56 md:h-80 resize-vertical"
            value={cv}
            onChange={(e) => setCv(e.target.value)}
            placeholder="Paste your CV text here…"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium mb-1">Job Description</label>
          <textarea
            className="border rounded-md p-3 h-56 md:h-80 resize-vertical"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the job description here…"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div>
          <label className="text-sm font-medium">Creativity Volume (1–9)</label>
          <input
            type="range"
            min="1"
            max="9"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full"
          />
          <div className="text-xs text-gray-600 mt-1">Current: {volume}</div>
        </div>

        <div>
          <label className="text-sm font-medium">Model</label>
          <select
            className="border rounded-md p-2 w-full"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="gpt-4.1-mini">OpenAI gpt-4.1-mini</option>
            <option value="gpt-4o-mini">OpenAI gpt-4o-mini</option>
          </select>
          <div className="text-xs text-gray-500 mt-1">Unified via Responses API</div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={doScore}
            disabled={loadingScore}
            className="flex-1 bg-gray-100 hover:bg-gray-200 border rounded-md px-3 py-2"
          >
            {loadingScore ? "Scoring…" : "Calculate Match"}
          </button>
          <button
            onClick={doGenerate}
            disabled={loadingGen}
            className="flex-1 bg-black text-white hover:opacity-90 rounded-md px-3 py-2"
          >
            {loadingGen ? "Generating…" : "Generate Tailored CV"}
          </button>
        </div>
      </div>

      {score && (
        <div className="mt-6 border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">ATS Console</h2>
          <ScoreMeters
            total={score.match_score}
            breakdown={score.breakdown || {}}
          />
          <div className="mt-3 text-xs text-gray-600">
            Skills covered: {score?.details?.cv_skills_covered?.length || 0} / {score?.details?.jd_skills_required?.length || 0}
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col">
          <label className="text-sm font-medium mb-1">Tailored CV</label>
          <textarea className="border rounded-md p-3 h-64 md:h-72" value={tailored} onChange={(e) => setTailored(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium mb-1">Cover Letter</label>
          <textarea className="border rounded-md p-3 h-64 md:h-72" value={cover} onChange={(e) => setCover(e.target.value)} />
        </div>
      </div>

      {suggestions?.length > 0 && (
        <div className="mt-6 border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Suggestions</h3>
          <ul className="list-disc pl-5 text-sm">
            {suggestions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
