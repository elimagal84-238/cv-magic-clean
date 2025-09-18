// lib/core.js
export async function postJson(url, body, opts = {}) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const details = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText} :: ${details}`);
  }
  return r.json();
}

export async function scoreMatch(cvText, jdText) {
  return postJson("/api/score-match", { cvText, jdText });
}

export async function runMatch(cvText, jdText, { volume = 5, model, target = "cv+cover" } = {}) {
  return postJson("/api/openai-match", { cvText, jdText, volume, model, target });
}
