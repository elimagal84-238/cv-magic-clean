// components/ScoreMeters.jsx
import React from "react";

/**
 * Gauge עגול פשוט עבור ערכים 0..100
 */
function Gauge({ label, value = 0 }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dash = (v / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center">
      <svg viewBox="0 0 120 120" className="w-28 h-28">
        <circle
          cx="60"
          cy="60"
          r={radius}
          stroke="#eee"
          strokeWidth="12"
          fill="none"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          stroke="#22c55e"
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform="rotate(-90 60 60)"
        />
        <text
          x="60"
          y="64"
          textAnchor="middle"
          fontSize="22"
          fontWeight="700"
          fill="#ef4444"
        >
          {v}%
        </text>
      </svg>
      <div className="mt-1 text-sm font-medium text-gray-700">{label}</div>
    </div>
  );
}

/**
 * קומפוננטת המטרים – מקבלת 4 ערכים (0..100)
 */
export default function ScoreMeters({
  keywords = 0,
  requirements = 0,
  match = 0,
  experience = 0,
  skills = 0,
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
      <Gauge label="Keywords" value={keywords} />
      <Gauge label="Requirements" value={requirements} />
      <Gauge label="Match" value={match} />
      <Gauge label="Experience" value={experience} />
      <Gauge label="Skills" value={skills} />
    </div>
  );
}
