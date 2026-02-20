import { useCallback, useState } from "react";
import { Upload, Music } from "lucide-react";
import { motion } from "framer-motion";

interface AudioUploadProps {
  onFileSelect: (file: File) => void;
  isAnalyzing: boolean;
}

const AudioUpload = ({ onFileSelect, isAnalyzing }: AudioUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("audio/")) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`relative rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-300 cursor-pointer group ${
        isDragging
          ? "border-primary bg-primary/5 glow-border"
          : "border-border hover:border-primary/50 hover:bg-surface"
      } ${isAnalyzing ? "pointer-events-none opacity-50" : ""}`}
      onClick={() => document.getElementById("audio-input")?.click()}
    >
      <input
        id="audio-input"
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileInput}
        disabled={isAnalyzing}
      />

      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center group-hover:bg-primary/10 transition-colors">
          {isDragging ? (
            <Music className="w-8 h-8 text-primary" />
          ) : (
            <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
          )}
        </div>
        <div>
          <p className="text-lg font-medium text-foreground">
            Drop your audio file here
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to browse · MP3, WAV, FLAC, OGG
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default AudioUpload;
