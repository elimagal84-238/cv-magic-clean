// components/matcher/InputSource.jsx
import React, { useRef } from 'react';

export default function InputSource({
  title = '',
  icon = null,
  placeholder = '',
  value = '',
  onTextChange,
  onFileSelect,      // async (file) => void  | מסופק על-ידך מבחוץ
  onUrlFetch,        // async (url) => void   | מסופק על-ידך מבחוץ
  isProcessingFile = false,
  isProcessingUrl = false,
}) {
  const fileRef = useRef(null);
  const urlRef = useRef(null);

  const handleFileClick = () => fileRef.current?.click();
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && onFileSelect) onFileSelect(file);
    e.target.value = ''; // איפוס
  };

  const handleUrlFetch = () => {
    const url = urlRef.current?.value?.trim();
    if (!url) return;
    onUrlFetch?.(url);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* כותרת */}
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-medium text-gray-800">{title}</h3>
      </div>

      {/* טקסט-אריאה */}
      <textarea
        className="h-40 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onTextChange?.(e.target.value)}
        dir="auto"
      />

      {/* שורת פעולות */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        {/* העלאת קובץ */}
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.rtf"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={handleFileClick}
            disabled={isProcessingFile}
            className={`rounded-md border px-3 py-1.5 text-sm transition
              ${isProcessingFile
                ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'}`}
          >
            {isProcessingFile ? 'טוען קובץ…' : 'בחר קובץ'}
          </button>
        </div>

        {/* קלט URL + כפתור */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <input
            ref={urlRef}
            type="url"
            placeholder="הדבק כתובת URL…"
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 sm:w-64"
          />
          <button
            type="button"
            onClick={handleUrlFetch}
            disabled={isProcessingUrl}
            className={`rounded-md border px-3 py-1.5 text-sm transition
              ${isProcessingUrl
                ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'}`}
          >
            {isProcessingUrl ? 'טוען…' : 'טען מ-URL'}
          </button>
        </div>
      </div>
    </div>
  );
}

