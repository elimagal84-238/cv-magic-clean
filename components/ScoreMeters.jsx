// components/ScoreMeters.jsx
import React from "react";

/**
 * RadialMeter – מד עגול 0..100
 */
function RadialMeter({ label, value }) {
  const clamped = Math.max(0, Math.min(100, Number(value ?? 0)));
  const r = 48;                       // רדיוס
  const c = 2 * Math.PI * r;          // היקף
  const offset = c * (1 - clamped / 100);

  return (
    <div className="flex flex-col items-center justify-center p-3 select-none">
      <div className="relative h-28 w-28">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120" role="img" aria-label={`${label} ${clamped}%`}>
          <circle cx="60" cy="60" r={r} fill="none" stroke="#eee" strokeWidth="12" />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="text-green-600 transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-semibold">{clamped}%</span>
        </div>
      </div>
      <div className="mt-2 text-sm font-medium text-gray-700">{label}</div>
    </div>
  );
}

/**
 * ScoreMeters – גריד של 5 מדי ציון
 * props.scores מצופה בצורה: { keywords, requirements, match, experience, skills }
 */
export default function ScoreMeters({ scores = {} }) {
  const {
    keywords = 0,
    requirements = 0,
    match = 0,
    experience = 0,
    skills = 0,
  } = scores;

  const items = [
    { key: "keywords",    label: "Keywords",    value: keywords },
    { key: "requirements",label: "Requirements",value: requirements },
    { key: "match",       label: "Match",       value: match },
    { key: "experience",  label: "Experience",  value: experience },
    { key: "skills",      label: "Skills",      value: skills },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
      {items.map((it) => (
        <div key={it.key} className="rounded-xl shadow border bg-white p-4">
          <RadialMeter label={it.label} value={it.value} />
        </div>
      ))}
    </div>
  );
}
