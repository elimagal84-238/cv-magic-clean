// lib/scoring/bm25f.js
// Minimal BM25F with section weights. No deps.

const STOP = new Set([
  "the","a","an","and","or","to","in","on","of","for","with","by","as","at","from","is","are","was","were","be","been","being",
  "את","של","על","עם","אל","או","זה","זו","זהו","הם","הן","גם","כך","וכן","כי"
]);

export function normText(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\.\+\-#]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tok(s) {
  return normText(s)
    .split(" ")
    .filter(w => w && w.length > 1 && !STOP.has(w));
}

function tf(arr) {
  const m = new Map();
  for (const t of arr) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

function splitSectionsJD(jd) {
  // crude: try to separate **Must/Requirements** vs **Nice/Preferred**
  const text = normText(jd);
  const lines = text.split(/\n+/).map(l => l.trim());
  const must = [];
  const nice = [];
  let current = "other";
  for (const line of lines) {
    const l = line.trim();
    if (/^(requirements?|must[-\s]?have|דרישות|חובה)\b/.test(l)) current = "must";
    else if (/^(nice[-\s]?to[-\s]?have|preferred|יתרון)\b/.test(l)) current = "nice";
    if (/^[-*•]/.test(l) || current !== "other") {
      (current === "nice" ? nice : current === "must" ? must : must).push(l.replace(/^[-*•]\s*/, ""));
    }
  }
  const mustText = must.join("\n") || text;
  const niceText = nice.join("\n");
  return {
    must: tok(mustText),
    nice: tok(niceText),
    all: tok(text),
  };
}

export function bm25fScore(cvText, jdText, { wMust = 2.0, wNice = 1.0, k1 = 1.4, b = 0.75 } = {}) {
  // Build pseudo “document field” from CV
  const cvAll = tok(cvText);
  const cvLen = cvAll.length || 1;
  const tfCV = tf(cvAll);

  // Query terms from JD with field weights
  const { must, nice } = splitSectionsJD(jdText);
  const qTerms = new Map();
  for (const t of must) qTerms.set(t, (qTerms.get(t) || 0) + wMust);
  for (const t of nice) qTerms.set(t, (qTerms.get(t) || 0) + wNice);

  // IDF: no corpus → use JD self-heuristic to damp common words
  const df = new Map(); // term frequency inside JD sets
  for (const t of qTerms.keys()) df.set(t, 1 + (must.includes(t) ? 1 : 0) + (nice.includes(t) ? 0 : 0));
  const idf = (t) => Math.log(1 + 1 / df.get(t));

  let score = 0;
  for (const [t, w] of qTerms.entries()) {
    const f = tfCV.get(t) || 0;
    if (!f) continue;
    const idf_t = idf(t);
    const denom = f + k1 * (1 - b + b * (cvLen / 500));
    score += idf_t * ((f * (k1 + 1)) / denom) * w;
  }
  // Normalize roughly to 0..1 range
  return Math.max(0, Math.min(1, score / 6));
}

export function topKeywords(jdText, k = 30) {
  const arr = tok(jdText);
  const m = new Map();
  for (const t of arr) m.set(t, (m.get(t) || 0) + 1);
  return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0, k).map(([w])=>w);
}
