// lib/core.js
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function safeParseJson(jsonish) {
  if (!jsonish) return null;
  if (typeof jsonish === "object") return jsonish;
  const s = String(jsonish).trim();
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}$/); // האובייקט האחרון במחרוזת
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  // ריכוך גרשיים בודדים
  const soft = s
    .replace(/([{,\s])'([^']+?)'\s*:/g, (all, p1, p2) => `${p1}"${p2}":`)
    .replace(/:\s*'([^']+?)'/g, (all, p1) => `:"${p1}"`);
  try { return JSON.parse(soft); } catch {}
  return null;
}

async function postJson(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export function buildPrompt({ jobText, cvText, volume }) {
  return `You are an ATS-style evaluator and resume rewriter.
Return STRICT JSON with keys: analysis, adapted_cv, cover_letter.

analysis must include:
- match_score (0-100, integer)
- strengths (string[])
- gaps (string[])
- recommendations (string[])
- skills_match (0-100, integer)
- experience_match (0-100, integer)
- keywords_match (0-100, integer)

Rules:
- Be concise and concrete. Bullet points are welcome.
- Preserve truthful facts; do not invent employment or education.
- Write outputs in the SAME language as the JOB POSTING.

# Volume (1-9): ${volume}

JOB POSTING:
${jobText}

RESUME:
${cvText}`;
}

export function buildDoubleCheckPrompt({ jobText, adapted }) {
  return `You are an ATS-style evaluator.
Return STRICT JSON with keys: analysis, adapted_cv, cover_letter.
- Only analyze the ADAPTED CV against the JOB POSTING.
- Copy adapted_cv = input ADAPTED CV as-is.
- Set cover_letter = "".

analysis must include: match_score, strengths, gaps, recommendations, skills_match, experience_match, keywords_match.

JOB POSTING:
${jobText}

ADAPTED CV TO CHECK:
${adapted || "(empty)"}`;
}

export async function runMatch({ jobText, cvText, model, volume, temperature = 0.5 }) {
  const { content } = await postJson("/api/openai-match", {
    model,
    temperature,
    prompt: buildPrompt({ jobText, cvText, volume }),
  });
  const parsed = safeParseJson(content);
  if (!parsed) throw new Error("פלט לא תקין מהמודל (לא JSON)");

  const a = parsed.analysis || {};
  return {
    score: clamp(Number(a.match_score) || 0, 0, 100),
    subscores: {
      skills: clamp(Number(a.skills_match) || 0, 0, 100),
      experience: clamp(Number(a.experience_match) || 0, 0, 100),
      keywords: clamp(Number(a.keywords_match) || 0, 0, 100),
    },
    strengths: Array.isArray(a.strengths) ? a.strengths : [],
    gaps: Array.isArray(a.gaps) ? a.gaps : [],
    recommendations: Array.isArray(a.recommendations) ? a.recommendations : [],
    adjustedCV: String(parsed.adapted_cv || ""),
    coverLetter: String(parsed.cover_letter || ""),
  };
}

export async function runDoubleCheck({ jobText, lastAdjustedCv, model, temperature = 0.5 }) {
  const { content } = await postJson("/api/openai-match", {
    model,
    temperature,
    prompt: buildDoubleCheckPrompt({ jobText, adapted: lastAdjustedCv }),
  });
  const parsed = safeParseJson(content);
  if (!parsed) throw new Error("פלט לא תקין מהמודל (לא JSON)");

  const a = parsed.analysis || {};
  return {
    score: clamp(Number(a.match_score) || 0, 0, 100),
    subscores: {
      skills: clamp(Number(a.skills_match) || 0, 0, 100),
      experience: clamp(Number(a.experience_match) || 0, 0, 100),
      keywords: clamp(Number(a.keywords_match) || 0, 0, 100),
    },
    adjustedCV: String(parsed.adapted_cv || lastAdjustedCv || ""),
  };
}
