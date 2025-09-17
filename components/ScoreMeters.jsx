// components/ScoreMeters.jsx
import React from "react";

/** עיגול מדד אחד */
function Meter({ label, value = 0 }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const R = 54;           // רדיוס
  const C = 2 * Math.PI * R; // היקף
  const off = C * (1 - v / 100);

  return (
    <div className="flex flex-col items-center justify-center">
      <svg viewBox="0 0 120 120" className="w-28 h-28">
        {/* מסגרת אפורה */}
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="10"
        />
        {/* קשת ירוקה – מתקדמת לפי value */}
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke="#22c55e"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={off}
          transform="rotate(-90 60 60)"
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
        {/* הנקודה האדומה למעלה */}
        <circle cx="60" cy="10" r="5" fill="#ef4444" />
        {/* הערך באמצע */}
        <text
          x="60"
          y="62"
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
          fill="#111827"
        >
          {v}%
        </text>
      </svg>
      <div className="mt-2 text-sm font-semibold text-gray-800">{label}</div>
    </div>
  );
}

/** שורת 4 המדים */
export function ScoreMeters({
  keywords = 0,
  requirements = 0,
  match = 0,
  experience = 0,
  skills = 0,
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
      <Meter label="Keywords" value={keywords} />
      <Meter label="Requirements" value={requirements} />
      <Meter label="Match" value={match} />
      <Meter label="Experience" value={experience} />
      <Meter label="Skills" value={skills} />
    </div>
  );
}
