// lib/scoring/skills.js
// Lightweight skills normalizer + synonyms. No external taxonomy required (can plug ESCO/Lightcast later).

import { normText } from "./bm25f";

const SKILL_SYNONYMS = [
  ["javascript","js","ecmascript"],
  ["typescript","ts"],
  ["react","reactjs"],
  ["node","nodejs","node.js"],
  ["next","nextjs","next.js"],
  ["docker","containers"],
  ["kubernetes","k8s"],
  ["sql","postgresql","postgres","mysql","mariadb","mssql"],
  ["python","pandas","numpy"],
  ["java"],
  ["c#",".net","dotnet"],
  ["c++"],
  ["go","golang"],
  ["aws","ec2","s3","iam","lambda"],
  ["gcp","bigquery","gcs"],
  ["azure"],
  ["graphql"],
  ["rest","restful"],
  ["microservices","event-driven","kafka","rabbitmq"],
  ["agile","scrum","jira"],
  ["excel","power-bi","tableau"],
  ["seo","sem","ppc"],
  ["figma","photoshop"],
  // Hebrew hints
  ["אקסל"],["דוקר"],["קוברנטיס"],["ניהול פרויקטים"],["שיווק"],["מכירות"],["דאטה"]
];

const CANON = new Map();
for (const group of SKILL_SYNONYMS) {
  const [canon, ...alts] = group;
  for (const s of group) CANON.set(s, canon);
}

export function extractSkills(text = "") {
  const t = " " + normText(text) + " ";
  const found = new Set();
  for (const s of CANON.keys()) {
    const esc = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\W)${esc}(?=$|\\W)`, "i");
    if (re.test(t)) found.add(CANON.get(s));
  }
  return found; // canonical set
}

export function coverage(jdText, cvText) {
  const need = extractSkills(jdText);
  const have = extractSkills(cvText);
  const matched = new Set([...need].filter(x => have.has(x)));
  const missing = new Set([...need].filter(x => !have.has(x)));
  const recall = need.size ? matched.size / need.size : 0;
  return { need, have, matched, missing, recall };
}
