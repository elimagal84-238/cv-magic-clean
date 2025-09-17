// components/ScoreMeters.jsx
import React from "react";
import ProgressRing from "./ProgressRing";

function clamp100(n) {
  n = Number(n ?? 0);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export default function ScoreMeters({ scores }) {
  const s = {
    keywords: clamp100(scores?.keywords),
    requirements: clamp100(scores?.requirements),
    match: clamp100(scores?.match ?? scores?.overall),
    experience: clamp100(scores?.experience),
    skills: clamp100(scores?.skills),
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 mt-4">
      <ProgressRing label="Keywords"    value={s.keywords}    colorClass="text-emerald-600" />
      <ProgressRing label="Requirements" value={s.requirements} colorClass="text-emerald-600" />
      <ProgressRing label="Match"       value={s.match}       colorClass="text-emerald-600" />
      <ProgressRing label="Experience"  value={s.experience}  colorClass="text-emerald-600" />
      <ProgressRing label="Skills"      value={s.skills}      colorClass="text-amber-600" />
    </div>
  );
}
