// pages/api/openai-match.js
// Node Next.js API Route
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const {
    job_description,
    cv_text,
    role_preset, // {min,max,step}
    slider, // 1..9
    run_index,
    temperature, // computed client-side; re-check/fuse with server calc
    model_pref, // "chatgpt" | "gemini" | "claude" (non-OpenAI fallbacks to ChatGPT)
    target, // "all" | "cover" | "cv"
  } = req.body || {};

  if (!job_description || !cv_text) {
    return res.status(400).json({ error: "Missing job_description or cv_text" });
  }

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const base01 = clamp(((Number(slider) || 3) - 1) / 8, 0, 1);
  const minT = Number(role_preset?.min ?? 0.1);
  const maxT = Number(role_preset?.max ?? 0.7);
  const stepT = Number(role_preset?.step ?? 0.05);
  const tBase = lerp(minT, maxT, base01);
  const tempServer = Math.min(maxT, tBase + (Number(run_index) || 0) * stepT);
  const temp = clamp(Number(temperature ?? tempServer), minT, maxT);

  // Map model preference (all routed to OpenAI for now)
  const modelMap = {
    chatgpt: "gpt-4.1-mini",
    gemini: "gpt-4.1-mini", // placeholder routing (same engine)
    claude: "gpt-4.1-mini", // placeholder routing (same engine)
  };
  const model = modelMap[model_pref] || modelMap.chatgpt;

  // Build prompt
  const system = `
You are CV-Magic, an ATS-aware assistant. 
Return ONLY JSON that strictly follows the provided schema.
Scoring rules:
- match_score is 0..100 and reflects overall fit.
- keywords / requirements_coverage / experience / skills are 0..100.
Produce concise but complete "tailored_cv" (markdown bullets ok) and "cover_letter" (short, targeted).
Ensure terminology mirrors the job ad while staying truthful to the CV.
  `.trim();

  const user = `
[JOB DESCRIPTION]
${job_description}

[CV]
${cv_text}

[INSTRUCTIONS]
- Optimize CV wording to improve ATS pass without fabricating facts.
- Keep dates/roles consistent; improve phrasing to mirror job terminology.
- Output JSON only.
${target === "cover" ? "- Focus on cover letter; keep CV minimal edits." : ""}
${target === "cv" ? "- Focus on tailored CV; cover letter can be brief." : ""}
  `.trim();

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      match_score: { type: "number", minimum: 0, maximum: 100 },
      keywords: { type: "number", minimum: 0, maximum: 100 },
      requirements_coverage: { type: "number", minimum: 0, maximum: 100 },
      experience: { type: "number", minimum: 0, maximum: 100 },
      skills: { type: "number", minimum: 0, maximum: 100 },
      tailored_cv: { type: "string" },
      cover_letter: { type: "string" },
    },
    required: [
      "match_score",
      "keywords",
      "requirements_coverage",
      "experience",
      "skills",
      "tailored_cv",
      "cover_letter",
    ],
  };

  // --- OpenAI Chat Completions with JSON schema ---
  async function callOpenAI() {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: temp,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "MatchResult", strict: true, schema },
        },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`OpenAI error ${resp.status}: ${t}`);
    }
    const j = await resp.json();
    const content = j?.choices?.[0]?.message?.content || "{}";
    return content;
  }

  function safeParse(jsonStr) {
    try {
      return JSON.parse(jsonStr);
    } catch {
      // naive repair: find first/last braces
      const i = jsonStr.indexOf("{");
      const k = jsonStr.lastIndexOf("}");
      if (i >= 0 && k > i) {
        try {
          return JSON.parse(jsonStr.slice(i, k + 1));
        } catch {}
      }
      return null;
    }
  }

  try {
    const raw = await callOpenAI();
    const obj = safeParse(raw);
    if (!obj) {
      return res.status(502).json({ error: "Model returned non-JSON." });
    }

    // sanitize numeric bounds
    const clamp100 = (n) =>
      Math.max(0, Math.min(100, Number.isFinite(n) ? Number(n) : 0));

    const out = {
      scores: {
        match_score: clamp100(obj.match_score),
        keywords: clamp100(obj.keywords),
        requirements_coverage: clamp100(obj.requirements_coverage),
        experience: clamp100(obj.experience),
        skills: clamp100(obj.skills),
      },
      tailored_cv: String(obj.tailored_cv || ""),
      cover_letter: String(obj.cover_letter || ""),
      temperature: temp,
      model,
    };

    return res.status(200).json(out);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
