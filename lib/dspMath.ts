// ============================================================
// Naishabda DSP kernel - pure math, platform independent.
// RBJ Audio EQ Cookbook biquads, adaptive gate, dynamic de-esser,
// BS.1770-style loudness, 4x-oversampled true-peak, plate IR synth.
// ============================================================

export interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

const TAU = Math.PI * 2;
const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));

// ---------------- Biquad design (RBJ cookbook) ----------------

export function peaking(f0: number, q: number, gainDb: number, fs: number): Biquad {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (TAU * f0) / fs;
  const c = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = 1 + alpha * A;
  const b1 = -2 * c;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * c;
  const a2 = 1 - alpha / A;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function highpass(f0: number, q: number, fs: number): Biquad {
  const w0 = (TAU * f0) / fs;
  const c = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = (1 + c) / 2;
  const b1 = -(1 + c);
  const b2 = (1 + c) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * c;
  const a2 = 1 - alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function lowpass(f0: number, q: number, fs: number): Biquad {
  const w0 = (TAU * f0) / fs;
  const c = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = (1 - c) / 2;
  const b1 = 1 - c;
  const b2 = (1 - c) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * c;
  const a2 = 1 - alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function highshelf(f0: number, gainDb: number, fs: number, S = 1): Biquad {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (TAU * f0) / fs;
  const c = Math.cos(w0);
  const alpha = (Math.sin(w0) / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
  const sq = 2 * Math.sqrt(A) * alpha;
  const b0 = A * (A + 1 + (A - 1) * c + sq);
  const b1 = -2 * A * (A - 1 + (A + 1) * c);
  const b2 = A * (A + 1 + (A - 1) * c - sq);
  const a0 = A + 1 - (A - 1) * c + sq;
  const a1 = 2 * (A - 1 - (A + 1) * c);
  const a2 = A + 1 - (A - 1) * c - sq;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function applyBiquadInPlace(x: Float32Array, c: Biquad): void {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    x[i] = y0;
  }
}

export function biquadMagDb(c: Biquad, f: number, fs: number): number {
  const w = (TAU * f) / fs;
  const cw = Math.cos(w), sw = Math.sin(w);
  const cw2 = Math.cos(2 * w), sw2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * cw + c.b2 * cw2;
  const ni = -(c.b1 * sw + c.b2 * sw2);
  const dr = 1 + c.a1 * cw + c.a2 * cw2;
  const di = -(c.a1 * sw + c.a2 * sw2);
  const mag = Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di + 1e-20));
  return 20 * Math.log10(mag + 1e-12);
}

// -------------- Adaptive zero-hiss noise gate --------------

export async function applyNoiseGate(
  x: Float32Array, sr: number, thresholdDb: number, floorDb: number
): Promise<void> {
  const thr = Math.pow(10, thresholdDb / 20);
  const floorLin = Math.pow(10, floorDb / 20);
  const envAtk = 1 - Math.exp(-1 / (0.004 * sr));
  const envRel = 1 - Math.exp(-1 / (0.25 * sr));
  const gAtk = 1 - Math.exp(-1 / (0.008 * sr));
  const gRel = 1 - Math.exp(-1 / (0.14 * sr));
  let env = 0;
  let g = floorLin;
  const CH = 1 << 16;
  for (let s = 0; s < x.length; s += CH) {
    const e = Math.min(x.length, s + CH);
    for (let i = s; i < e; i++) {
      const a = x[i] < 0 ? -x[i] : x[i];
      env = a > env ? env + (a - env) * envAtk : env + (a - env) * envRel;
      const target = env < thr ? floorLin : 1;
      g += (target - g) * (target < g ? gAtk : gRel);
      x[i] *= g;
    }
    if (e < x.length) await yieldToUI();
  }
}

// -------------- Dynamic split-band de-esser --------------
// Analyzes 4.5-7.5 kHz sibilant band energy in 5ms windows and
// applies wideband attenuation (up to maxAttDb) when whistling
// sibilance exceeds a threshold tracked relative to program RMS.

export async function applyDeEsser(
  x: Float32Array, sr: number, maxAttDb: number
): Promise<void> {
  const hp = highpass(4500, 0.7071, sr);
  const lp = lowpass(7500, 0.7071, sr);
  const band = new Float32Array(x);
  applyBiquadInPlace(band, hp);
  applyBiquadInPlace(band, lp);

  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  const broadDb = 20 * Math.log10(Math.sqrt(sum / x.length) + 1e-10);
  const thrDb = broadDb - 9;

  const win = 240; // 5 ms @ 48k
  const nWin = Math.ceil(x.length / win);
  const sched = new Float32Array(nWin + 1);
  for (let w = 0; w < nWin; w++) {
    const s = w * win;
    const e = Math.min(x.length, s + win);
    let bs = 0;
    for (let i = s; i < e; i++) bs += band[i] * band[i];
    const bDb = 20 * Math.log10(Math.sqrt(bs / (e - s)) + 1e-10);
    const red = Math.min(maxAttDb, Math.max(0, (bDb - thrDb) * 0.8));
    sched[w] = Math.pow(10, -red / 20);
  }
  sched[nWin] = sched[nWin - 1];

  const slew = 1 - Math.exp(-1 / (0.01 * sr));
  let g = 1;
  const CH = 1 << 16;
  for (let s = 0; s < x.length; s += CH) {
    const e = Math.min(x.length, s + CH);
    for (let i = s; i < e; i++) {
      const w = i / win;
      const w0 = Math.floor(w);
      const t = w - w0;
      const target = sched[w0] * (1 - t) + sched[w0 + 1] * t;
      g += (target - g) * slew;
      x[i] *= g;
    }
    if (e < x.length) await yieldToUI();
  }
}

// -------------- BS.1770-style loudness (approx LUFS) --------------

export function loudnessLufs(L: Float32Array, R: Float32Array | null, sr: number): number {
  const n = L.length;
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = R ? (L[i] + R[i]) * 0.5 : L[i];
  // K-weighting pre-filter (shelf +4 dB @ 1682 Hz, HP @ 38 Hz)
  applyBiquadInPlace(m, highshelf(1681.974, 3.9998, sr));
  applyBiquadInPlace(m, highpass(38.135, 0.5003, sr));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += m[i] * m[i];
  const ms = sum / n;
  return -0.691 + 10 * Math.log10(ms + 1e-12);
}

// -------------- 4x oversampled true-peak scan --------------

function cr(y0: number, y1: number, y2: number, y3: number, t: number): number {
  return (
    y1 +
    0.5 * t * (y2 - y0 + t * (2 * y0 - 5 * y1 + 4 * y2 - y3 + t * (3 * (y1 - y2) + y3 - y0)))
  );
}

function channelTruePeak(x: Float32Array): number {
  let p = 0;
  const n = x.length;
  for (let i = 0; i < n; i++) {
    const a = x[i] < 0 ? -x[i] : x[i];
    if (a > p) p = a;
  }
  if (p <= 0) return 0;
  const hot = p * 0.9;
  for (let i = 1; i < n - 2; i++) {
    const a1 = x[i] < 0 ? -x[i] : x[i];
    const a2 = x[i + 1] < 0 ? -x[i + 1] : x[i + 1];
    if (a1 < hot && a2 < hot) continue;
    for (let k = 1; k < 4; k++) {
      const v = cr(x[i - 1], x[i], x[i + 1], x[i + 2], k / 4);
      const av = v < 0 ? -v : v;
      if (av > p) p = av;
    }
  }
  return p;
}

export function truePeakDb(L: Float32Array, R: Float32Array | null): number {
  let p = channelTruePeak(L);
  if (R) {
    const p2 = channelTruePeak(R);
    if (p2 > p) p = p2;
  }
  return 20 * Math.log10(p + 1e-10);
}

export function applyGainDb(L: Float32Array, R: Float32Array | null, gDb: number): void {
  const g = Math.pow(10, gDb / 20);
  for (let i = 0; i < L.length; i++) L[i] *= g;
  if (R) for (let i = 0; i < R.length; i++) R[i] *= g;
}

// -------------- Studio plate reverb impulse (1.2s decay) --------------

export function plateIR(sr: number, decaySec: number): [Float32Array, Float32Array] {
  const n = Math.floor(sr * decaySec);
  const out: Float32Array[] = [new Float32Array(n), new Float32Array(n)];
  let seed = 0x1234abcd >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  for (let ch = 0; ch < 2; ch++) {
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr / decaySec;
      const env = Math.exp(-6.9078 * t); // -60 dB at decay time
      const damp = 0.45 - 0.3 * t;
      lp += damp * (rnd() * env - lp);
      out[ch][i] = lp * 3.2;
    }
    // peak-normalize the IR so wet gain is predictable
    let p = 0;
    for (let i = 0; i < n; i++) {
      const a = out[ch][i] < 0 ? -out[ch][i] : out[ch][i];
      if (a > p) p = a;
    }
    if (p > 0) {
      const g = 0.5 / p;
      for (let i = 0; i < n; i++) out[ch][i] *= g;
    }
  }
  return [out[0], out[1]];
}

// -------------- Waveform peaks for player display --------------

export function waveformPeaks(x: Float32Array, buckets = 96): number[] {
  const res = new Array<number>(buckets).fill(0.05);
  const per = Math.max(1, Math.floor(x.length / buckets));
  let gmax = 0.0001;
  for (let b = 0; b < buckets; b++) {
    const s = b * per;
    const e = Math.min(x.length, s + per);
    let m = 0;
    for (let i = s; i < e; i += 4) {
      const a = x[i] < 0 ? -x[i] : x[i];
      if (a > m) m = a;
    }
    res[b] = m;
    if (m > gmax) gmax = m;
  }
  for (let b = 0; b < buckets; b++) res[b] = Math.max(0.05, res[b] / gmax);
  return res;
}

// -------------- EQ transfer curve evaluation for graph --------------

export function logFreqs(count: number, fMin = 20, fMax = 20000): number[] {
  const out: number[] = [];
  const r = Math.log(fMax / fMin);
  for (let i = 0; i < count; i++) out.push(fMin * Math.exp((r * i) / (count - 1)));
  return out;
}

// -------------- Synthetic vocal test signal (demo master source) --------------
// 14s of male-voice-like harmonic recitation at ~118 Hz with vibrato,
// formant weighting, breath hiss, mic pops and sibilance bursts, so the
// full Naishabda mastering chain can be auditioned without a mic.

export function synthesizeTestSignal(sr: number, seconds: number): Float32Array {
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  let seed = 0xbeef1234 >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  const hash = (k: number) => {
    let h = (k * 2654435761) >>> 0;
    h ^= h >>> 13; h = (h * 0x5bd1e995) >>> 0; h ^= h >>> 15;
    return h / 4294967296;
  };

  const shp = highpass(4500, 0.7071, sr);
  const slp = lowpass(7500, 0.7071, sr);
  let sx1 = 0, sx2 = 0, sy1 = 0, sy2 = 0, tx1 = 0, tx2 = 0, ty1 = 0, ty2 = 0;
  const bandNoise = (v: number) => {
    let y = shp.b0 * v + shp.b1 * sx1 + shp.b2 * sx2 - shp.a1 * sy1 - shp.a2 * sy2;
    sx2 = sx1; sx1 = v; sy2 = sy1; sy1 = y;
    const y2 = slp.b0 * y + slp.b1 * tx1 + slp.b2 * tx2 - slp.a1 * ty1 - slp.a2 * ty2;
    tx2 = tx1; tx1 = y; ty2 = ty1; ty1 = y2;
    return y2;
  };

  const NH = 12;
  const ph = new Float64Array(NH + 1);
  let env = 0;
  const envK = 1 - Math.exp(-1 / (0.03 * sr));
  const pops = [1.2, 4.05, 7.9, 11.3];
  const sibs = [0.8, 2.3, 3.6, 5.1, 6.7, 8.2, 9.9, 12.1, 13.0];

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const seg = Math.floor(t / 0.32);
    const target = hash(seg) > 0.3 ? 1 : 0;
    env += (target - env) * envK;

    const vib = Math.sin(TAU * 5.2 * t) * (3.5 + 2.5 * Math.sin(TAU * 0.3 * t));
    const f0 = 118 + vib + 8 * Math.sin(TAU * 0.13 * t);

    let s = 0;
    for (let h = 1; h <= NH; h++) {
      const f = f0 * h;
      if (f > 9000) break;
      const g1 = Math.exp(-((f - 520) ** 2) / (2 * 155 * 155));
      const g2 = Math.exp(-((f - 1150) ** 2) / (2 * 205 * 205)) * 0.6;
      const g3 = Math.exp(-((f - 2400) ** 2) / (2 * 265 * 265)) * 0.34;
      const low = f < 260 ? 1.3 : 1;
      const amp = (1 / h) * (0.25 + g1 + g2 + g3) * low;
      ph[h] += TAU * (f / sr);
      s += amp * Math.sin(ph[h]);
    }
    s = s * 0.35 * env;
    s += rnd() * 0.012 * env; // breath texture
    s += rnd() * 0.011; // constant mic hiss (~-39 dBFS), removed by the gate

    for (const tp of pops) {
      const dt = t - tp;
      if (dt >= 0 && dt < 0.09) s += 0.3 * Math.sin(TAU * 62 * dt) * Math.exp(-dt * 45);
    }
    for (const ts of sibs) {
      const dt = t - ts;
      if (dt >= 0 && dt < 0.12) {
        const e2 = Math.sin((Math.PI * dt) / 0.12);
        s += bandNoise(rnd()) * 1.9 * e2;
      }
    }
    out[i] = s;
  }
  let p = 0;
  for (let i = 0; i < n; i++) {
    const a = out[i] < 0 ? -out[i] : out[i];
    if (a > p) p = a;
  }
  const g = 0.74 / (p + 1e-9);
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}
