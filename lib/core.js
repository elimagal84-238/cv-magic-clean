// lib/core.js — סטאבים זמניים עד שנחבר API אמיתי

export async function InvokeLLM({ prompt, response_json_schema, file_urls, add_context_from_internet }) {
  // החזרה מדומה לניתוח התאמה (תואם לסכימה שלך)
  if (response_json_schema) {
    return {
      match_score: 74,
      skills_match: 78,
      experience_match: 66,
      keywords_match: 71,
      strengths: ["ניהול פרויקטים", "SQL", "AutoCAD"],
      gaps: ["לא הוזכר Kubernetes", "חסר ענן ציבורי"],
      recommendations: ["להדגיש ניסיון ענן (AWS/GCP)", "להוסיף פרויקטים מחוץ לעבודה"],
      summary: "התאמה טובה, יש מקום לשיפור בנושאי ענן."
    };
  }
  // החזרה מדומה לתוכן שנוצר (קו״ח/מכתב)
  return "תוכן שנוצר לדוגמה (סטאב) — כאן יופיעו קורות חיים מותאמים או מכתב מקדים.";
}

export async function UploadFile({ file }) {
  // מחזיר קישור פיקטיבי, מספיק ל־UI
  return { file_url: "https://example.com/fake-upload.txt" };
}
