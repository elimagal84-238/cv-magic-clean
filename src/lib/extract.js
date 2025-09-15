// src/lib/extract.js
// Lightweight structured extraction (JS, CommonJS)
const HEB_ENG_WORD = /[A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF0-9+\-/#.]*/g;
const SENT_SPLIT = /(?<=\.|\?|!|:|\n)\s+/g;

function tokenize(t) {
  const m = (t || "")
    .toLowerCase()
    .replace(/[^A-Za-z0-9\u0590-\u05FF+\-/#.\s]/g, " ")
    .match(HEB_ENG_WORD);
  return m ? m : [];
}
function splitSentences(t) {
  return (t || "").split(SENT_SPLIT).map((s) => s.trim()).filter(Boolean);
}
function extractBulletedRequirements(t) {
  const lines = (t || "").split(/\n/).map((l) => l.trim());
  return lines
    .filter((l) => /^(\*|\-|\•|\d+\.)\s+/u.test(l))
    .map((l) => l.replace(/^(\*|\-|\•|\d+\.)\s+/u, "").trim())
    .filter(Boolean);
}
function extractYears(t) {
  const hits = t.match(/\b(\d{1,2})\s*(?:yrs?|years?|שנים)\b/gi) || [];
  return hits.map((m) => parseInt(m, 10)).filter((n) => !isNaN(n));
}
function extractTitles(t) {
  const hits =
    t.match(/\b(Developer|Engineer|Manager|Director|Lead|Analyst|Designer|Product|Marketing|Sales|Operations)\b/gi) ||
    [];
  return Array.from(new Set(hits.map((s) => s.toLowerCase())));
}

const fs = require("fs");
const path = require("path");
function loadSkillsTaxonomy() {
  const p = path.join(process.cwd(), "src", "lib", "skills-taxonomy.json");
  try {
    const s = fs.readFileSync(p, "utf8");
    return JSON.parse(s);
  } catch {
    return [];
  }
}
const SKILLS = loadSkillsTaxonomy();

function extractSkillsByTaxonomy(tokens) {
  const set = new Set(tokens);
  const out = [];
  for (const skill of SKILLS) {
    const key = String(skill).toLowerCase();
    if (set.has(key)) out.push(skill);
  }
  return Array.from(new Set(out));
}

function extractAll(jd, cv) {
  const jdTokens = tokenize(jd);
  const cvTokens = tokenize(cv);
  return {
    jd: {
      requirements: extractBulletedRequirements(jd),
      skills: extractSkillsByTaxonomy(jdTokens),
      titles: extractTitles(jd),
      years: extractYears(jd),
      tokens: jdTokens,
    },
    cv: {
      sentences: splitSentences(cv),
      skills: extractSkillsByTaxonomy(cvTokens),
      titles: extractTitles(cv),
      years: extractYears(cv),
      tokens: cvTokens,
    },
  };
}

module.exports = { extractAll, tokenize };
