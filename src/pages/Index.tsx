import { useState } from "react";
import { motion } from "framer-motion";
import { Disc3 } from "lucide-react";
import { toast } from "sonner";
import heroBg from "@/assets/hero-bg.jpg";
import AudioUpload from "@/components/AudioUpload";
import AnalysisResults from "@/components/AnalysisResults";
import StemPlayer from "@/components/StemPlayer";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import { supabase } from "@/integrations/supabase/client";

const ANALYZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-audio`;
const STEMS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/separate-stems`;

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const analyzeAudio = async (file: File): Promise<{ key: string; tempo: number; confidence: number }> => {
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
    body: JSON.stringify({ audioBase64, mimeType: file.type, fileName: file.name }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Analysis failed" }));
    throw new Error(err.error || "Analysis failed");
  }

  return resp.json();
};

const uploadAudioToStorage = async (file: File): Promise<string> => {
  const fileName = `${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage
    .from("audio-uploads")
    .upload(fileName, file, { contentType: file.type });

  if (error) throw new Error("Failed to upload audio file");

  const { data } = supabase.storage.from("audio-uploads").getPublicUrl(fileName);
  return data.publicUrl;
};

const pollPrediction = async (predictionId: string): Promise<{ vocals: string; instrumental: string }> => {
  const maxAttempts = 120; // 10 minutes max
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const resp = await fetch(STEMS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ action: "poll", predictionId }),
    });

    if (!resp.ok) throw new Error("Failed to check separation status");

    const prediction = await resp.json();

    if (prediction.status === "succeeded") {
      // Demucs htdemucs model returns an object with stem URLs
      const output = prediction.output;
      return {
        vocals: typeof output === "string" ? output : output?.vocals || output,
        instrumental: typeof output === "string" ? output : output?.other || output?.accompaniment || output,
      };
    }

    if (prediction.status === "failed" || prediction.status === "canceled") {
      throw new Error(prediction.error || "Stem separation failed");
    }
  }
  throw new Error("Stem separation timed out");
};

const separateStems = async (audioUrl: string): Promise<{ vocals: string; instrumental: string }> => {
  const resp = await fetch(STEMS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ audioUrl }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Separation failed" }));
    throw new Error(err.error || "Separation failed");
  }

  const prediction = await resp.json();
  return pollPrediction(prediction.id);
};

const Index = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSeparating, setIsSeparating] = useState(false);
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
    setIsSeparating(false);

    try {
      // Run analysis and upload in parallel
      const [analysisResults, audioUrl] = await Promise.all([
        analyzeAudio(file),
        uploadAudioToStorage(file),
      ]);
      setResults(analysisResults);
      setIsAnalyzing(false);

      // Start stem separation
      setIsSeparating(true);
      toast.info("Starting stem separation… this may take a few minutes.");
      const stemResults = await separateStems(audioUrl);
      setStems(stemResults);
      toast.success("Stem separation complete!");
    } catch (error) {
      console.error("Processing failed:", error);
      toast.error(error instanceof Error ? error.message : "Processing failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
      setIsSeparating(false);
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
                {!isAnalyzing && isSeparating && (
                  <span className="text-xs font-mono text-primary animate-pulse-glow">
                    Separating stems...
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
