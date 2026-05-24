import { motion } from "framer-motion";
import { Gauge, Hash, ShieldCheck } from "lucide-react";

interface SegmentResult {
  key: string;
  tempo: number;
}

interface AnalysisResultsProps {
  results: {
    key: string;
    tempo: number;
    confidence: number;
    keyAgreement?: number;
    tempoAgreement?: number;
    segments?: SegmentResult[];
  } | null;
}

const AnalysisResults = ({ results }: AnalysisResultsProps) => {
  if (!results) return null;

  const cards = [
    {
      icon: Hash,
      label: "Musical Key",
      value: results.key,
      sub:
        results.keyAgreement !== undefined
          ? `${results.keyAgreement}% segment agreement`
          : `${results.confidence}% confidence`,
    },
    {
      icon: Gauge,
      label: "Tempo",
      value: `${results.tempo}`,
      sub:
        results.tempoAgreement !== undefined
          ? `BPM • ${results.tempoAgreement}% segment agreement`
          : "BPM",
    },
    {
      icon: ShieldCheck,
      label: "Accuracy Score",
      value: `${results.confidence}%`,
      sub: "validated across segments",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.12 }}
            className="rounded-2xl bg-card border border-border p-6 glow-border"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <card.icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {card.label}
              </span>
            </div>
            <p className="text-3xl font-bold text-foreground glow-text font-mono">
              {card.value}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
          </motion.div>
        ))}
      </div>

      {results.segments && results.segments.length > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="rounded-2xl bg-card border border-border p-5"
        >
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Per-segment detection
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {results.segments.map((s, i) => {
              const keyMatch = s.key === results.key;
              const tempoMatch = Math.abs(s.tempo - results.tempo) <= 2;
              return (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-background/40 p-3"
                >
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    Segment {i + 1}
                  </p>
                  <p
                    className={`text-sm font-mono ${keyMatch ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {s.key}
                  </p>
                  <p
                    className={`text-sm font-mono ${tempoMatch ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {s.tempo || "—"} BPM
                  </p>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default AnalysisResults;
