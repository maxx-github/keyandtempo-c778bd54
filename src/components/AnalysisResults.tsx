import { motion } from "framer-motion";
import { Music, Gauge, Hash } from "lucide-react";

interface AnalysisResultsProps {
  results: {
    key: string;
    tempo: number;
    confidence: number;
  } | null;
}

const AnalysisResults = ({ results }: AnalysisResultsProps) => {
  if (!results) return null;

  const cards = [
    {
      icon: Hash,
      label: "Musical Key",
      value: results.key,
      sub: `${results.confidence}% confidence`,
    },
    {
      icon: Gauge,
      label: "Tempo",
      value: `${results.tempo}`,
      sub: "BPM",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 sm:grid-cols-2 gap-4"
    >
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.15 }}
          className="rounded-2xl bg-card border border-border p-6 glow-border"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <card.icon className="w-5 h-5 text-primary" />
            </div>
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {card.label}
            </span>
          </div>
          <p className="text-4xl font-bold text-foreground glow-text font-mono">
            {card.value}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{card.sub}</p>
        </motion.div>
      ))}
    </motion.div>
  );
};

export default AnalysisResults;
