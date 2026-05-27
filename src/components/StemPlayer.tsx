import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Mic,
  Music2,
  Download,
  Headphones,
  RotateCcw,
  ChevronDown,
} from "lucide-react";
import JSZip from "jszip";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface StemPlayerProps {
  stems: {
    vocals: string | null;
    instrumental: string | null;
  } | null;
}

type StemKey = "vocals" | "instrumental";

interface StemDef {
  key: StemKey;
  label: string;
  icon: typeof Mic;
  src: string | null;
  accent: string;
  filename: string;
}

const fmtTime = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const triggerDownload = (blob: Blob | string, filename: string) => {
  const url = typeof blob === "string" ? blob : URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  if (typeof blob !== "string") URL.revokeObjectURL(url);
};

const fetchAsBlob = async (url: string) => (await fetch(url)).blob();

// Encode an AudioBuffer as a 16-bit PCM WAV Blob
const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const samples = buffer.length;
  const blockAlign = numCh * 2;
  const dataSize = samples * blockAlign;
  const headerSize = 44;
  const ab = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(ab);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]));
      s = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, s, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
};

// Mix any number of stems into a single WAV blob using OfflineAudioContext
const mixStemsToWav = async (urls: string[]): Promise<Blob> => {
  const Ctx =
    (window.AudioContext as typeof AudioContext) ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new Ctx();
  try {
    const bufs = await Promise.all(
      urls.map(async (u) => {
        const ab = await (await fetch(u)).arrayBuffer();
        return decodeCtx.decodeAudioData(ab.slice(0));
      })
    );
    const sr = bufs[0].sampleRate;
    const numCh = Math.max(...bufs.map((b) => b.numberOfChannels));
    const length = Math.max(...bufs.map((b) => b.length));
    const OfflineCtx =
      (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext;
    const offline = new OfflineCtx(numCh, length, sr);
    for (const b of bufs) {
      const src = offline.createBufferSource();
      src.buffer = b;
      src.connect(offline.destination);
      src.start(0);
    }
    const rendered = await offline.startRendering();
    return audioBufferToWav(rendered);
  } finally {
    decodeCtx.close();
  }
};

const StemPlayer = ({ stems }: StemPlayerProps) => {
  const defs: StemDef[] = useMemo(
    () =>
      stems
        ? [
            {
              key: "vocals",
              label: "Vocals",
              icon: Mic,
              src: stems.vocals,
              accent: "bg-primary/15 text-primary",
              filename: "vocals.wav",
            },
            {
              key: "instrumental",
              label: "Instrumental",
              icon: Music2,
              src: stems.instrumental,
              accent: "bg-glow-muted/30 text-glow",
              filename: "instrumental.wav",
            },
          ]
        : [],
    [stems]
  );

  const audioRefs = useRef<Record<StemKey, HTMLAudioElement | null>>({
    vocals: null,
    instrumental: null,
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState<Record<StemKey, boolean>>({
    vocals: false,
    instrumental: false,
  });
  const [soloed, setSoloed] = useState<Record<StemKey, boolean>>({
    vocals: false,
    instrumental: false,
  });
  const [volumes, setVolumes] = useState<Record<StemKey, number>>({
    vocals: 1,
    instrumental: 1,
  });
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [exporting, setExporting] = useState(false);

  const anySoloed = soloed.vocals || soloed.instrumental;

  // Apply mute/solo/volume to actual audio elements
  useEffect(() => {
    (Object.keys(audioRefs.current) as StemKey[]).forEach((k) => {
      const el = audioRefs.current[k];
      if (!el) return;
      const audible = anySoloed ? soloed[k] : !muted[k];
      el.muted = !audible;
      el.volume = volumes[k];
    });
  }, [muted, soloed, volumes, anySoloed]);

  // Reset state when stems change
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [stems]);

  const handleLoaded = (key: StemKey) => () => {
    const el = audioRefs.current[key];
    if (el && el.duration && Number.isFinite(el.duration)) {
      setDuration((d) => Math.max(d, el.duration));
    }
  };

  const handleTimeUpdate = (key: StemKey) => () => {
    // Use the first available stem to drive the timeline
    if (key !== defs[0]?.key) return;
    const el = audioRefs.current[key];
    if (el) setCurrentTime(el.currentTime);
  };

  const togglePlayAll = async () => {
    const els = defs
      .map((d) => audioRefs.current[d.key])
      .filter((e): e is HTMLAudioElement => !!e);
    if (!els.length) return;
    if (isPlaying) {
      els.forEach((e) => e.pause());
      setIsPlaying(false);
    } else {
      // Resync before playing
      const t = currentTime;
      els.forEach((e) => {
        e.currentTime = t;
      });
      try {
        await Promise.all(els.map((e) => e.play()));
        setIsPlaying(true);
      } catch {
        toast.error("Playback blocked by browser");
      }
    }
  };

  const restart = () => {
    defs.forEach((d) => {
      const el = audioRefs.current[d.key];
      if (el) el.currentTime = 0;
    });
    setCurrentTime(0);
  };

  const seek = (val: number) => {
    defs.forEach((d) => {
      const el = audioRefs.current[d.key];
      if (el) el.currentTime = val;
    });
    setCurrentTime(val);
  };

  const onEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const toggleMute = (k: StemKey) => setMuted((m) => ({ ...m, [k]: !m[k] }));
  const toggleSolo = (k: StemKey) => setSoloed((s) => ({ ...s, [k]: !s[k] }));

  const downloadStem = async (key: StemKey) => {
    const d = defs.find((x) => x.key === key);
    if (!d?.src) return;
    const tId = toast.loading(`Preparing ${d.label.toLowerCase()}…`);
    try {
      const blob = await fetchAsBlob(d.src);
      triggerDownload(blob, d.filename);
      toast.success(`${d.label} downloaded`, { id: tId });
    } catch {
      toast.error(`Failed to download ${d.label.toLowerCase()}`, { id: tId });
    }
  };

  const downloadMix = async () => {
    const urls = defs.map((d) => d.src).filter((u): u is string => !!u);
    if (urls.length < 2) {
      toast.error("Need at least two stems to mix");
      return;
    }
    setExporting(true);
    const tId = toast.loading("Rendering full mix…");
    try {
      const blob = await mixStemsToWav(urls);
      triggerDownload(blob, "full-mix.wav");
      toast.success("Full mix downloaded", { id: tId });
    } catch {
      toast.error("Failed to render mix", { id: tId });
    } finally {
      setExporting(false);
    }
  };

  const downloadZip = async () => {
    setExporting(true);
    const tId = toast.loading("Preparing zip…");
    try {
      const zip = new JSZip();
      for (const d of defs) {
        if (!d.src) continue;
        zip.file(d.filename, await fetchAsBlob(d.src));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, "stems.zip");
      toast.success("Zip downloaded", { id: tId });
    } catch {
      toast.error("Failed to create zip", { id: tId });
    } finally {
      setExporting(false);
    }
  };

  if (!stems) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-2xl bg-card border border-border p-5 space-y-5"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center">
            <Headphones className="w-4 h-4 text-primary-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Stem Mixer</h3>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={exporting}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-sm font-medium text-foreground hover:bg-surface transition-colors border border-border disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-popover border-border z-50">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Individual stems
            </DropdownMenuLabel>
            {defs.map((d) => (
              <DropdownMenuItem
                key={d.key}
                disabled={!d.src}
                onClick={() => downloadStem(d.key)}
                className="cursor-pointer"
              >
                <d.icon className="w-4 h-4 mr-2 opacity-70" />
                {d.label} (.wav)
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Combined
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={downloadMix} className="cursor-pointer">
              <Music2 className="w-4 h-4 mr-2 opacity-70" />
              Full mix (.wav)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={downloadZip} className="cursor-pointer">
              <Download className="w-4 h-4 mr-2 opacity-70" />
              All stems (.zip)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Hidden audio elements */}
      {defs.map((d) =>
        d.src ? (
          <audio
            key={d.key}
            ref={(el) => {
              audioRefs.current[d.key] = el;
            }}
            src={d.src}
            preload="auto"
            onLoadedMetadata={handleLoaded(d.key)}
            onTimeUpdate={handleTimeUpdate(d.key)}
            onEnded={onEnded}
          />
        ) : null
      )}

      {/* Master transport */}
      <div className="rounded-xl bg-surface border border-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlayAll}
            className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground hover:opacity-90 transition-opacity"
            title={isPlaying ? "Pause all" : "Play all"}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>
          <button
            onClick={restart}
            className="w-9 h-9 rounded-lg bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title="Restart"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <div className="flex-1 flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground tabular-nums w-10 text-right">
              {fmtTime(currentTime)}
            </span>
            <Slider
              value={[currentTime]}
              min={0}
              max={duration || 0.001}
              step={0.1}
              onValueChange={(v) => seek(v[0])}
              className="flex-1"
            />
            <span className="text-xs font-mono text-muted-foreground tabular-nums w-10">
              {fmtTime(duration)}
            </span>
          </div>
        </div>
      </div>

      {/* Per-stem tracks */}
      <div className="flex flex-col gap-3">
        {defs.map((d) => {
          const isMuted = anySoloed ? !soloed[d.key] : muted[d.key];
          return (
            <div
              key={d.key}
              className={`rounded-xl bg-surface border p-4 transition-colors ${
                isMuted ? "border-border opacity-60" : "border-border"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${d.accent}`}
                >
                  <d.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{d.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {soloed[d.key] ? "Solo" : muted[d.key] ? "Muted" : "Playing in mix"}
                  </p>
                </div>

                <button
                  onClick={() => toggleSolo(d.key)}
                  disabled={!d.src}
                  className={`px-2.5 h-8 rounded-md text-xs font-semibold border transition-colors disabled:opacity-30 ${
                    soloed[d.key]
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                  }`}
                  title="Solo this stem"
                >
                  S
                </button>
                <button
                  onClick={() => toggleMute(d.key)}
                  disabled={!d.src}
                  className={`px-2.5 h-8 rounded-md text-xs font-semibold border transition-colors disabled:opacity-30 ${
                    muted[d.key]
                      ? "bg-destructive/20 text-destructive border-destructive/40"
                      : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                  }`}
                  title="Mute this stem"
                >
                  M
                </button>
                <button
                  onClick={() => downloadStem(d.key)}
                  disabled={!d.src}
                  className="w-8 h-8 rounded-md bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                  title={`Download ${d.label}`}
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-3 mt-3">
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <Slider
                  value={[volumes[d.key] * 100]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) =>
                    setVolumes((vv) => ({ ...vv, [d.key]: v[0] / 100 }))
                  }
                  disabled={!d.src}
                  className="flex-1"
                />
                <span className="text-xs font-mono text-muted-foreground tabular-nums w-8 text-right">
                  {Math.round(volumes[d.key] * 100)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Play all stems together with the master transport, or isolate parts with{" "}
        <span className="text-foreground font-medium">S</span> (solo) and{" "}
        <span className="text-foreground font-medium">M</span> (mute). Use Export to download
        any individual stem or the combined mix.
      </p>
    </motion.div>
  );
};

export default StemPlayer;
