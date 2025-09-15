// pages/api/match.js
// CV-Magic Match API — v0.1 (JS, CommonJS)
const { extractAll } = require("../../src/lib/extract");
const { scoreAll } = require("../../src/lib/score");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { job_description, cv_text } = req.body || {};
    if (!job_description || !cv_text) {
      return res.status(400).json({ error: "job_description and cv_text are required" });
    }
    const extracted = extractAll(String(job_description), String(cv_text));
    const result = scoreAll(extracted);
    return res.status(200).json({ ok: true, extracted, ...result });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error" });
  }
};
