// components/matcher/InputSource.jsx
import React from 'react';

export default function InputSource({
  title,
  icon,
  placeholder,
  value,
  onTextChange,
  onFileSelect,
  onUrlFetch,
  isProcessingFile,
  isProcessingUrl,
}) {
  const [url, setUrl] = React.useState('');

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (file && onFileSelect) onFileSelect(file);
  };

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    if (url && onUrlFetch) onUrlFetch(url);
  };

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-medium text-gray-800">{title}</h3>
      </div>

      {/* textarea */}
      <textarea
        className="w-full min-h-[120px] resize-y rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-gray-500"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onTextChange?.(e.target.value)}
      />

      {/* actions row */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {/* file upload */}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
          <input type="file" className="hidden" onChange={handleFile} />
          <span>{isProcessingFile ? 'מעלה…' : 'בחר קובץ'}</span>
        </label>

        {/* url fetch */}
        <form onSubmit={handleUrlSubmit} className="flex items-center gap-2">
          <input
            type="url"
            className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            placeholder="הדבק קישור (URL)…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black"
            disabled={isProcessingUrl}
          >
            {isProcessingUrl ? 'טוען…' : 'ייבוא'}
          </button>
        </form>
      </div>
    </div>
  );
}
