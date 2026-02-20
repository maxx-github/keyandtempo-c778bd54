import { useState } from "react";
import { motion } from "framer-motion";
import { Disc3 } from "lucide-react";
import { toast } from "sonner";
import heroBg from "@/assets/hero-bg.jpg";
import AudioUpload from "@/components/AudioUpload";
import AnalysisResults from "@/components/AnalysisResults";
import StemPlayer from "@/components/StemPlayer";
import WaveformVisualizer from "@/components/WaveformVisualizer";

const ANALYZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-audio`;

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix to get raw base64
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const analyzeAudio = async (file: File): Promise<{ key: string; tempo: number; confidence: number }> => {
  // Limit to ~10MB for the API call
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error("File too large. Please use a file under 10MB.");
  }

  const audioBase64 = await fileToBase64(file);

  const resp = await fetch(ANALYZE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      audioBase64,
      mimeType: file.type,
      fileName: file.name,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Analysis failed" }));
    throw new Error(err.error || "Analysis failed");
  }

  return resp.json();
};

const Index = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<{
    key: string;
    tempo: number;
    confidence: number;
  } | null>(null);
  const [stems, setStems] = useState<{
    vocals: string | null;
    instrumental: string | null;
  } | null>(null);

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setResults(null);
    setStems(null);
    setIsAnalyzing(true);

    try {
      const analysisResults = await analyzeAudio(file);
      setResults(analysisResults);

      // Stem separation placeholder (will be replaced by real backend)
      const objectUrl = URL.createObjectURL(file);
      setStems({ vocals: objectUrl, instrumental: objectUrl });
    } catch (error) {
      console.error("Analysis failed:", error);
      toast.error(error instanceof Error ? error.message : "Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen gradient-dark">
      {/* Hero Section */}
      <header className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `url(${heroBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />

        <div className="relative z-10 container mx-auto px-4 pt-20 pb-16">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mb-8"
          >
            <Disc3 className="w-8 h-8 text-primary animate-pulse-glow" />
            <span className="text-xl font-bold text-foreground tracking-tight">
              SonicLens
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold text-foreground leading-tight max-w-3xl"
          >
            Decode your
            <span className="text-primary glow-text"> music</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-4 text-lg text-muted-foreground max-w-xl"
          >
            AI-powered audio analysis. Detect key & tempo instantly, and separate vocals from instrumentals.
          </motion.p>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 pb-20 -mt-4">
        <div className="max-w-2xl mx-auto space-y-8">
          <AudioUpload onFileSelect={handleFileSelect} isAnalyzing={isAnalyzing} />

          {/* File info & waveform */}
          {selectedFile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-2xl bg-card border border-border p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                  <Disc3 className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
                {isAnalyzing && (
                  <span className="text-xs font-mono text-primary animate-pulse-glow">
                    Analyzing...
                  </span>
                )}
              </div>
              <WaveformVisualizer isAnalyzing={isAnalyzing} />
            </motion.div>
          )}

          <AnalysisResults results={results} />
          <StemPlayer stems={stems} />
        </div>
      </main>
    </div>
  );
};

export default Index;
