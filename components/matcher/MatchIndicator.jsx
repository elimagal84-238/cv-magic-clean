// components/matcher/MatchIndicator.jsx
import React from 'react';

export default function MatchIndicator({ score, analysis, isAnalyzing }) {
  const safeScore =
    typeof score === 'number' && !Number.isNaN(score) ? Math.max(0, Math.min(100, score)) : null;

  const color =
    safeScore == null
      ? 'text-gray-500'
      : safeScore >= 80
      ? 'text-green-600'
      : safeScore >= 60
      ? 'text-amber-600'
      : 'text-red-600';

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-800">מדד התאמה</h3>
        {isAnalyzing && (
          <span className="text-xs text-gray-500">מחשב ניתוח…</span>
        )}
      </div>

      {/* עיגול ציון פשוט */}
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-gray-200">
          <span className={`text-2xl font-semibold ${color}`}>
            {safeScore == null ? '—' : safeScore}
          </span>
        </div>

        <div className="text-sm text-gray-700">
          {safeScore == null ? (
            <p>הדבק דרישות משרה וקו״ח כדי לחשב ציון.</p>
          ) : (
            <p>
              {safeScore >= 80
                ? 'התאמה גבוהה מאוד.'
                : safeScore >= 60
                ? 'התאמה טובה—יש מקום לשיפור.'
                : 'התאמה נמוכה—כדאי לחזק את קו״ח.'}
            </p>
          )}
          {analysis?.summary && (
            <p className="mt-1 text-gray-600">{analysis.summary}</p>
          )}
        </div>
      </div>

      {/* פירוט נומרי אם קיים */}
      {(analysis?.skills_match ||
        analysis?.experience_match ||
        analysis?.keywords_match) && (
        <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-3">
          {typeof analysis.skills_match === 'number' && (
            <div className="rounded-lg border border-gray-200 p-2">
              <div className="text-xs text-gray-500">מיומנויות</div>
              <div className="font-medium">{analysis.skills_match}%</div>
            </div>
          )}
          {typeof analysis.experience_match === 'number' && (
            <div className="rounded-lg border border-gray-200 p-2">
              <div className="text-xs text-gray-500">ניסיון</div>
              <div className="font-medium">{analysis.experience_match}%</div>
            </div>
          )}
          {typeof analysis.keywords_match === 'number' && (
            <div className="rounded-lg border border-gray-200 p-2">
              <div className="text-xs text-gray-500">מילות מפתח</div>
              <div className="font-medium">{analysis.keywords_match}%</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
