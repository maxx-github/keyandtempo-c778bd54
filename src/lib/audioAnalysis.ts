import { analyze } from "web-audio-beat-detector";

export interface AnalysisResult {
  key: string;
  tempo: number;
  confidence: number;
}

// Krumhansl–Schmuckler key profiles (Temperley revised)
const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// In-place radix-2 iterative FFT
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  // bit reverse
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenR = Math.cos(ang);
    const wlenI = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wR = 1;
      let wI = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const uR = re[i + k];
        const uI = im[i + k];
        const vR = re[i + k + half] * wR - im[i + k + half] * wI;
        const vI = re[i + k + half] * wI + im[i + k + half] * wR;
        re[i + k] = uR + vR;
        im[i + k] = uI + vI;
        re[i + k + half] = uR - vR;
        im[i + k + half] = uI - vI;
        const nwR = wR * wlenR - wI * wlenI;
        wI = wR * wlenI + wI * wlenR;
        wR = nwR;
      }
    }
  }
}

function pearsonCorrelation(a: number[], b: number[]) {
  const n = a.length;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  return num / Math.sqrt(da * db || 1e-12);
}

function detectKey(buffer: AudioBuffer): { key: string; confidence: number } {
  const sr = buffer.sampleRate;
  // mixdown to mono
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i];
  }
  for (let i = 0; i < length; i++) mono[i] /= buffer.numberOfChannels;

  const FRAME = 8192;
  const HOP = 4096;
  const chroma = new Array(12).fill(0);

  // Precompute bin -> pitch class mapping (skip very low/high bins)
  const minFreq = 65; // ~C2
  const maxFreq = 2000;
  const binMap: Int8Array = new Int8Array(FRAME / 2);
  for (let k = 0; k < FRAME / 2; k++) {
    const f = (k * sr) / FRAME;
    if (f < minFreq || f > maxFreq) {
      binMap[k] = -1;
      continue;
    }
    const midi = 69 + 12 * Math.log2(f / 440);
    binMap[k] = ((Math.round(midi) % 12) + 12) % 12;
  }

  // Hann window
  const window = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FRAME - 1)));
  }

  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);

  for (let start = 0; start + FRAME <= length; start += HOP) {
    for (let i = 0; i < FRAME; i++) {
      re[i] = mono[start + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < FRAME / 2; k++) {
      const pc = binMap[k];
      if (pc < 0) continue;
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      chroma[pc] += mag;
    }
  }

  // Normalize
  const sum = chroma.reduce((s, v) => s + v, 0) || 1;
  const norm = chroma.map((v) => v / sum);

  let bestKey = "C Major";
  let bestScore = -Infinity;
  let secondScore = -Infinity;

  for (let tonic = 0; tonic < 12; tonic++) {
    const rotMajor = MAJOR_PROFILE.map((_, i) => MAJOR_PROFILE[(i - tonic + 12) % 12]);
    const rotMinor = MINOR_PROFILE.map((_, i) => MINOR_PROFILE[(i - tonic + 12) % 12]);
    const sMaj = pearsonCorrelation(norm, rotMajor);
    const sMin = pearsonCorrelation(norm, rotMinor);
    if (sMaj > bestScore) {
      secondScore = bestScore;
      bestScore = sMaj;
      bestKey = `${NOTE_NAMES[tonic]} Major`;
    } else if (sMaj > secondScore) secondScore = sMaj;
    if (sMin > bestScore) {
      secondScore = bestScore;
      bestScore = sMin;
      bestKey = `${NOTE_NAMES[tonic]} Minor`;
    } else if (sMin > secondScore) secondScore = sMin;
  }

  // Confidence: gap between best and second, mapped to 0-100
  const gap = Math.max(0, bestScore - secondScore);
  const confidence = Math.min(99, Math.round(60 + gap * 200));
  return { key: bestKey, confidence };
}

async function decodeFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const Ctx =
    (window.AudioContext as typeof AudioContext) ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    ctx.close();
  }
}

async function detectTempo(buffer: AudioBuffer): Promise<number> {
  // web-audio-beat-detector uses an OfflineAudioContext to estimate BPM
  try {
    const bpm = await analyze(buffer);
    return Math.round(bpm);
  } catch {
    return 0;
  }
}

export async function analyzeAudioFile(file: File): Promise<AnalysisResult> {
  const buffer = await decodeFile(file);
  const [{ key, confidence }, tempo] = await Promise.all([
    Promise.resolve(detectKey(buffer)),
    detectTempo(buffer),
  ]);
  return { key, tempo, confidence };
}
