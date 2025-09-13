// components/matcher/ResultsDisplay.jsx
import React from 'react';

export default function ResultsDisplay({
  generatedContent = {},
  isGenerating = {},
  onCopy,
  onAnalyzeGenerated,
  isAnalyzing = false,
}) {
  const { tailored_cv = '', cover_letter = '' } = generatedContent;

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {/* קו״ח מותאמים */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-800">קורות חיים מותאמים</h3>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
              onClick={() => onCopy?.(tailored_cv)}
              disabled={!tailored_cv}
            >
              העתק
            </button>
            <button
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={onAnalyzeGenerated}
              disabled={!tailored_cv || isAnalyzing}
            >
              {isAnalyzing ? 'בודק…' : 'בדוק התאמה'}
            </button>
          </div>
        </div>
        <textarea
          className="h-72 w-full resize-y rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-blue-500"
          readOnly
          value={isGenerating.tailored_cv ? 'יוצר תוכן…' : tailored_cv}
          placeholder="כאן יופיעו קורות החיים המותאמים"
        />
      </div>

      {/* מכתב מקדים */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-800">מכתב מקדים</h3>
          <button
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            onClick={() => onCopy?.(cover_letter)}
            disabled={!cover_letter}
          >
            העתק
          </button>
        </div>
        <textarea
          className="h-72 w-full resize-y rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-blue-500"
          readOnly
          value={isGenerating.cover_letter ? 'יוצר תוכן…' : cover_letter}
          placeholder="כאן יופיע המכתב המקדים"
        />
      </div>
    </div>
  );
}
