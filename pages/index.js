import dynamic from "next/dynamic";
const MatcherForm = dynamic(() => import("../components/MatcherForm"), { ssr: false });

export default function Home() {
  return (
    <div style={{ marginTop: 30, textAlign: "center" }}>
      <h1>CV Magic 🚀</h1>
      <p>גרסת MVP – טופס בדיקת התאמה בסיסית</p>
      <MatcherForm />
    </div>
  );
}

