// pages/api/invoke.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    // כדי לא לראות שוב 405 מהלקוח
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // בקשה שמגיעה מ-InvokeLLM(lib/core.js). אפשר לקרוא אם תרצה:
    // const { prompt, response_json_schema } = req.body || {};

    // מחזירים תוצאה סטאבית כדי שהמסך יעבוד ותראה תזוזה מיד
    const mock = {
      match_score: 74,
      skills_match: 78,
      experience_match: 66,
      keywords_match: 71,
      strengths: [
        "ניסיון רלוונטי לתיאור המשרה",
        "מיומנויות תקשורת טובות",
      ],
      gaps: [
        "חסר ניסיון בכלי X",
        "להבליט הישגים כמותיים",
      ],
      recommendations: [
        "להוסיף מילת מפתח Y בקורות החיים",
        "לחדד ניסיון בפרויקט Z",
      ],
      summary:
        "התאמה טובה, עם מקום לשיפור במספר תחומים נקודתיים. מומלץ לחזק מילות מפתח ולהוסיף דוגמאות מדידות."
    };

    return res.status(200).json(mock);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
