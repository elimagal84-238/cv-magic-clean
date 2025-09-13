// components/matcher/GenerationControls.jsx
import React from 'react';

export default function GenerationControls({
  selectedModel,
  setSelectedModel,
  onGenerateCV,
  onGenerateCoverLetter,
  isGenerating = {},
  disabled = false,
  freedomLevel = 5,
  setFreedomLevel,
}) {
  return (
    <div className="mt-6 w-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 text-sm font-medium text-gray-800">כלי יצירה</h3>

      {/* שורת בחירת מודל */}
      <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <label className="text-sm text-gray-600">מודל שפה:</label>
        <select
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm sm:w-auto"
          value={selectedModel}
          onChange={(e) => setSelectedModel?.(e.target.value)}
        >
          <option value="gpt-4">OpenAI GPT-4</option>
          <option value="gpt-4o-mini">OpenAI GPT-4o mini</option>
          <option value="claude-3.5">Anthropic Claude 3.5</option>
          <option value="gemini-1.5-pro">Google Gemini 1.5 Pro</option>
          <option value="groq-llama3.1-70b">Groq Llama 3.1-70B</option>
        </select>
      </div>

      {/* סליידר דרגת חופש */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-sm text-gray-600">דרגת חופש לעריכה</label>
          <span className="text-xs text-gray-500">{freedomLevel}/10</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={freedomLevel}
          onChange={(e) => setFreedomLevel?.(Number(e.target.value))}
          className="w-full"
        />
        <div className="mt-1 text-xs text-gray-500">
          נמוך = שינויים עדינים | גבוה = התאמה חופשית יותר
        </div>
      </div>

      {/* כפתורים */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => onGenerateCV?.(freedomLevel)}
          disabled={disabled || isGenerating.tailored_cv}
          className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white transition
            ${disabled || isGenerating.tailored_cv ? 'bg-gray-300' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {isGenerating.tailored_cv ? 'יוצר קו״ח מותאמים…' : 'צור קו״ח מותאמים'}
        </button>

        <button
          type="button"
          onClick={() => onGenerateCoverLetter?.(freedomLevel)}
          disabled={disabled || isGenerating.cover_letter}
          className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition
            ${disabled || isGenerating.cover_letter ? 'bg-gray-100 text-gray-400 border border-gray-200' : 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-50'}`}
        >
          {isGenerating.cover_letter ? 'יוצר מכתב מקדים…' : 'צור מכתב מקדים'}
        </button>
      </div>
    </div>
  );
}
