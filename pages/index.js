import Button from "../components/Button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <h1 className="text-3xl font-bold mb-6">CV Magic 🚀</h1>
      <p className="mb-4">זהו הדף הראשון שלך עם Next.js ו-Tailwind</p>
      <Button>לחץ כאן</Button>
    </div>
  );
}


