// HE/EN aware normalizer & light parser for CV/JD → unified JSON schema
// Safe, regex-first; no תלות ב־LLM. אפשר להרחיב בקלות את המילונים למטה.

//////////////////////////////
// Utilities
//////////////////////////////
const NORMALIZERS = [
  [/[״”]/g, '"'], [/[׳’]/g, "'"],
  [/[\u05BE\u2212–—-]/g, "-"],     // מקפים שונים
  [/[\u200f\u200e]/g, ""],         // סימוני כיוון
];

export function normalize(s) {
  s = String(s || "").trim();
  NORMALIZERS.forEach(([re, rep]) => (s = s.replace(re, rep)));
  return s.replace(/[ \t]+\n/g, "\n").replace(/\s{2,}/g, " ");
}

function lines(s) {
  return normalize(s).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

function uniq(arr) {
  return [...new Set(arr)];
}

//////////////////////////////
// Heuristics – dictionaries
//////////////////////////////
export const SKILL_ALIASES = {
  "ניהול צוות": ["ניהול אנשים", "Leadership", "Team Lead", "Team Leadership"],
  "ניהול פרויקטים": ["Project Management", "PM", "ניהול פרויקט"],
  "שירות לקוחות": ["Customer Service", "CS"],
  "Excel": ["אקסל", "Ms Excel", "Microsoft Excel"],
  "WordPress": ["וורדפרס", "WP"],
  "SEO": ["קידום אתרים", "Search Engine Optimization"],
  "Google Analytics": ["GA", "גוגל אנליטיקס"],
  "PowerPoint": ["פאוורפוינט", "Power Point"],
  "SQL": ["Structured Query Language", "שאילתה", "שאילתות"],
  "Adobe Photoshop": ["פוטושופ", "Photoshop"],
};

const ADV_WORDS = [
  "חובה", "required", "must", "מוכח", "proven"
];
const NICE_TO_HAVE_WORDS = [
  "יתרון", "advantage", "preferred", "nice to have"
];

//////////////////////////////
// Extraction helpers
//////////////////////////////

// ניסיון בשנים (מתוך טקסט כללי)
export function extractYears(text) {
  const t = normalize(text);
  let years = 0, evidence = null;

  // "2 שנים" / "3+ years" / "5 yrs" / "שנתיים"
  const reList = [
    /(\d{1,2})\s*\+?\s*(?:שנ(?:ה|ים)|yr?s?|years?)/gi,
    /(שנתיים)/gi
  ];
  for (const re of reList) {
    let m;
    while ((m = re.exec(t))) {
      const v = m[1] === "שנתיים" ? 2 : Number(m[1]);
      if (v > years) { years = v; evidence = m[0]; }
    }
  }
  return { years, evidence };
}

// תפקידים + טווחי תאריכים בסיסיים (YYYY או YYYY-MM)
export function extractRoles(text) {
  const L = lines(text);
  const roles = [];
  const dateRe = /(?:19|20)\d{2}(?:[-./](0?[1-9]|1[0-2]))?/; // 2019 או 2019-07

  for (const ln of L) {
    // קווים עם “2021-2024 – מנהל פרויקטים”
    const timeMatches = ln.match(new RegExp(dateRe, "g"));
    if (timeMatches && timeMatches.length >= 1) {
      const title = ln.replace(new RegExp(dateRe, "g"), "").replace(/[-–—|••]|עד|to/gi, " ").trim();
      let start = null, end = null;
      if (timeMatches.length >= 2) {
        start = normDate(timeMatches[0]);
        end = normDate(timeMatches[1]);
      } else {
        // שורה עם תאריך אחד – נניח שזה start
        start = normDate(timeMatches[0]);
      }
      if (title) roles.push({ title, start, end });
    } else {
      // bullets קלאסיים עם תפקיד: "2017-2019: ניהול חטיבת ..."
      const m = ln.match(/^(\d{4}(?:[-./](0?[1-9]|1[0-2]))?)\s*[:\-–]\s*(.+)$/);
      if (m) roles.push({ title: m[3].trim(), start: normDate(m[1]) || null, end: null });
    }
  }
  return roles;
}

function normDate(x) {
  if (!x) return null;
  const y = String(x).slice(0, 4);
  const m = String(x).match(/[-./](0?[1-9]|1[0-2])/);
  return m ? `${y}-${m[1].toString().padStart(2, "0")}` : y;
}

// מיומנויות לפי מילון נרדפים
export function extractSkills(text, preferLevel = "adv") {
  const t = normalize(text).toLowerCase();
  const out = [];
  Object.entries(SKILL_ALIASES).forEach(([canon, aliases]) => {
    const all = [canon, ...aliases].map(s => s.toLowerCase());
    if (all.some(a => t.includes(a))) {
      out.push({ name: canon, level: preferLevel });
    }
  });
  return uniqByName(out);
}

function uniqByName(arr) {
  const seen = new Set();
  return arr.filter(x => (seen.has(x.name) ? false : seen.add(x.name)));
}

// דרישות מהמשרה – מפצלים שורות/בולטים, קובעים weight ו־need_years
export function extractRequirements(jdText) {
  const rawLines = normalize(jdText).split(/[\n•·\-–—]+/).map(s => s.trim()).filter(s => s.length > 2);
  const reqs = [];
  for (const ln of rawLines) {
    const lower = ln.toLowerCase();
    const weight =
      ADV_WORDS.some(w => lower.includes(w)) ? 3 :
      NICE_TO_HAVE_WORDS.some(w => lower.includes(w)) ? 1 : 2;

    // שנים נדרשות בתוך הדרישה
    const { years } = extractYears(ln);
    reqs.push({ text: ln, weight, need_years: years || undefined });
  }
  return mergeDuplicateReqs(reqs);
}

function mergeDuplicateReqs(list) {
  const out = [];
  const seen = new Set();
  for (const r of list) {
    const key = r.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

//////////////////////////////
// Public API – what you use
//////////////////////////////

/**
 * הפקה אחידה מקורות חיים
 */
export function normalizeCV(cvText) {
  const text = normalize(cvText);
  const { years } = extractYears(text);
  const roles = extractRoles(text);
  const skills = extractSkills(text, "adv");

  return {
    years_total: years || estimateYearsFromRoles(roles),
    roles,
    skills,
    requirements: [] // לא דרוש ל־CV
  };
}

/**
 * הפקה אחידה מדרישות משרה
 */
export function normalizeJD(jdText) {
  const text = normalize(jdText);
  const requirements = extractRequirements(text);
  const needYears = requirements.reduce((acc, r) => Math.max(acc, r.need_years || 0), 0);
  const skills = extractSkills(text, "mid");
  return {
    years_total: needYears, // "סה״כ נדרש" (קירוב)
    roles: [],
    skills,
    requirements
  };
}

function estimateYearsFromRoles(roles) {
  // אומדן גס אם לא נמצאו שנים ישירות
  let total = 0;
  for (const r of roles) {
    const s = parseYearMonth(r.start);
    const e = parseYearMonth(r.end) || new Date();
    if (s) {
      const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
      total += Math.max(0, months / 12);
    }
  }
  return Math.round(total);
}

function parseYearMonth(ym) {
  if (!ym) return null;
  const m = String(ym).match(/^(\d{4})(?:-(\d{1,2}))?$/);
  if (!m) return null;
  const y = Number(m[1]), mm = Number(m[2] || "1");
  return new Date(Date.UTC(y, mm - 1, 1));
}

//////////////////////////////
// Small extras
//////////////////////////////

/**
 * טוקניזציה סקנדית – למי שצריך.
 */
export function tokenizeWords(s) {
  return normalize(s).toLowerCase().split(/[^a-z\u0590-\u05ff0-9\.\+\#]/g).filter(Boolean);
}
