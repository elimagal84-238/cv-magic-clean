// src/lib/extract.ts
// Lightweight structured extraction (no LLM yet). v0.1
export type Extracted = {
  jd: {
    requirements: string[];
    skills: string[];
    titles: string[];
    years: number[];
    tokens: string[];
  };
  cv: {
    sentences: string[];
    skills: string[];
    titles: string[];
    years: number[];
    tokens: string[];
  };
};

const HEB_ENG_WORD = /[A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF0-9+\-/#.]*/g;

export function tokenize(t: string): string[] {
  return (t || "")
    .toLowerCase()
    .replace(/[^A-Za-z0-9\u0590-\u05FF+\-/#.\s]/g, " ")
    .match(HEB_ENG_WORD) || [];
}

const SENT_SPLIT = /(?<=\.|\?|!|:|\n)\s+/g;

function splitSentences(t: string): string[] {
  return (t || "")
    .split(SENT_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractBulletedRequirements(t: string): string[] {
  const lines = (t || "").split(/\n/).map((l) => l.trim());
  return lines
    .filter((l) => /^(\*|\-|\•|\d+\.)\s+/u.test(l))
    .map((l) => l.replace(/^(\*|\-|\•|\d+\.)\s+/u, "").trim())
    .filter((l) => l.length > 0);
}

function extractYears(t: string): number[] {
  return (t.match(/\b(\d{1,2})\s*(?:yrs?|years?|שנים)\b/gi) || [])
    .map((m) => parseInt(m, 10))
    .filter((n) => !isNaN(n));
}

function extractTitles(t: string): string[] {
  const hits = (t.match(/\b(Developer|Engineer|Manager|Director|Lead|Analyst|Designer|Product|Marketing|Sales|Operations)\b/gi) || []);
  return Array.from(new Set(hits.map((s) => s.toLowerCase())));
}

import skillsTaxonomy from "./skills-taxonomy.json";

function extractSkillsByTaxonomy(tokens: string[]): string[] {
  const set = new Set(tokens);
  const found: string[] = [];
  for (const skill of skillsTaxonomy) {
    const key = skill.toLowerCase();
    if (set.has(key)) found.push(skill);
  }
  return Array.from(new Set(found));
}

export function extractAll(jd: string, cv: string): Extracted {
  const jdTokens = tokenize(jd);
  const cvTokens = tokenize(cv);

  const jdRequirements = extractBulletedRequirements(jd);
  const jdYears = extractYears(jd);
  const jdTitles = extractTitles(jd);
  const jdSkills = extractSkillsByTaxonomy(jdTokens);

  const cvSentences = splitSentences(cv);
  const cvYears = extractYears(cv);
  const cvTitles = extractTitles(cv);
  const cvSkills = extractSkillsByTaxonomy(cvTokens);

  return {
    jd: {
      requirements: jdRequirements,
      skills: jdSkills,
      titles: jdTitles,
      years: jdYears,
      tokens: jdTokens,
    },
    cv: {
      sentences: cvSentences,
      skills: cvSkills,
      titles: cvTitles,
      years: cvYears,
      tokens: cvTokens,
    },
  };
}
