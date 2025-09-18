// components/ScoreMeters.jsx
import React from "react";

function Meter({ label, value }) {
  const pct = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div
        className="w-24 h-24 sm:w-28 sm:h-28 rounded-full grid place-items-center text-sm sm:text-base"
        style={{
          background: `conic-gradient(#16a34a ${pct * 3.6}deg, #e5e7eb 0deg)`,
        }}
      >
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-full grid place-items-center border border-gray-200">
          <span className="font-semibold">{pct}%</span>
        </div>
      </div>
      <div className="text-center text-xs sm:text-sm text-gray-700">{label}</div>
    </div>
  );
}

export default function ScoreMeters({ breakdown = {}, total = 0 }) {
  const items = [
    { key: "match_score", label: "Total" , val: total },
    { key: "skills_match", label: "Skills", val: breakdown.skills_match },
    { key: "experience_match", label: "Experience", val: breakdown.experience_match },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-6 w-full">
      {items.map((it) => (
        <Meter key={it.key} label={it.label} value={it.val} />
      ))}
    </div>
  );
}
