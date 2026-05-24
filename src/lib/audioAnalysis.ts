import { analyze } from "web-audio-beat-detector";

export interface SegmentResult {
  key: string;
  tempo: number;
}

export interface AnalysisResult {
  key: string;
  tempo: number;
  confidence: number;
  keyAgreement: number; // 0-100, % of segments agreeing with final key
  tempoAgreement: number; // 0-100, % of segments within ±2 BPM of final tempo
  segments: SegmentResult[];
}

// Krumhansl–Schmuckler key profiles (Temperley revised)
const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
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

function toMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i];
  }
  for (let i = 0; i < length; i++) mono[i] /= buffer.numberOfChannels;
  return mono;
}

function detectKeyFromMono(
  mono: Float32Array,
  sr: number,
  startSample: number,
  endSample: number
): { key: string; gap: number } {
  const FRAME = 8192;
  const HOP = 4096;
  const chroma = new Array(12).fill(0);

  const minFreq = 65;
  const maxFreq = 2000;
  const binMap = new Int8Array(FRAME / 2);
  for (let k = 0; k < FRAME / 2; k++) {
    const f = (k * sr) / FRAME;
    if (f < minFreq || f > maxFreq) {
      binMap[k] = -1;
      continue;
    }
    const midi = 69 + 12 * Math.log2(f / 440);
    binMap[k] = ((Math.round(midi) % 12) + 12) % 12;
  }

  const window = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FRAME - 1)));
  }

  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);

  for (let start = startSample; start + FRAME <= endSample; start += HOP) {
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

  return { key: bestKey, gap: Math.max(0, bestScore - secondScore) };
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

function sliceBuffer(buffer: AudioBuffer, startSample: number, endSample: number): AudioBuffer {
  const len = endSample - startSample;
  const Ctx =
    (window.AudioContext as typeof AudioContext) ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const out = ctx.createBuffer(buffer.numberOfChannels, len, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    out.copyToChannel(buffer.getChannelData(c).subarray(startSample, endSample), c);
  }
  ctx.close();
  return out;
}

async function detectTempoSafe(buffer: AudioBuffer): Promise<number> {
  try {
    const bpm = await analyze(buffer);
    return Math.round(bpm);
  } catch {
    return 0;
  }
}

function mode<T>(arr: T[]): { value: T; count: number } {
  const counts = new Map<T, number>();
  for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
  let best: T = arr[0];
  let bestC = 0;
  for (const [v, c] of counts) {
    if (c > bestC) {
      best = v;
      bestC = c;
    }
  }
  return { value: best, count: bestC };
}

export async function analyzeAudioFile(file: File): Promise<AnalysisResult> {
  const buffer = await decodeFile(file);
  const sr = buffer.sampleRate;
  const total = buffer.length;
  const duration = total / sr;

  const mono = toMono(buffer);

  // Whole-file detections
  const fullKey = detectKeyFromMono(mono, sr, 0, total);
  const fullTempo = await detectTempoSafe(buffer);

  // Segment validation: split into ~4 segments (min 8s each, skip if too short)
  const segments: SegmentResult[] = [];
  const segCount = duration >= 32 ? 4 : duration >= 16 ? 2 : 1;
  if (segCount > 1) {
    const segLen = Math.floor(total / segCount);
    const tempoPromises: Promise<number>[] = [];
    const segKeys: string[] = [];
    for (let i = 0; i < segCount; i++) {
      const s = i * segLen;
      const e = i === segCount - 1 ? total : s + segLen;
      segKeys.push(detectKeyFromMono(mono, sr, s, e).key);
      const segBuf = sliceBuffer(buffer, s, e);
      tempoPromises.push(detectTempoSafe(segBuf));
    }
    const segTempos = await Promise.all(tempoPromises);
    for (let i = 0; i < segCount; i++) {
      segments.push({ key: segKeys[i], tempo: segTempos[i] });
    }
  } else {
    segments.push({ key: fullKey.key, tempo: fullTempo });
  }

  // Reconcile key: majority vote across segments + full
  const allKeys = [fullKey.key, ...segments.map((s) => s.key)];
  const { value: finalKey, count: keyCount } = mode(allKeys);
  const keyAgreement = Math.round((keyCount / allKeys.length) * 100);

  // Reconcile tempo: median; handle half/double-time by folding to fullTempo octave
  const validTempos = [fullTempo, ...segments.map((s) => s.tempo)].filter((t) => t > 0);
  const folded = validTempos.map((t) => {
    if (fullTempo <= 0) return t;
    let f = t;
    while (f < fullTempo * 0.75) f *= 2;
    while (f > fullTempo * 1.5) f /= 2;
    return Math.round(f);
  });
  const sorted = [...folded].sort((a, b) => a - b);
  const finalTempo = sorted.length
    ? sorted[Math.floor(sorted.length / 2)]
    : fullTempo;
  const tempoAgreeCount = folded.filter((t) => Math.abs(t - finalTempo) <= 2).length;
  const tempoAgreement = folded.length
    ? Math.round((tempoAgreeCount / folded.length) * 100)
    : 0;

  // Overall confidence blends key profile gap + segment agreement
  const gapScore = Math.min(40, fullKey.gap * 120);
  const confidence = Math.max(
    30,
    Math.min(
      99,
      Math.round(gapScore + 0.35 * keyAgreement + 0.25 * tempoAgreement)
    )
  );

  return {
    key: finalKey,
    tempo: finalTempo,
    confidence,
    keyAgreement,
    tempoAgreement,
    segments,
  };
}
