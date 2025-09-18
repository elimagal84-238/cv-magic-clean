// pages/api/score-match.js  (V1.6) — תואם פלט ל-UI, מנוע חדש מתחת.
export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

import { scoreAll } from "../../lib/scoring/ranker.js";

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  try {
    const { job_description = "", cv_text = "" } = req.body || {};
    const jd = String(job_description || "").slice(0, 60_000);
    const cv = String(cv_text || "").slice(0, 60_000);

    const out = scoreAll(jd, cv);

    return res.status(200).json({
      match_score: out.match_score,
      keywords_match: out.keywords_match,
      requirements_match: out.requirements_match,
      experience_match: out.experience_match,
      skills_match: out.skills_match,
      analysis: out.analysis,
      model: "v1.6-ensemble"
    });
  } catch (e) {
    console.error("score-match v1.6 error:", e);
    return res.status(500).json({ error: e?.message || "server error" });
  }
}
