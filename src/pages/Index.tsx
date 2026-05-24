import { useState } from "react";
import { motion } from "framer-motion";
import { Disc3, Sparkles, Layers } from "lucide-react";
import { toast } from "sonner";
import heroBg from "@/assets/hero-bg.jpg";
import AudioUpload from "@/components/AudioUpload";
import AnalysisResults from "@/components/AnalysisResults";
import StemPlayer from "@/components/StemPlayer";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import { supabase } from "@/integrations/supabase/client";
import { analyzeAudioFile } from "@/lib/audioAnalysis";

const STEMS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/separate-stems`;

const uploadAudioToStorage = async (file: File): Promise<string> => {
  const fileName = `${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage
    .from("audio-uploads")
    .upload(fileName, file, { contentType: file.type });
  if (error) throw new Error("Failed to upload audio file");
  const { data } = supabase.storage.from("audio-uploads").getPublicUrl(fileName);
  return data.publicUrl;
};

const pollPrediction = async (
  predictionId: string
): Promise<{ vocals: string; instrumental: string }> => {
  const maxAttempts = 120;
  let consecutiveErrors = 0;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    let resp: Response;
    try {
      resp = await fetch(STEMS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ action: "poll", predictionId }),
      });
    } catch {
      consecutiveErrors++;
      if (consecutiveErrors >= 5) throw new Error("Lost connection while checking separation status");
      continue;
    }
    if (!resp.ok) {
      consecutiveErrors++;
      if (consecutiveErrors >= 5) throw new Error("Failed to check separation status");
      continue;
    }
    consecutiveErrors = 0;
    const prediction = await resp.json();
    if (prediction.status === "succeeded") {
      const output = prediction.output;
      const vocals = typeof output === "string" ? output : output?.vocals;
      const instrumental =
        typeof output === "string"
          ? output
          : output?.other ?? output?.no_vocals ?? output?.accompaniment ?? output?.instrumental;
      if (!vocals || !instrumental) throw new Error("Separation finished but stem URLs were missing");
      return { vocals, instrumental };
    }
    if (prediction.status === "failed" || prediction.status === "canceled") {
      throw new Error(prediction.error || "Stem separation failed");
    }
  }
  throw new Error("Stem separation timed out");
};

const separateStems = async (audioUrl: string) => {
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
    keyAgreement?: number;
    tempoAgreement?: number;
    segments?: { key: string; tempo: number }[];
  } | null>(null);
  const [stems, setStems] = useState<{
    vocals: string | null;
    instrumental: string | null;
  } | null>(null);

  const busy = isAnalyzing || isSeparating;

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setResults(null);
    setStems(null);
  };

  const handleAnalyze = async () => {
    if (!selectedFile || busy) return;
    setIsAnalyzing(true);
    setResults(null);
    try {
      const res = await analyzeAudioFile(selectedFile);
      setResults(res);
      toast.success(`Detected ${res.key} • ${res.tempo} BPM`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSeparate = async () => {
    if (!selectedFile || busy) return;
    setIsSeparating(true);
    setStems(null);
    try {
      toast.info("Uploading and starting stem separation…");
      const url = await uploadAudioToStorage(selectedFile);
      const stemResults = await separateStems(url);
      setStems(stemResults);
      toast.success("Stem separation complete!");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Separation failed");
    } finally {
      setIsSeparating(false);
    }
  };

  return (
    <div className="min-h-screen gradient-dark">
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
            <span className="text-xl font-bold text-foreground tracking-tight">SonicLens</span>
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

      <main className="container mx-auto px-4 pb-20 -mt-4">
        <div className="max-w-2xl mx-auto space-y-8">
          <AudioUpload onFileSelect={handleFileSelect} isAnalyzing={busy} />

          {selectedFile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-2xl bg-card border border-border p-6 space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                  <Disc3 className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
                {isAnalyzing && (
                  <span className="text-xs font-mono text-primary animate-pulse-glow">Analyzing…</span>
                )}
                {isSeparating && (
                  <span className="text-xs font-mono text-primary animate-pulse-glow">
                    Separating stems…
                  </span>
                )}
              </div>

              <WaveformVisualizer isAnalyzing={busy} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleAnalyze}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl gradient-primary text-primary-foreground font-medium transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  {isAnalyzing ? "Analyzing…" : "Analyze Key & Tempo"}
                </button>
                <button
                  onClick={handleSeparate}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-secondary text-foreground font-medium border border-border hover:bg-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Layers className="w-4 h-4" />
                  {isSeparating ? "Separating…" : "Separate Stems"}
                </button>
              </div>
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
