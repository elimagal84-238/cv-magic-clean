// components/ProgressRing.jsx
import React from "react";

function clamp100(n) {
  n = Number(n ?? 0);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export default function ProgressRing({
  value = 0,
  label = "",
  size = 140,
  stroke = 12,
  colorClass = "text-emerald-600",
}) {
  const pct = clamp100(value);
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const dash = c * (pct / 100);
  const gap = c - dash;

  return (
    <div className="flex flex-col items-center select-none">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {/* Track */}
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#E5E7EB" strokeWidth={stroke} fill="none" />
        {/* Progress */}
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            className={colorClass}
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${dash} ${gap}`}
            style={{ transition: "stroke-dasharray .8s ease" }}
          />
        </g>
      </svg>
      <div className="mt-2 text-sm font-medium text-gray-600">{label}</div>
      <div className="text-xl font-bold">{pct}%</div>
    </div>
  );
}
