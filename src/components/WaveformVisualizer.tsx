import { motion } from "framer-motion";

const WaveformVisualizer = ({ isAnalyzing = false }: { isAnalyzing?: boolean }) => {
  const bars = 40;

  return (
    <div className="flex items-center justify-center gap-[2px] h-16">
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-primary"
          initial={{ height: 4 }}
          animate={
            isAnalyzing
              ? {
                  height: [4, Math.random() * 48 + 8, 4],
                  opacity: [0.3, 1, 0.3],
                }
              : { height: 4, opacity: 0.2 }
          }
          transition={
            isAnalyzing
              ? {
                  duration: 0.6 + Math.random() * 0.4,
                  repeat: Infinity,
                  delay: i * 0.03,
                  ease: "easeInOut",
                }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
};

export default WaveformVisualizer;
