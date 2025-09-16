// pages/api/openai-chat.js
// Simple chat API for the Live Assistant (HE/EN). Uses OpenAI (gpt-4o-mini).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

  const {
    job_description = "",
    cv_text = "",
    ats_scores = null,        // {match, keywords, requirements, experience, skills}
    messages = [],            // [{role:'user'|'assistant', text:string}]
    temperature = 0.3,
  } = req.body || {};

  // Build chat messages
  const sys = [
    "You are CV-Magic Live Assistant.",
    "Task: improve resume & cover letter to fit the job.",
    "NEVER invent facts not present in the CV unless the user explicitly provides them.",
    "Be concise, concrete, and actionable. Prefer bullet points.",
    "If user asks to rewrite, produce short snippets they can paste.",
  ].join(" ");

  const context = [
    `JOB DESCRIPTION:\n${job_description}\n`,
    `CANDIDATE CV:\n${cv_text}\n`,
    ats_scores
      ? `ATS SCORES (0-100): match=${ats_scores.match}, keywords=${ats_scores.keywords}, requirements=${ats_scores.requirements}, experience=${ats_scores.experience}, skills=${ats_scores.skills}\n`
      : "",
    "You may refer to the scores to prioritize suggestions."
  ].join("");

  const chat = [
    { role: "system", content: sys },
    { role: "user", content: context },
    // user/assistant history (map to OpenAI format)
    ...messages.map(m => ({ role: m.role, content: m.text })),
  ];

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: chat,
        temperature: Math.max(0, Math.min(1, Number(temperature || 0.3))),
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: `OpenAI error ${r.status}: ${t}` });
    }
    const j = await r.json();
    const text = j?.choices?.[0]?.message?.content?.trim() || "";
    return res.status(200).json({ reply: text });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Chat error" });
  }
}
