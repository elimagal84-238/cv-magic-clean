// pages/api/openai-match.js
// Generates tailored CV & cover letter based on CV + Job Description.
// Uses OpenAI Responses API with a strict JSON schema.

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
};

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function volumeToParams(v = 5) {
  const clamped = Math.max(1, Math.min(9, Number(v) || 5));
  // gentle ramp: 1→0.1 … 9→0.9
  const temperature = 0.1 + (clamped - 1) * (0.8 / 8);
  const freqPenalty = (clamped - 1) * (0.8 / 8);
  return { temperature, frequency_penalty: Number(freqPenalty.toFixed(2)) };
}

const responseFormat = {
  type: "json_schema",
  json_schema: {
    name: "TailoredCVResponse",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        tailored_cv: { type: "string" },
        cover_letter: { type: "string" },
        suggestions: {
          type: "array",
          items: { type: "string" },
        },
        highlights: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["tailored_cv", "cover_letter", "suggestions"],
    },
    strict: true,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { cvText, jdText, volume = 5, model = DEFAULT_MODEL, target = "cv+cover" } = req.body || {};
    if (!cvText || !jdText) return res.status(400).json({ error: "Missing cvText or jdText" });

    const { temperature, frequency_penalty } = volumeToParams(volume);

    const system = [
      "You are CV-Magic: a precise ATS-aware CV rewriter.",
      "Rules:",
      "- Never invent employment or degrees; rephrase only.",
      "- Keep structure clean: Header, Summary, Skills, Experience (bullets with impact), Education, Certifications.",
      "- Mirror JD terminology safely (synonyms ok; no fabrication).",
      "- Optimize for clarity, quantification, and ATS keyword coverage.",
      "- If JD demands skills absent from CV, add a SUGGESTIONS list (not inside the CV).",
    ].join("\n");

    const user = [
      "=== JOB DESCRIPTION ===",
      jdText,
      "\n=== ORIGINAL CV ===",
      cvText,
      "\n=== TARGET ===",
      String(target),
    ].join("\n");

    const r = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: responseFormat,
        temperature,
        frequency_penalty,
      }),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return res.status(r.status).json({ error: "OpenAI error", details: text });
    }

    const data = await r.json();
    // Responses API returns .output_text (for text) and/or .output (for structured)
    const parsed =
      data.output?.[0]?.content?.[0]?.text
        ? JSON.parse(data.output[0].content[0].text)
        : data.output_parsed || data; // fallback

    return res.status(200).json({
      ok: true,
      model,
      params: { temperature, frequency_penalty },
      result: parsed,
    });
  } catch (err) {
    console.error("openai-match error", err);
    return res.status(500).json({ error: "Server error", details: String(err && err.message || err) });
  }
}
