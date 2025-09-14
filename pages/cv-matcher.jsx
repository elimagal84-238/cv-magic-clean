import React, { useState, useEffect, useCallback } from "react";
import { FileText, Briefcase } from "lucide-react";
import InputSource from "../components/matcher/InputSource";
import MatchIndicator from "../components/matcher/MatchIndicator";
import GenerationControls from "../components/matcher/GenerationControls";
import ResultsDisplay from "../components/matcher/ResultsDisplay";
import { InvokeLLM, UploadFile } from "../lib/core";

export default function CVMatcherPage() {
  // Inputs
  const [jobPosting, setJobPosting] = useState("");
  const [cvText, setCvText] = useState("");

  // Matching
  const [matchScore, setMatchScore] = useState(null);
  const [matchAnalysis, setMatchAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Generation
  const [selectedModel, setSelectedModel] = useState("gpt-4");
  const [generatedContent, setGeneratedContent] = useState({});
  const [isGenerating, setIsGenerating] = useState({});
  const [freedomLevel, setFreedomLevel] = useState(5);

  // File/URL processing flags
  const [processingState, setProcessingState] = useState({
    jobFile: false,
    jobUrl: false,
    cvFile: false,
    cvUrl: false,
  });

  /** ניתוח התאמה – עטוף תקין בפונקציה */
  const analyzeMatch = useCallback(async (job, cv) => {
    if (!job?.trim() || !cv?.trim()) {
      setMatchScore(null);
      setMatchAnalysis(null);
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await InvokeLLM({
        prompt: `Analyze job vs CV and return structured JSON.`,
        response_json_schema: {
          type: "object",
          properties: {
            match_score: { type: "number" },
            skills_match: { type: "number" },
            experience_match: { type: "number" },
            keywords_match: { type: "number" },
            strengths: { type: "array", items: { type: "string" } },
            gaps: { type: "array", items: { type: "string" } },
            recommendations: { type: "array", items: { type: "string" } },
            summary: { type: "string" },
          },
        },
      });

      setMatchScore(result?.match_score ?? null);
      setMatchAnalysis(result ?? null);
    } catch (err) {
      console.error(err);
      setMatchScore(null);
      setMatchAnalysis(null);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  /** דיבאונס קל – מנתח אוטומטית אחרי הקלדה */
  useEffect(() => {
    const t = setTimeout(() => analyzeMatch(jobPosting, cvText), 1200);
    return () => clearTimeout(t);
  }, [jobPosting, cvText, analyzeMatch]);

  /** יצירת תוכן – גרסה יחידה (עם המרה ל-string במקרה של אובייקט) */
  const generateContent = async (type, level = 5) => {
    if (!jobPosting?.trim() || !cvText?.trim()) return;
    setIsGenerating((p) => ({ ...p, [type]: true }));
    try {
      const raw = await InvokeLLM({
        prompt: `generate ${type} with level ${level} using the job and CV the user provided`,
      });

      const text =
        typeof raw === "string" ? raw : JSON.stringify(raw ?? {}, null, 2);

      setGeneratedContent((p) => ({ ...p, [type]: text }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating((p) => ({ ...p, [type]: false }));
    }
  };

  /** ניתוח ה-CV שנוצר */
  const analyzeGeneratedCV = () => {
    const text = generatedContent?.tailored_cv;
    if (text && jobPosting) {
      document.getElementById("match-indicator")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      analyzeMatch(jobPosting, text);
    }
  };

  /** העלאת קובץ */
  const handleFileSelect = async (file, type) => {
    if (!file) return;
    const key = `${type}File`;
    setProcessingState((p) => ({ ...p, [key]: true }));
    try {
      const { file_url } = await UploadFile({ file });
      const txt = `תוכן שהתקבל מקובץ: ${file.name} (${file_url})`; // סטאב
      if (type === "job") setJobPosting(txt);
      else setCvText(txt);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingState((p) => ({ ...p, [key]: false }));
    }
  };

  /** טעינה מ-URL */
  const handleUrlFetch = async (url, type) => {
    const key = `${type}Url`;
    setProcessingState((p) => ({ ...p, [key]: true }));
    try {
      const txt = `תוכן שהובא מ-URL: ${url}`; // סטאב
      if (type === "job") setJobPosting(txt);
      else setCvText(txt);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingState((p) => ({ ...p, [key]: false }));
    }
  };

  const copyToClipboard = (text) => {
    if (!text) return;
    try {
      navigator?.clipboard?.writeText(text);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-semibold text-gray-900">CV Magic</h1>
          <p className="mx-auto max-w-xl text-sm text-gray-600">
            הדבק את דרישות המשרה ואת קורות החיים שלך כדי לקבל ניתוח התאמה ותוכן מותאם
          </p>
        </div>

        {/* Inputs */}
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <InputSource
            title="דרישות המשרה"
            icon={<Briefcase className="h-4 w-4 text-gray-600" />}
            placeholder="הדבק כאן את דרישות המשרה..."
            value={jobPosting}
            onTextChange={setJobPosting}
            onFileSelect={(file) => handleFileSelect(file, "job")}
            onUrlFetch={(url) => handleUrlFetch(url, "job")}
            isProcessingFile={processingState.jobFile}
            isProcessingUrl={processingState.jobUrl}
          />
          <InputSource
            title="קורות החיים שלך"
            icon={<FileText className="h-4 w-4 text-gray-600" />}
            placeholder="הדבק כאן את קורות החיים שלך..."
            value={cvText}
            onTextChange={setCvText}
            onFileSelect={(file) => handleFileSelect(file, "cv")}
            onUrlFetch={(url) => handleUrlFetch(url, "cv")}
            isProcessingFile={processingState.cvFile}
            isProcessingUrl={processingState.cvUrl}
          />
        </div>

        {/* Match indicator */}
        <div id="match-indicator">
          <MatchIndicator
            score={matchScore}
            analysis={matchAnalysis}
            isAnalyzing={isAnalyzing}
          />
        </div>

        {/* Controls */}
        <GenerationControls
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          onGenerateCV={(lvl) => generateContent("tailored_cv", lvl)}
          onGenerateCoverLetter={(lvl) => generateContent("cover_letter", lvl)}
          isGenerating={isGenerating}
          disabled={!jobPosting.trim() || !cvText.trim()}
          freedomLevel={freedomLevel}
          setFreedomLevel={setFreedomLevel}
        />

        {/* Results */}
        <ResultsDisplay
          generatedContent={generatedContent}
          isGenerating={isGenerating}
          onCopy={copyToClipboard}
          onAnalyzeGenerated={analyzeGeneratedCV}
          isAnalyzing={isAnalyzing}
        />
      </div>
    </div>
  );
}
