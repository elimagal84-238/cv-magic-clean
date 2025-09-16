// pages/api/openai-match.js
// CV-Magic — Universal ATS API (HE/EN aware), no external deps
// POST { job_description, cv_text } -> { match_score, skills_match, keywords_match, experience_match, requirements_match, strengths, gaps }

export const config = { runtime: 'edge' };

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const uniq = (arr) => Array.from(new Set(arr));
const intersection = (A, B) => {
  const b = new Set(B), out = [];
  for (const x of new Set(A)) if (b.has(x)) out.push(x);
  return out;
};

function normalizeText(s) {
  return String(s || '')
    .replace(/\r/g, '\n')
    .replace(/[\u0591-\u05C7]/g, '')      // Hebrew niqqud
    .replace(/[–—]/g, '-')                 // dashes
    .replace(/[“”„‟"״]/g, '"')
    .replace(/[’׳']/g, "'")
    .replace(/[·•▪◦●]/g, '•')
    .replace(/\u200f|\u200e/g, '')         // RTL marks
    .toLowerCase();
}

const STOP_HE = new Set([
  'של','עם','על','גם','או','אם','כך','כדי','כי','אז','זו','זה','וה','ו','לא','בלי','הם','הן','הוא','היא','אני','אנחנו',
  'אתם','אתן','את','אתה','אותו','אותה','אותם','אותן','כל','עוד','אך','אבל','מאוד','יותר','פחות','וכן','כמו','ללא','יש','אין',
  'ב','ל','כ','מ','מה','כאשר','שהוא','שהיא','שלה','שלהם','שלו','שלכם','שלכן','הזה','הזו','האלה','אלה','זהו','זוהי','וכו','וכו׳'
]);
const STOP_EN = new Set([
  'the','a','an','to','of','in','on','at','for','and','or','but','is','are','be','as','by','with','this','that','these','those',
  'from','it','its','your','their','our','my','me','we','you','i','was','were','been','will','can','could','should','would',
  'about','over','under','per'
]);

function tokenize(s) {
  const t = normalizeText(s);
  const raw = t.split(/[^0-9a-z\u0590-\u05FF]+/i).filter(Boolean);
  const out = [];
  for (const w of raw) {
    if (STOP_HE.has(w) || STOP_EN.has(w)) continue;
    const ww = w.replace(/^['"]+|['"]+$/g, '');
    if (ww) out.push(ww);
  }
  return out;
}

function ngrams(tokens, n) {
  const out = [];
  for (let i = 0; i <= tokens.length - n; i++) out.push(tokens.slice(i, i + n).join(' '));
  return out;
}

function splitRequirements(text) {
  const t = normalizeText(text);
  const bullet = t.split(/\n+/).map(x => x.trim()).filter(Boolean).filter(x => /^[•\-\*\d\.)]/.test(x));
  if (bullet.length >= 2) return bullet;
  return t.split(/(?<=[\.\!\?]|[\n\r])/)
    .map(x => x.replace(/^[•\-\*\d\.)\s]+/, '').trim())
    .filter(x => x.split(/\s+/).length >= 3);
}

function extractYears(s) {
  const t = normalizeText(s), hits = [];
  t.replace(/(\d{1,2})\s*(?:שנים|שנה|שנת)/g, (_, n) => (hits.push(+n), _));
  t.replace(/(\d{1,2})\s*(?:years?|yrs?)/g,      (_, n) => (hits.push(+n), _));
  return hits;
}

const STATIC_SKILLS = new Set([
  // tech/office
  'excel','word','powerpoint','outlook','sql','crm','erp','sap','oracle','salesforce','tableau','powerbi',
  'jira','confluence','git','docker','kubernetes','python','javascript','react','node','java','.net','c#',
  'ga4','seo','sem',
  // general/business (he/en)
  'שירות','שירות לקוחות','ניהול','ניהול צוות','ניהול פרויקטים','תפעול','בקרה','דוחות','תקציב','הדרכה',
  'סדר וארגון','עמידה בלחץ','תקשורת בין אישית','משמרות','קבלת החלטות','נהלים','רכש','מלאי','מכירות',
  'front desk','housekeeping','pos','קבלה','אדמיניסטרציה','שיווק','עבודה בצוות','english','אנגלית','עברית','arabic','russian'
]);

function jaccardScore(aTokens, bTokens) {
  const A = uniq(aTokens), B = uniq(bTokens);
  if (!A.length || !B.length) return 0;
  const inter = intersection(A, B).length;
  const uni = uniq([...A, ...B]).length;
  return clamp((inter / Math.max(1, uni)) * 100);
}

function skillsScore(jdTokens, cvTokens) {
  const jdSet = new Set(jdTokens), cvSet = new Set(cvTokens);
  const staticJD = [];
  for (const s of STATIC_SKILLS) if (jdSet.has(s)) staticJD.push(s);
  const dyn = ngrams(jdTokens, 2).concat(ngrams(jdTokens, 3)).filter(p => !/^\d/.test(p) && !p.includes(' משרה '));
  const cand = uniq(staticJD.concat(dyn)).slice(0, 200);
  if (!cand.length) return 0;
  let hits = 0;
  for (const c of cand) {
    if (c.includes(' ')) {
      const parts = c.split(' ');
      if (parts.every(w => cvSet.has(w))) hits++;
    } else if (cvSet.has(c)) hits++;
  }
  return clamp((hits / cand.length) * 100);
}

function requirementsCoverage(jdText, cvTokens) {
  const reqs = splitRequirements(jdText);
  if (!reqs.length) return 0;
  const cvSet = new Set(cvTokens);
  let covered = 0;
  for (const r of reqs) {
    const rTok = tokenize(r);
    if (!rTok.length) continue;
    const rSet = new Set(rTok);
    const inter = Array.from(rSet).filter(x => cvSet.has(x)).length;
    const uni = uniq([...rSet, ...cvSet]).length;
    const sim = inter / Math.max(1, uni);
    if (sim >= 0.35) covered++;
  }
  return clamp((covered / reqs.length) * 100);
}

function experienceScore(jdText, cvText) {
  const jy = extractYears(jdText), cy = extractYears(cvText);
  const j = jy.length ? Math.max(...jy) : 0;
  const c = cy.length ? Math.max(...cy) : 0;
  if (!j && !c) return 50;
  if (!j) return 70;
  if (!c) return 30;
  const r = c / j;
  if (r >= 1.2) return 90;
  if (r >= 1.0) return 75;
  if (r >= 0.7) return 55;
  return 35;
}

const WEIGHTS = { keywords: 0.25, skills: 0.30, requirements: 0.25, experience: 0.20 };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
  }
  const { job_description = '', cv_text = '' } = await req.json().catch(() => ({}));
  const jdText = String(job_description || ''), cvText = String(cv_text || '');
  const jdTokens = tokenize(jdText), cvTokens = tokenize(cvText);

  const scores = {
    keywords: jaccardScore(jdTokens, cvTokens),
    skills:    skillsScore(jdTokens, cvTokens),
    requirements: requirementsCoverage(jdText, cvTokens),
    experience:   experienceScore(jdText, cvText),
  };
  const match_score = clamp(
    scores.keywords * WEIGHTS.keywords +
    scores.skills * WEIGHTS.skills +
    scores.requirements * WEIGHTS.requirements +
    scores.experience * WEIGHTS.experience
  );

  const strengths = [], gaps = [];
  (scores.skills >= 40)      ? strengths.push('Skills align with the role.')
                             : gaps.push('Important skills are missing or not explicitly mentioned.');
  (scores.requirements >= 50)? strengths.push('Many job requirements are covered.')
                             : gaps.push('Some job requirements are not addressed in the CV.');
  (scores.experience >= 55)  ? strengths.push('Experience level seems adequate.')
                             : gaps.push('Experience might be below the expectation.');

  return new Response(JSON.stringify({
    match_score: Math.round(match_score),
    skills_match: Math.round(scores.skills),
    keywords_match: Math.round(scores.keywords),
    experience_match: Math.round(scores.experience),
    requirements_match: Math.round(scores.requirements),
    strengths, gaps,
  }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
}
