import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Volume2, VolumeX, Mic, Music2, Download, Archive } from "lucide-react";
import JSZip from "jszip";
import { toast } from "sonner";

interface StemPlayerProps {
  stems: {
    vocals: string | null;
    instrumental: string | null;
  } | null;
}

const downloadFile = async (url: string, filename: string) => {
  const resp = await fetch(url);
  const blob = await resp.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

const downloadAllAsZip = async (stems: { vocals: string | null; instrumental: string | null }) => {
  const zip = new JSZip();
  const toastId = toast.loading("Preparing zip…");

  try {
    if (stems.vocals) {
      const resp = await fetch(stems.vocals);
      zip.file("vocals.wav", await resp.blob());
    }
    if (stems.instrumental) {
      const resp = await fetch(stems.instrumental);
      zip.file("instrumental.wav", await resp.blob());
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "stems.zip";
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Zip downloaded!", { id: toastId });
  } catch {
    toast.error("Failed to create zip", { id: toastId });
  }
};

const StemTrack = ({
  label,
  icon: Icon,
  src,
  color,
  downloadName,
}: {
  label: string;
  icon: typeof Mic;
  src: string | null;
  color: string;
  downloadName: string;
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current || !src) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  return (
    <div className="flex items-center gap-4 rounded-xl bg-surface border border-border p-4">
      {src && <audio ref={audioRef} src={src} onEnded={() => setIsPlaying(false)} />}
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-sm font-medium text-foreground flex-1">{label}</span>
      <button
        onClick={() => src && downloadFile(src, downloadName)}
        disabled={!src}
        className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
        title={`Download ${label}`}
      >
        <Download className="w-4 h-4" />
      </button>
      <button
        onClick={toggleMute}
        disabled={!src}
        className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
      >
        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
      <button
        onClick={togglePlay}
        disabled={!src}
        className="w-9 h-9 rounded-lg gradient-primary flex items-center justify-center text-primary-foreground transition-colors disabled:opacity-30"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
    </div>
  );
};

const StemPlayer = ({ stems }: StemPlayerProps) => {
  if (!stems) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Separated Stems</h3>
        <button
          onClick={() => downloadAllAsZip(stems)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Archive className="w-4 h-4" />
          Download ZIP
        </button>
      </div>
      <div className="flex flex-col gap-3">
        <StemTrack
          label="Vocals"
          icon={Mic}
          src={stems.vocals}
          color="bg-primary/15 text-primary"
          downloadName="vocals.wav"
        />
        <StemTrack
          label="Instrumental"
          icon={Music2}
          src={stems.instrumental}
          color="bg-glow-muted/30 text-glow"
          downloadName="instrumental.wav"
        />
      </div>
    </motion.div>
  );
};

export default StemPlayer;
