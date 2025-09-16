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

  try {
    // ---------- sanity ----------
    const jd = String(job_description || "").slice(0, 50_000);
    const cv = String(cv_text || "").slice(0, 50_000);
    const runIndex = Number(run_index || 0) || 0;
    const model = String(model_pref || "chatgpt");

    // temperature: derive from slider + role preset, clamp 0..1
    // slider: 1..9 (UI)
    const s = Math.max(1, Math.min(9, Number(slider || 5)));
    const p = rolePreset(role_preset);
    const tFromSlider =
      p.min + ((p.max - p.min) * (s - 1 + (runIndex % 3) * 0.15)) / 8;
    const temp = clamp01(
      0.5 * tFromSlider + 0.5 * clamp01(Number(temperature || tFromSlider))
    );

    // ---------- call LLM ----------
    const schema = `
{
  "type": "object",
  "properties": {
    "match_score": { "type": "number", "minimum": 0, "maximum": 100 },
    "keywords": { "type": "number", "minimum": 0, "maximum": 100 },
    "requirements_coverage": { "type": "number", "minimum": 0, "maximum": 100 },
    "experience": { "type": "number", "minimum": 0, "maximum": 100 },
    "skills": { "type": "number", "minimum": 0, "maximum": 100 },
    "tailored_cv": { "type": "string" },
    "cover_letter": { "type": "string" }
  },
  "required": ["match_score","keywords","requirements_coverage","experience","skills","tailored_cv","cover_letter"],
  "additionalProperties": false
}
`.trim();

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

[SLIDERS]
temperature=${temp.toFixed(2)} ; preset=${JSON.stringify(p)}
target=${String(target || "all")}
`.trim();

    const llmJson = await callOpenAI(system, user, temp);

    // ---------- parse & validate ----------
    const obj = safeParse(llmJson);

    const out = {
      match_score: clamp100(obj.match_score),
      keywords_match: clamp100(obj.keywords),
      requirements_match: clamp100(obj.requirements_coverage),
      experience_match: clamp100(obj.experience),
      skills_match: clamp100(obj.skills),
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

// ---------- utils ----------
function rolePreset(rp) {
  const fallback = { min: 0.2, max: 0.8, step: 0.1 };
  if (!rp || typeof rp !== "object") return fallback;
  const min = typeof rp.min === "number" ? rp.min : fallback.min;
  const max = typeof rp.max === "number" ? rp.max : fallback.max;
  const step = typeof rp.step === "number" ? rp.step : fallback.step;
  return { min: clamp01(min), max: clamp01(max), step: clamp01(step) };
}
function clamp01(x) { return Math.max(0, Math.min(1, Number(x || 0))); }
function clamp100(x) { return Math.max(0, Math.min(100, Math.round(Number(x || 0)))); }

// ---------- OpenAI call (ChatGPT) ----------
async function callOpenAI(system, user, temperature) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const messages = [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            user +
            `

[SCHEMA]
\`\`\`json
{
  "type": "object",
  "properties": {
    "match_score": { "type": "number", "minimum": 0, "maximum": 100 },
    "keywords": { "type": "number", "minimum": 0, "maximum": 100 },
    "requirements_coverage": { "type": "number", "minimum": 0, "maximum": 100 },
    "experience": { "type": "number", "minimum": 0, "maximum": 100 },
    "skills": { "type": "number", "minimum": 0, "maximum": 100 },
    "tailored_cv": { "type": "string" },
    "cover_letter": { "type": "string" }
  },
  "required": ["match_score","keywords","requirements_coverage","experience","skills","tailored_cv","cover_letter"],
  "additionalProperties": false
}
\`\`\`
Return ONLY minified JSON that conforms to this schema.
`,
        },
      ],
    },
  ];

  const body = {
    model: "gpt-4o-mini",
    messages,
    temperature: Math.max(0, Math.min(1, Number(temperature || 0.5))),
    response_format: { type: "json_object" },
  };

  const content = await postJson("https://api.openai.com/v1/chat/completions", body, {
    Authorization: `Bearer ${apiKey}`,
  });

  return content;
}

async function postJson(url, body, headers = {}) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
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
      return {
        match_score: 0,
        keywords: 0,
        requirements_coverage: 0,
        experience: 0,
        skills: 0,
        tailored_cv: "",
        cover_letter: "",
      };
    }
  }
