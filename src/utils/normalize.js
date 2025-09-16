// src/utils/normalize.js
//
// פונקציות חילוץ פשוטות וללא תלויות שמחזירות סכימת JSON אחידה
// לשני סוגי טקסטים: Job Description (JD) ו-CV.
//
// API:
//   normalizeJD(text: string)  -> { lang, requirements[], skills[], years_total, raw }
//   normalizeCV(text: string)  -> { lang, skills[], years_total, raw }
//
//  - lang: "he" | "en" | "mixed"
//  - requirements: [{ text, weight }] // weight: 3 חובה, 2 רגיל, 1 יתרון
//  - skills: [{ name }]               // ייחודיים, עד 64
//  - years_total: מספר מוערך של שנות ניסיון
//  - raw: העתק נקי של הטקסט (לשמירה/אבחון)

export function normalizeJD(text = "") {
  const raw = sanitize(text);
  const lang = detectLang(raw);

  // חיתוך לשורות, איתור בולטים / שורות "דרישות" / "Requirements"
  const lines = splitLines(raw);

  const reqLines = collectRequirementLines(lines, lang);
  const requirements = reqLines.map((ln) => ({
    text: ln,
    weight: weightForRequirement(ln, lang),
  }));

  // מיומנויות מתוך דרישות/Skills/Nice to have
  const skillCandidates = collectSkillLines(lines, lang)
    .flatMap(extractTokens)
    .filter(isSkillyToken);

  const skills = uniq(skillCandidates)
    .slice(0, 64)
    .map((name) => ({ name }));

  // שנות ניסיון נדרשות (JD) — ניקח את הגבול התחתון כמינימום
  const years_total = extractYearsRequired(raw, lang);

  return { lang, requirements, skills, years_total, raw };
}

export function normalizeCV(text = "") {
  const raw = sanitize(text);
  const lang = detectLang(raw);
  const lines = splitLines(raw);

  // מיומנויות: נעדיף שורות שכותרתן skills/מיומנויות/טכנולוגיות/כלים
  const skillCandidates = collectSkillLines(lines, lang)
    .concat(lines.filter(isLikelySkillLine)) // fallback
    .flatMap(extractTokens)
    .filter(isSkillyToken);

  const skills = uniq(skillCandidates)
    .slice(0, 64)
    .map((name) => ({ name }));

  // שנות ניסיון קיימות (CV) — ננסה למצוא הכי גבוה שמוזכר
  const years_total = extractYearsHave(raw, lang);

  return { lang, skills, years_total, raw };
}

/* ───────────────────────────── Helpers ───────────────────────────── */

function sanitize(s = "") {
  return String(s)
    .replace(/\u200f|\u200e/g, "")      // סימוני RTL/LTR
    .replace(/\t/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \u00A0]+/g, " ")
    .trim();
}

function splitLines(s = "") {
  return s.split("\n").map((l) => l.trim()).filter(Boolean);
}

function detectLang(s = "") {
  const he = /[\u0590-\u05FF]/.test(s);      // עברית
  const en = /[A-Za-z]/.test(s);
  if (he && en) return "mixed";
  if (he) return "he";
  if (en) return "en";
  return "en";
}

function collectRequirementLines(lines, lang) {
  const markers = lang === "he"
    ? [/^[-*•·]\s*/, /^\d+[.)]\s*/, /דרישות/, /חובה/, /אחריות/, /נדרש/, /דרוש/, /יתרון/]
    : [/^[-*•·]\s*/, /^\d+[.)]\s*/, /requirements?/i, /responsibilit/i, /must/i, /required/i, /nice to have/i, /preferred/i];

  // קח שורות עם בולט/מספור, או אחרי כותרות "דרישות"/"Requirements"
  const out = [];
  let inReqBlock = false;

  for (const ln of lines) {
    const isHeader = markers.slice(2).some((rx) => rx.test(ln));
    const isBullet = markers[0].test(ln) || markers[1].test(ln);

    if (isHeader) {
      inReqBlock = true;
      continue;
    }
    if (isBullet || inReqBlock) {
      // עצור בלוק אם יש כותרת חדשה
      if (/^(השכלה|מיומנויות|כישורים|Skills|Education|Experience)/i.test(ln)) {
        inReqBlock = false;
        continue;
      }
      if (ln.length >= 3) out.push(stripBullet(ln));
    }
  }
  // אם לא מצאנו כלום — קח את כל השורות שיש בהן מילות חובה/יתרון
  if (!out.length) {
    for (const ln of lines) {
      if (/(חובה|נדרש|required|must|preferred|יתרון)/i.test(ln)) {
        out.push(stripBullet(ln));
      }
    }
  }
  return uniq(out);
}

function collectSkillLines(lines, lang) {
  const heHead = /(מיומנויות|כישורים|טכנולוגיות|כלים|תוכנות|מערכות)/;
  const enHead = /(skills|technolog|tools|stack|proficienc|software)/i;

  const res = [];
  let collect = false;
  for (const ln of lines) {
    const header = lang === "he" ? heHead.test(ln) : enHead.test(ln);
    if (header) {
      collect = true;
      continue;
    }
    if (collect) {
      if (/^(השכלה|ניסיון|Experience|Education|Responsibilities|Summary)/i.test(ln)) {
        collect = false;
        continue;
      }
      res.push(stripBullet(ln));
    }
  }
  // אם אין בלוק — קח שורות שנראות כמו רשימת כלים/טכנולוגיות (מופרדות בפסיקים/נקודה-פסיק)
  if (!res.length) {
    res.push(...lines.filter(isLikelySkillLine).map(stripBullet));
  }
  return res;
}

function isLikelySkillLine(ln) {
  return /[,;|·•]/.test(ln) && /[A-Za-z\u0590-\u05FF]/.test(ln);
}

function stripBullet(s = "") {
  return s.replace(/^[-*•·]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();
}

function weightForRequirement(ln, lang) {
  const hard = /(חובה|must|required)/i.test(ln);
  const nice = /(יתרון|preferred|nice to have)/i.test(ln);
  if (hard) return 3;
  if (nice) return 1;
  return 2;
}

/* ───────────────────── Years Extraction ───────────────────── */

function extractYearsRequired(text, lang) {
  // JD — קח את הגבול התחתון כמינימום
  const nums = [];
  for (const m of text.matchAll(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:years?|yrs?|שנ(?:ה|ים))/gi)) {
    const a = num(m[1]), b = num(m[2]);
    nums.push(Math.min(a, b));
  }
  for (const m of text.matchAll(/(?:at least|min(?:imum)?)\s*(\d{1,2})\s*(?:years?|yrs?)/gi)) {
    nums.push(num(m[1]));
  }
  for (const m of text.matchAll(/(\d{1,2})\s*\+\s*(?:years?|yrs?)/gi)) {
    nums.push(num(m[1]));
  }
  for (const m of text.matchAll(/(\d{1,2})\s*(?:years?|yrs?)/gi)) {
    nums.push(num(m[1]));
  }
  // Hebrew
  for (const m of text.matchAll(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*שנ(?:ה|ים)/gi)) {
    const a = num(m[1]), b = num(m[2]);
    nums.push(Math.min(a, b));
  }
  for (const m of text.matchAll(/לפחות\s*(\d{1,2})\s*שנ(?:ה|ים)/gi)) {
    nums.push(num(m[1]));
  }
  for (const m of text.matchAll(/(\d{1,2})\s*\+\s*שנ(?:ה|ים)/gi)) {
    nums.push(num(m[1]));
  }
  for (const m of text.matchAll(/(\d{1,2})\s*שנ(?:ה|ים)/gi)) {
    nums.push(num(m[1]));
  }
  if (!nums.length) return 0;
  return Math.max(0, Math.min(40, Math.max(...nums))); // דרישה: קח הגדול כמייצג
}

function extractYearsHave(text, lang) {
  // CV — קח את הערך הגבוה שמוזכר (הכי טוב עבור "מעל X שנים", "X+")
  const nums = [];
  for (const m of text.matchAll(/(\d{1,2})\s*\+\s*(?:years?|yrs?)/gi)) nums.push(num(m[1]) + 0); // +
  for (const m of text.matchAll(/(\d{1,2})\s*(?:years?|yrs?)/gi)) nums.push(num(m[1]));
  for (const m of text.matchAll(/(\d{1,2})\s*\+\s*שנ(?:ה|ים)/gi)) nums.push(num(m[1]));
  for (const m of text.matchAll(/(\d{1,2})\s*שנ(?:ה|ים)/gi)) nums.push(num(m[1]));
  if (!nums.length) return 0;
  return Math.max(0, Math.min(50, Math.max(...nums)));
}

function num(x) { return Number(String(x).replace(/[^\d]/g, "")) || 0; }

/* ───────────────────── Skills Extraction ───────────────────── */

function extractTokens(line = "") {
  // מפרק לפי מפרידים נפוצים לרשימות
  const parts = line.split(/[;|·•]|,\s*/g).flatMap((p) => p.split(/\s{2,}/g));
  return parts
    .map((p) => p.trim())
    .filter(Boolean);
}

function isSkillyToken(tok = "") {
  // נשמור מושגים טכניים/מיומנויות/ראשי תיבות/כלים: אותיות/ספרות/תווים מיוחדים . + # -
  if (!tok) return false;
  if (tok.length < 2) return false;

  // הוצאת Stopwords נפוצים (HE/EN)
  const t = tok.toLowerCase();
  if (STOPWORDS.has(t)) return false;

  // טוקנים עם סימנים טכניים, או אותיות גדולות/ראשי תיבות, או מילה ארוכה יחסית
  if (/[A-Za-z0-9][A-Za-z0-9.+#\-_/]{1,}/.test(tok)) return true;
  if (/^[A-Z]{2,}$/.test(tok)) return true;            // ראשי תיבות
  if (/[\u0590-\u05FF]/.test(tok) && tok.length >= 3) return true; // עברית באורך 3+

  return false;
}

function uniq(arr) {
  const set = new Set();
  const out = [];
  for (const x of arr) {
    const k = String(x).trim().toLowerCase();
    if (!k) continue;
    if (!set.has(k)) {
      set.add(k);
      out.push(String(x).trim());
    }
  }
  return out;
}

// סט קצר של מילות עצירה (אפשר להרחיב בהמשך)
const STOPWORDS = new Set([
  // EN
  "and","or","with","without","the","a","an","to","of","in","on","for","at","as","by","from",
  "strong","good","excellent","very","high","low","is","are","be","will","must","required","preferred","nice","have",
  "team","player","communication","skills","responsibilities","requirements","experience","education","work","job",
  // HE
  "ו","או","עם","בלי","של","על","אל","את","ב","ל","מה","יתרון","חובה","דרישות","ניסיון","השכלה","תפקיד","עבודה",
  "יכולת","יכולות","כישורים","מיומנויות","טובות","גבוהה","מצוינות","מצוינת","מסגרת","עבודה","צוות","עצמאית","מלאה",
  "משרה","שעות","שבוע","הגשת","קורות","חיים","תיאור","תפקיד","חלק","משרה","מלאה","אחריות","כ"
]);
