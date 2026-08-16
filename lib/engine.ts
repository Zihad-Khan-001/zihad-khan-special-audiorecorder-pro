// ============================================================
// Naishabda Engine - capture, live metering, offline mastering,
// A/B playback. Web uses the full Web Audio pipeline; native uses
// expo-av for record/playback (mastering renders in the web build).
// ============================================================

import { Platform } from 'react-native';
import { Audio as AvAudio } from 'expo-av';
import * as dsp from './dspMath';
import { encodeWavBytes } from './wav';

export type EngineState = 'idle' | 'recording' | 'paused';
export type PlayerMode = 'raw' | 'mastered';

export interface BandSetting { on: boolean; freq: number; gain: number; q: number }

export interface DSPSettings {
  profileId: string;
  denoiseOn: boolean;
  gateOn: boolean;
  gateThresholdDb: number;
  gateFloorDb: number;
  hp: BandSetting;
  body: BandSetting;
  box: BandSetting;
  diction: BandSetting;
  air: BandSetting;
  deesserOn: boolean;
  deesserMaxDb: number;
  compOn: boolean;
  compThresholdDb: number;
  compRatio: number;
  compAttackMs: number;
  compReleaseMs: number;
  compKneeDb: number;
  limiterOn: boolean;
  limiterCeilingDb: number;
  normalizeOn: boolean;
  targetLufs: number;
  reverbOn: boolean;
  reverbWet: number;
  reverbDecaySec: number;
  reverbPredelayMs: number;
  bitDepth: 16 | 24;
}

export interface Profile {
  id: string;
  label: string;
  subtitle: string;
  settings: DSPSettings;
}

const base: DSPSettings = {
  profileId: 'naishabda',
  denoiseOn: true,
  gateOn: true,
  gateThresholdDb: -55,
  gateFloorDb: -60,
  hp: { on: true, freq: 80, gain: 0, q: 0.7071 },
  body: { on: true, freq: 250, gain: 3.0, q: 1.0 },
  box: { on: true, freq: 450, gain: -2.0, q: 2.0 },
  diction: { on: true, freq: 3400, gain: 2.8, q: 1.0 },
  air: { on: true, freq: 10000, gain: 1.8, q: 0.7071 },
  deesserOn: true,
  deesserMaxDb: 3.5,
  compOn: true,
  compThresholdDb: -20,
  compRatio: 3.2,
  compAttackMs: 12,
  compReleaseMs: 80,
  compKneeDb: 12,
  limiterOn: true,
  limiterCeilingDb: -1.5,
  normalizeOn: true,
  targetLufs: -14.0,
  reverbOn: true,
  reverbWet: 0.10,
  reverbDecaySec: 1.2,
  reverbPredelayMs: 18,
  bitDepth: 24,
};

export const PROFILES: Profile[] = [
  {
    id: 'naishabda',
    label: 'Naishabda 21Y Male Poetry Master',
    subtitle: 'Zero-hiss • warm chest body • diction + air • studio booth plate',
    settings: { ...base },
  },
  {
    id: 'warm-broadcast',
    label: 'Warm Broadcast Voice',
    subtitle: 'Deeper 200 Hz body, gentler air, tighter 4:1 glue compression',
    settings: {
      ...base,
      profileId: 'warm-broadcast',
      body: { on: true, freq: 200, gain: 4.0, q: 1.0 },
      box: { on: true, freq: 400, gain: -2.5, q: 2.0 },
      diction: { on: true, freq: 5000, gain: 1.8, q: 1.0 },
      air: { on: true, freq: 12000, gain: 1.2, q: 0.7071 },
      deesserMaxDb: 4.5,
      compRatio: 4.0,
      compThresholdDb: -22,
      compAttackMs: 10,
      compReleaseMs: 100,
      reverbWet: 0.08,
      reverbDecaySec: 1.0,
      reverbPredelayMs: 12,
    },
  },
  {
    id: 'spoken-neutral',
    label: 'Studio Spoken Word — Neutral',
    subtitle: 'Light touch EQ, dry ambience, transparent 2.5:1 dynamics',
    settings: {
      ...base,
      profileId: 'spoken-neutral',
      body: { on: true, freq: 220, gain: 1.5, q: 1.0 },
      box: { on: true, freq: 500, gain: -1.0, q: 1.6 },
      diction: { on: true, freq: 3200, gain: 1.2, q: 1.0 },
      air: { on: true, freq: 10000, gain: 0.8, q: 0.7071 },
      deesserMaxDb: 3.0,
      compRatio: 2.5,
      compThresholdDb: -18,
      reverbOn: true,
      reverbWet: 0.04,
      reverbDecaySec: 0.8,
      reverbPredelayMs: 9,
    },
  },
  {
    id: 'raw-bypass',
    label: 'Raw — Full Bypass',
    subtitle: 'Every stage off; safety true-peak limiter only',
    settings: {
      ...base,
      profileId: 'raw-bypass',
      denoiseOn: false,
      gateOn: false,
      hp: { ...base.hp, on: false },
      body: { ...base.body, on: false },
      box: { ...base.box, on: false },
      diction: { ...base.diction, on: false },
      air: { ...base.air, on: false },
      deesserOn: false,
      compOn: false,
      normalizeOn: false,
      reverbOn: false,
    },
  },
];

export const DEFAULT_SETTINGS: DSPSettings = JSON.parse(JSON.stringify(base));

export interface PlayerSnapshot {
  playing: boolean;
  positionMs: number;
  durationMs: number;
  mode: PlayerMode;
}

export interface MasterResult {
  L: Float32Array;
  R: Float32Array;
  sr: number;
  lufs: number;
  tpDb: number;
}

type Handler = {
  state?: (s: EngineState) => void;
  tick?: (ms: number) => void;
  levels?: (bars: number[], rmsDb: number, peakDb: number) => void;
  player?: (p: PlayerSnapshot) => void;
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

class Engine {
  readonly isWeb = Platform.OS === 'web';
  state: EngineState = 'idle';
  inputGain = 1.0;

  private hs = new Set<Handler>();

  // --- web capture graph ---
  private ctx: AudioContext | null = null;
  private media: MediaStream | null = null;
  private srcNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private mr: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private mime = '';
  private raf = 0;
  private bars = new Float32Array(64);
  private startT = 0;
  private accumMs = 0;
  private pauseT = 0;

  // --- playback ---
  private elA: HTMLAudioElement | null = null;
  private elB: HTMLAudioElement | null = null;
  private mode: PlayerMode = 'raw';
  private pAnalyser: AnalyserNode | null = null;
  private pGraphWired = false;
  private pUrlA = '';
  private pUrlB = '';

  // --- native (expo-av) ---
  private nRec: AvAudio.Recording | null = null;
  private nSound: AvAudio.Sound | null = null;
  private nStartT = 0;
  private nMeter = -60;

  on(h: Handler): () => void {
    this.hs.add(h);
    return () => this.hs.delete(h);
  }
  private emit<K extends keyof Handler>(k: K, ...args: any[]) {
    this.hs.forEach((h) => {
      const fn = h[k] as any;
      if (fn) fn(...args);
    });
  }

  // ================= CAPTURE =================

  setInputGain(g: number) {
    this.inputGain = g;
    if (this.gainNode) this.gainNode.gain.setTargetAtTime(g, this.ctx!.currentTime, 0.015);
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const AC: any = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
    }
    if (this.ctx!.state === 'suspended') this.ctx!.resume();
    return this.ctx!;
  }

  async startRecording(): Promise<void> {
    if (!this.isWeb) return this.nativeStart();
    this.ensureCtx();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        sampleRate: 48000,
      } as any,
    });
    this.media = stream;
    const ctx = this.ctx!;
    this.srcNode = ctx.createMediaStreamSource(stream);
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = this.inputGain;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.45;
    this.srcNode.connect(this.gainNode);
    this.gainNode.connect(this.analyser);

    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    this.mime = types.find((t) => (window as any).MediaRecorder?.isTypeSupported?.(t)) || '';
    this.mr = new MediaRecorder(stream, this.mime ? { mimeType: this.mime } : undefined);
    this.chunks = [];
    this.mr.ondataavailable = (e: any) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.mr.start(250);
    this.accumMs = 0;
    this.startT = ctx.currentTime;
    this.state = 'recording';
    this.emit('state', this.state);
    this.startMeterLoop();
  }

  pause() {
    if (!this.isWeb) return this.nativePause();
    if (this.state !== 'recording' || !this.mr) return;
    this.mr.pause();
    this.accumMs += (this.ctx!.currentTime - this.startT) * 1000;
    this.state = 'paused';
    this.emit('state', this.state);
    this.emit('tick', this.accumMs);
    cancelAnimationFrame(this.raf);
    this.bars.fill(0);
    this.emit('levels', Array.from(this.bars), -72, -72);
  }

  resume() {
    if (!this.isWeb) return this.nativeResume();
    if (this.state !== 'paused' || !this.mr) return;
    this.mr.resume();
    this.startT = this.ctx!.currentTime;
    this.state = 'recording';
    this.emit('state', this.state);
    this.startMeterLoop();
  }

  private finalizeElapsed() {
    if (this.state === 'recording') {
      this.accumMs += (this.ctx!.currentTime - this.startT) * 1000;
    }
    return this.accumMs;
  }

  stop(): Promise<{ url: string; durationMs: number; dataUriPromise: Promise<string> }> {
    if (!this.isWeb) return this.nativeStop();
    return new Promise((resolve, reject) => {
      const mr = this.mr;
      if (!mr) return reject(new Error('not recording'));
      mr.onstop = () => {
        cancelAnimationFrame(this.raf);
        this.media?.getTracks().forEach((t) => t.stop());
        this.media = null;
        try {
          this.srcNode?.disconnect();
          this.gainNode?.disconnect();
        } catch {}
        const dur = this.finalizeElapsed();
        this.state = 'idle';
        this.emit('state', this.state);
        this.bars.fill(0);
        this.emit('levels', Array.from(this.bars), -72, -72);
        const blob = new Blob(this.chunks, { type: this.mime || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const dataUriPromise = new Promise<string>((res) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.readAsDataURL(blob);
        });
        resolve({ url, durationMs: dur, dataUriPromise });
      };
      try {
        mr.stop();
      } catch (e) {
        reject(e);
      }
    });
  }

  discard() {
    if (!this.isWeb) return this.nativeDiscard();
    if (!this.mr) return;
    this.mr.onstop = null;
    try { this.mr.stop(); } catch {}
    this.media?.getTracks().forEach((t) => t.stop());
    this.media = null;
    cancelAnimationFrame(this.raf);
    try { this.srcNode?.disconnect(); this.gainNode?.disconnect(); } catch {}
    this.accumMs = 0;
    this.state = 'idle';
    this.emit('state', this.state);
    this.emit('tick', 0);
    this.bars.fill(0);
    this.emit('levels', Array.from(this.bars), -72, -72);
  }

  private startMeterLoop() {
    const ctx = this.ctx!;
    const freq = new Uint8Array(this.analyser!.frequencyBinCount);
    const time = new Uint8Array(this.analyser!.fftSize);
    const loop = () => {
      if (this.state !== 'recording') return;
      const an = this.analyser!;
      an.getByteFrequencyData(freq);
      an.getByteTimeDomainData(time);
      const minB = 3, maxB = freq.length - 1;
      for (let i = 0; i < 64; i++) {
        const t1 = i / 64, t2 = (i + 1) / 64;
        const b1 = Math.floor(minB * Math.pow(maxB / minB, t1));
        const b2 = Math.max(b1 + 1, Math.floor(minB * Math.pow(maxB / minB, t2)));
        let m = 0;
        for (let b = b1; b < b2 && b < maxB; b++) if (freq[b] > m) m = freq[b];
        const v = Math.pow(m / 255, 0.85);
        this.bars[i] = v > this.bars[i] ? v : this.bars[i] * 0.86;
      }
      let sum = 0, pk = 0;
      for (let i = 0; i < time.length; i++) {
        const d = (time[i] - 128) / 128;
        sum += d * d;
        const a = d < 0 ? -d : d;
        if (a > pk) pk = a;
      }
      const rms = Math.sqrt(sum / time.length);
      const rmsDb = clamp(20 * Math.log10(rms + 1e-7), -72, 0);
      const peakDb = clamp(20 * Math.log10(pk + 1e-7), -72, 0);
      this.emit('levels', Array.from(this.bars), rmsDb, peakDb);
      this.emit('tick', this.accumMs + (ctx.currentTime - this.startT) * 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ================= DECODE / MASTER =================

  async decodeUrlToMono(url: string): Promise<{ pcm: Float32Array; sr: number }> {
    const r = await fetch(url);
    const ab = await r.arrayBuffer();
    const ctx = this.ensureCtx();
    const buf: AudioBuffer = await new Promise((res, rej) =>
      ctx.decodeAudioData(ab, res, rej)
    );
    const n = buf.length;
    const pcm = new Float32Array(n);
    const chs = buf.numberOfChannels;
    for (let c = 0; c < chs; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) pcm[i] += d[i] / chs;
    }
    return { pcm, sr: buf.sampleRate };
  }

  private irCache = new Map<number, AudioBuffer>();

  async masterPcm(
    pcmIn: Float32Array,
    srcSr: number,
    s: DSPSettings,
    onStage?: (stage: string) => void
  ): Promise<MasterResult> {
    if (!this.isWeb) throw new Error('Mastering render engine is available in the web build.');
    onStage?.('neural-filter');
    const x = Float32Array.from(pcmIn);
    if (s.gateOn || s.denoiseOn) {
      const thr = s.gateOn ? s.gateThresholdDb : -50;
      const floor = s.denoiseOn ? s.gateFloorDb : -32;
      await dsp.applyNoiseGate(x, srcSr, thr, floor);
    }
    if (s.deesserOn) {
      onStage?.('de-esser');
      await dsp.applyDeEsser(x, srcSr, s.deesserMaxDb);
    }
    onStage?.('render-48k');
    const OAC: any = (globalThis as any).OfflineAudioContext || (globalThis as any).webkitOfflineAudioContext;
    const outSr = 48000;
    const outLen = Math.ceil((x.length * outSr) / srcSr) + Math.floor(outSr * 0.2);
    const off: OfflineAudioContext = new OAC(2, outLen, outSr);
    const buf = off.createBuffer(1, x.length, srcSr);
    (buf as any).copyToChannel
      ? (buf as any).copyToChannel(x, 0)
      : buf.getChannelData(0).set(x);
    const src = off.createBufferSource();
    src.buffer = buf;

    let node: AudioNode = src;
    const chain = (n: AudioNode) => { node.connect(n); node = n; };
    const biq = (type: BiquadFilterType, f: number, q: number, g = 0) => {
      const b = off.createBiquadFilter();
      b.type = type; b.frequency.value = f; b.Q.value = q; if (g) b.gain.value = g;
      return b;
    };

    if (s.hp.on) {
      // 4th-order Butterworth @ 80 Hz (Q pair 0.5412 / 1.3066)
      chain(biq('highpass', s.hp.freq, 0.541196));
      chain(biq('highpass', s.hp.freq, 1.306563));
    }
    if (s.body.on) chain(biq('peaking', s.body.freq, s.body.q, s.body.gain));
    if (s.box.on) chain(biq('peaking', s.box.freq, s.box.q, s.box.gain));
    if (s.diction.on) chain(biq('peaking', s.diction.freq, s.diction.q, s.diction.gain));
    if (s.air.on) chain(biq('highshelf', s.air.freq, 0.7071, s.air.gain));

    const mix = off.createGain();
    if (s.reverbOn && s.reverbWet > 0) {
      const dry = off.createGain();
      dry.gain.value = 1;
      node.connect(dry); dry.connect(mix);
      const dl = off.createDelay(0.5);
      dl.delayTime.value = s.reverbPredelayMs / 1000;
      const conv = off.createConvolver();
      const key = Math.round(s.reverbDecaySec * 100);
      let irBuf = this.irCache.get(key);
      if (!irBuf) {
        const [IL, IR] = dsp.plateIR(outSr, s.reverbDecaySec);
        irBuf = off.createBuffer(2, IL.length, outSr);
        (irBuf.getChannelData(0) as Float32Array).set(IL);
        (irBuf.getChannelData(1) as Float32Array).set(IR);
        this.irCache.set(key, irBuf);
      }
      conv.buffer = irBuf;
      const wet = off.createGain();
      wet.gain.value = s.reverbWet;
      node.connect(dl); dl.connect(conv); conv.connect(wet); wet.connect(mix);
    } else {
      node.connect(mix);
    }

    let tail: AudioNode = mix;
    if (s.compOn) {
      const comp = off.createDynamicsCompressor();
      comp.threshold.value = s.compThresholdDb;
      comp.knee.value = s.compKneeDb;
      comp.ratio.value = s.compRatio;
      comp.attack.value = s.compAttackMs / 1000;
      comp.release.value = s.compReleaseMs / 1000;
      mix.connect(comp); tail = comp;
    }
    const lim = off.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.003;
    lim.release.value = 0.12;
    tail.connect(lim);
    lim.connect(off.destination);
    src.start(0);
    const rendered = await off.startRendering();

    onStage?.('loudness-tp');
    const L = Float32Array.from(rendered.getChannelData(0));
    const R = Float32Array.from(rendered.getChannelData(1));
    let lufs = dsp.loudnessLufs(L, R, outSr);
    if (s.normalizeOn) {
      const gDb = clamp(s.targetLufs - lufs, -20, 24);
      dsp.applyGainDb(L, R, gDb);
      lufs += gDb;
    }
    let tp = dsp.truePeakDb(L, R);
    const ceiling = s.limiterOn ? s.limiterCeilingDb : -1.0;
    if (tp > ceiling) {
      const trim = ceiling - tp;
      dsp.applyGainDb(L, R, trim);
      lufs += trim;
      tp = ceiling;
    }
    return { L, R, sr: outSr, lufs, tpDb: tp };
  }

  encodeWav(L: Float32Array, R: Float32Array, sr: number, depth: 16 | 24): Uint8Array {
    return encodeWavBytes([L, R], sr, depth);
  }

  // ================= PLAYER (A/B) =================

  private wirePlaybackGraph() {
    if (this.pGraphWired || !this.ctx || !this.elA || !this.elB) return;
    try {
      const ctx = this.ctx;
      const a = ctx.createMediaElementSource(this.elA);
      const b = ctx.createMediaElementSource(this.elB);
      this.pAnalyser = ctx.createAnalyser();
      this.pAnalyser.fftSize = 1024;
      this.pAnalyser.smoothingTimeConstant = 0.5;
      a.connect(this.pAnalyser);
      b.connect(this.pAnalyser);
      this.pAnalyser.connect(ctx.destination);
      this.pGraphWired = true;
    } catch {
      this.pAnalyser = null;
    }
  }

  private currentEl(): HTMLAudioElement | null {
    return this.mode === 'raw' ? this.elA : this.elB;
  }

  private attachElEvents(el: HTMLAudioElement) {
    const push = () => this.pushPlayerState();
    el.addEventListener('play', push);
    el.addEventListener('pause', push);
    el.addEventListener('ended', push);
    el.addEventListener('timeupdate', push);
    el.addEventListener('loadedmetadata', push);
  }

  playerLoad(rawUrl: string, masteredUrl?: string) {
    this.pUrlA = rawUrl;
    this.pUrlB = masteredUrl || '';
    if (!this.isWeb) {
      // native: reset expo-av sound so next play loads the new take
      if (this.nSound) {
        this.nSound.unloadAsync().catch(() => {});
        this.nSound = null;
      }
      return;
    }
    this.stopPlaybackMeter();
    if (!this.elA) {
      this.elA = new Audio();
      this.elB = new Audio();
      this.attachElEvents(this.elA);
      this.attachElEvents(this.elB!);
    }
    this.elA!.src = rawUrl;
    this.elB!.src = masteredUrl || '';
    try { this.ensureCtx(); } catch {}
    this.wirePlaybackGraph();
    if (!masteredUrl) this.mode = 'raw';
    this.pushPlayerState();
  }

  playerSetMasteredUrl(url: string) {
    if (!this.isWeb || !this.elB) return;
    this.elB.src = url;
    this.pUrlB = url;
    this.pushPlayerState();
  }

  hasMasteredLoaded(): boolean {
    return !!this.pUrlB;
  }

  playerMode(): PlayerMode {
    return this.mode;
  }

  async playerSetMode(mode: PlayerMode) {
    if (!this.isWeb) return;
    if (mode === 'mastered' && !this.hasMasteredLoaded()) return;
    const cur = this.currentEl();
    const t = cur ? cur.currentTime : 0;
    const wasPlaying = cur ? !cur.paused && !cur.ended : false;
    if (cur && wasPlaying) cur.pause();
    this.mode = mode;
    const next = this.currentEl();
    if (next) {
      if (isFinite(next.duration) && next.duration > 0) {
        next.currentTime = Math.min(t, next.duration - 0.05);
      } else {
        next.currentTime = t;
      }
      if (wasPlaying) {
        try { await next.play(); } catch {}
      }
    }
    this.pushPlayerState();
  }

  async playerPlayPause() {
    if (!this.isWeb) return this.nativePlayPause();
    const el = this.currentEl();
    if (!el || !el.src) return;
    this.ensureCtx();
    if (el.paused || el.ended) {
      try { await el.play(); this.startPlaybackMeter(); } catch {}
    } else {
      el.pause();
    }
    this.pushPlayerState();
  }

  playerSeekMs(ms: number) {
    if (!this.isWeb) return;
    const el = this.currentEl();
    if (!el || !isFinite(el.duration)) return;
    el.currentTime = clamp(ms / 1000, 0, el.duration);
    this.pushPlayerState();
  }

  playerSeekRatio(r: number) {
    if (!this.isWeb) {
      if (this.nSound) {
        this.nSound
          .getStatusAsync()
          .then((st: any) => {
            if (st?.isLoaded && st.durationMillis) {
              this.nSound?.setPositionAsync(
                Math.max(0, Math.min(1, r)) * st.durationMillis
              );
            }
          })
          .catch(() => {});
      }
      return;
    }
    const el = this.currentEl();
    if (!el || !isFinite(el.duration)) return;
    el.currentTime = clamp(r, 0, 1) * el.duration;
    this.pushPlayerState();
  }

  playerSnapshot(): PlayerSnapshot {
    const el = this.currentEl();
    const dur = el && isFinite(el.duration) ? el.duration * 1000 : 0;
    return {
      playing: !!el && !el.paused && !el.ended,
      positionMs: el ? el.currentTime * 1000 : 0,
      durationMs: dur,
      mode: this.mode,
    };
  }

  private pushPlayerState() {
    this.emit('player', this.playerSnapshot());
  }

  private playbackRaf = 0;
  private startPlaybackMeter() {
    cancelAnimationFrame(this.playbackRaf);
    const freq = new Uint8Array(this.pAnalyser ? this.pAnalyser.frequencyBinCount : 512);
    const loop = () => {
      const el = this.currentEl();
      if (!el || el.paused || el.ended) { this.pushPlayerState(); return; }
      if (this.pAnalyser) {
        this.pAnalyser.getByteFrequencyData(freq);
        const minB = 3, maxB = freq.length - 1;
        for (let i = 0; i < 64; i++) {
          const t1 = i / 64, t2 = (i + 1) / 64;
          const b1 = Math.floor(minB * Math.pow(maxB / minB, t1));
          const b2 = Math.max(b1 + 1, Math.floor(minB * Math.pow(maxB / minB, t2)));
          let m = 0;
          for (let b = b1; b < b2 && b < maxB; b++) if (freq[b] > m) m = freq[b];
          const v = Math.pow(m / 255, 0.85);
          this.bars[i] = v > this.bars[i] ? v : this.bars[i] * 0.86;
        }
        this.emit('levels', Array.from(this.bars), -20, -8);
      }
      this.pushPlayerState();
      this.playbackRaf = requestAnimationFrame(loop);
    };
    this.playbackRaf = requestAnimationFrame(loop);
  }
  private stopPlaybackMeter() {
    cancelAnimationFrame(this.playbackRaf);
  }

  stopPlayer() {
    if (!this.isWeb) return;
    this.stopPlaybackMeter();
    [this.elA, this.elB].forEach((el) => {
      if (el && !el.paused) el.pause();
    });
    this.pushPlayerState();
  }

  // ================= NATIVE (expo-av fallback) =================

  private async nativeStart() {
    const perm = await AvAudio.requestPermissionsAsync();
    if (!perm.granted) throw new Error('Microphone permission denied');
    await AvAudio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const rec = new AvAudio.Recording();
    await rec.prepareToRecordAsync({
      ...AvAudio.RecordingOptionsPresets.HIGH_QUALITY,
      isMeteringEnabled: true,
    } as any);
    rec.setProgressUpdateInterval(80);
    rec.setOnRecordingStatusUpdate((st: any) => {
      if (st.isRecording) {
        this.emit('tick', st.durationMillis || 0);
        const m = typeof st.metering === 'number' ? st.metering : -50;
        this.nMeter = m;
        const lvl = clamp((m + 55) / 45, 0, 1);
        for (let i = 0; i < 64; i++) {
          const shape = Math.exp(-Math.pow((i - 14) / 16, 2)) * 0.85 + 0.15 * Math.random();
          const v = clamp(lvl * shape * (0.8 + Math.random() * 0.4), 0, 1);
          this.bars[i] = v > this.bars[i] ? v : this.bars[i] * 0.86;
        }
        this.emit('levels', Array.from(this.bars), m, m + 6);
      }
    });
    await rec.startAsync();
    this.nRec = rec;
    this.nStartT = Date.now();
    this.state = 'recording';
    this.emit('state', this.state);
  }

  private async nativePause() {
    if (this.nRec) {
      await this.nRec.pauseAsync();
      this.state = 'paused';
      this.emit('state', this.state);
    }
  }

  private async nativeResume() {
    if (this.nRec) {
      await this.nRec.startAsync();
      this.state = 'recording';
      this.emit('state', this.state);
    }
  }

  private async nativeStop(): Promise<any> {
    const rec = this.nRec;
    if (!rec) throw new Error('not recording');
    const st: any = await rec.stopAndUnloadAsync();
    const uri = rec.getURI();
    this.nRec = null;
    this.state = 'idle';
    this.emit('state', this.state);
    this.bars.fill(0);
    this.emit('levels', Array.from(this.bars), -72, -72);
    await AvAudio.setAudioModeAsync({ allowsRecordingIOS: false });
    return {
      url: uri || '',
      durationMs: st?.durationMillis || Date.now() - this.nStartT,
      dataUriPromise: Promise.resolve(''),
    };
  }

  private async nativeDiscard() {
    if (this.nRec) {
      try { await this.nRec.stopAndUnloadAsync(); } catch {}
      this.nRec = null;
    }
    this.state = 'idle';
    this.emit('state', this.state);
    this.emit('tick', 0);
    this.bars.fill(0);
    this.emit('levels', Array.from(this.bars), -72, -72);
  }

  private async nativePlayPause() {
    try {
      if (!this.nSound) {
        if (!this.pUrlA) return;
        const { sound } = await AvAudio.Sound.createAsync(
          { uri: this.pUrlA },
          { shouldPlay: true },
          (st: any) => {
            if (!st) return;
            if (st.isLoaded) {
              this.emit('player', {
                playing: !!st.isPlaying,
                positionMs: st.positionMillis || 0,
                durationMs: st.durationMillis || 0,
                mode: 'raw' as PlayerMode,
              });
              if (st.didJustFinish) {
                this.emit('player', {
                  playing: false,
                  positionMs: 0,
                  durationMs: st.durationMillis || 0,
                  mode: 'raw' as PlayerMode,
                });
              }
            }
          }
        );
        this.nSound = sound;
      } else {
        const st: any = await this.nSound.getStatusAsync();
        if (st?.isPlaying) await this.nSound.pauseAsync();
        else if (st?.isLoaded) await this.nSound.playAsync();
      }
    } catch {}
  }
}

export const engine = new Engine();
