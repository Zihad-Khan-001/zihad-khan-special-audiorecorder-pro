import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  engine,
  DEFAULT_SETTINGS,
  PROFILES,
  DSPSettings,
  EngineState,
  PlayerMode,
  PlayerSnapshot,
} from '../lib/engine';
import * as dsp from '../lib/dspMath';
import { encodeWavBytes } from '../lib/wav';

export interface Take {
  id: string;
  name: string;
  createdAt: number;
  durationMs: number;
  rawUrl: string;
  rawDataUri?: string;
  waveform: number[];
  masteredUrl?: string;
  masteredLufs?: number;
  masteredTpDb?: number;
  profileUsedId?: string;
}

interface StoredTake {
  id: string; name: string; createdAt: number; durationMs: number;
  rawDataUri?: string; waveform: number[];
  masteredLufs?: number; masteredTpDb?: number; profileUsedId?: string;
}

const SETTINGS_KEY = 'naishabda.settings.v1';
const TAKES_KEY = 'naishabda.takes.v1';

// Session caches (PCM is re-rendered from stored raw audio on demand).
const pcmCache = new Map<string, { L: Float32Array; R: Float32Array; sr: number }>();
const rawPcmCache = new Map<string, { pcm: Float32Array; sr: number }>();

export interface EngineCtx {
  ready: boolean;
  settings: DSPSettings;
  updateSettings: (patch: Partial<DSPSettings>) => void;
  updateBand: (key: 'hp' | 'body' | 'box' | 'diction' | 'air', gain: number) => void;
  applyProfile: (id: string) => void;

  engineState: EngineState;
  inputGain: number;
  setInputGain: (g: number) => void;
  startRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<void>;
  discardRecording: () => void;
  generateTestTake: () => Promise<void>;
  micDenied: boolean;
  error?: string;
  clearError: () => void;

  takes: Take[];
  currentTakeId?: string;
  currentTake?: Take;
  selectTake: (id: string) => void;
  deleteTake: (id: string) => void;

  masterStage?: string;
  masteringTakeId?: string;
  reMaster: (id?: string) => Promise<void>;
  exportTake: (id?: string, depth?: 16 | 24) => Promise<void>;
  exporting: boolean;

  player: PlayerSnapshot;
  playerToggle: () => void;
  playerSetMode: (m: PlayerMode) => void;
  playerSeekRatio: (r: number) => void;
  dspAvailable: boolean;
}

const Ctx = createContext<EngineCtx | null>(null);

let takeCounter = 1;

function sanitizeSettings(s: any): DSPSettings {
  try {
    const merged = { ...DEFAULT_SETTINGS, ...s };
    ['hp', 'body', 'box', 'diction', 'air'].forEach((k: any) => {
      merged[k] = { ...(DEFAULT_SETTINGS as any)[k], ...(s?.[k] || {}) };
    });
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<DSPSettings>(DEFAULT_SETTINGS);
  const [engineState, setEngineState] = useState<EngineState>(engine.state);
  const [inputGain, _setInputGain] = useState(1.0);
  const [takes, setTakes] = useState<Take[]>([]);
  const [currentTakeId, setCurrentTakeId] = useState<string | undefined>();
  const [masterStage, setMasterStage] = useState<string | undefined>();
  const [masteringTakeId, setMasteringTakeId] = useState<string | undefined>();
  const [micDenied, setMicDenied] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [exporting, setExporting] = useState(false);
  const [player, setPlayer] = useState<PlayerSnapshot>({
    playing: false, positionMs: 0, durationMs: 0, mode: 'raw',
  });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const takesRef = useRef(takes);
  takesRef.current = takes;

  // ---------- persistence ----------
  const persistTakes = useCallback(async (list: Take[]) => {
    try {
      const stored: StoredTake[] = list.slice(0, 8).map((t) => ({
        id: t.id, name: t.name, createdAt: t.createdAt, durationMs: t.durationMs,
        rawDataUri: t.rawDataUri, waveform: t.waveform,
        masteredLufs: t.masteredLufs, masteredTpDb: t.masteredTpDb,
        profileUsedId: t.profileUsedId,
      }));
      await AsyncStorage.setItem(TAKES_KEY, JSON.stringify(stored));
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [sRaw, tRaw] = await Promise.all([
          AsyncStorage.getItem(SETTINGS_KEY),
          AsyncStorage.getItem(TAKES_KEY),
        ]);
        if (sRaw) setSettings(sanitizeSettings(JSON.parse(sRaw)));
        if (tRaw) {
          const stored: StoredTake[] = JSON.parse(tRaw);
          const hydrated: Take[] = stored
            .filter((t) => t.rawDataUri)
            .map((t) => ({
              ...t,
              rawUrl: t.rawDataUri || '',
            }));
          takeCounter = hydrated.length + 1;
          setTakes(hydrated);
        }
      } catch {}
      setReady(true);
    })();
  }, []);

  // ---------- engine events ----------
  useEffect(() => {
    const off = engine.on({
      state: (s) => setEngineState(s),
      player: (p) =>
        setPlayer((prev) =>
          prev.playing === p.playing &&
          prev.mode === p.mode &&
          prev.durationMs === p.durationMs &&
          Math.abs(prev.positionMs - p.positionMs) < 150
            ? prev
            : { ...p }
        ),
    });
    return off;
  }, []);

  // smooth-ish position polling while playing (diff-checked to avoid idle re-renders)
  useEffect(() => {
    const sameish = (a: PlayerSnapshot, b: PlayerSnapshot) =>
      a.playing === b.playing &&
      a.mode === b.mode &&
      a.durationMs === b.durationMs &&
      Math.abs(a.positionMs - b.positionMs) < 150;
    const iv = setInterval(() => {
      if (engine.isWeb) {
        const snap = engine.playerSnapshot();
        setPlayer((prev) => (sameish(prev, snap) ? prev : { ...snap }));
      }
    }, 250);
    return () => clearInterval(iv);
  }, []);

  // ---------- settings ----------
  const updateSettings = useCallback((patch: Partial<DSPSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const updateBand = useCallback(
    (key: 'hp' | 'body' | 'box' | 'diction' | 'air', gain: number) => {
      updateSettings({ [key]: { ...settingsRef.current[key], gain } } as any);
    },
    [updateSettings]
  );

  const applyProfile = useCallback((id: string) => {
    const p = PROFILES.find((x) => x.id === id);
    if (!p) return;
    const next = JSON.parse(JSON.stringify(p.settings));
    setSettings(next);
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // ---------- takes ----------
  const currentTake = useMemo(
    () => takes.find((t) => t.id === currentTakeId),
    [takes, currentTakeId]
  );

  const ensureRawUrl = useCallback(async (t: Take): Promise<string> => {
    if (t.rawUrl && !t.rawUrl.startsWith('data:')) return t.rawUrl;
    if (engine.isWeb && t.rawDataUri) {
      try {
        const blob = await (await fetch(t.rawDataUri)).blob();
        const url = URL.createObjectURL(blob);
        setTakes((prev) => prev.map((x) => (x.id === t.id ? { ...x, rawUrl: url } : x)));
        return url;
      } catch {}
    }
    return t.rawUrl;
  }, []);

  const loadIntoPlayer = useCallback(
    async (t: Take) => {
      if (!engine.isWeb) return;
      const raw = await ensureRawUrl(t);
      engine.playerLoad(raw, t.masteredUrl);
    },
    [ensureRawUrl]
  );

  const selectTake = useCallback(
    (id: string) => {
      setCurrentTakeId(id);
      const t = takesRef.current.find((x) => x.id === id);
      if (t) loadIntoPlayer(t);
    },
    [loadIntoPlayer]
  );

  const decodeTakePcm = useCallback(
    async (t: Take): Promise<{ pcm: Float32Array; sr: number }> => {
      const hit = rawPcmCache.get(t.id);
      if (hit) return hit;
      const url = await ensureRawUrl(t);
      const d = await engine.decodeUrlToMono(url);
      rawPcmCache.set(t.id, d);
      return d;
    },
    [ensureRawUrl]
  );

  const currentTakeIdRef = useRef<string | undefined>();
  currentTakeIdRef.current = currentTakeId;

  const masterTake = useCallback(
    async (t: Take) => {
      if (!engine.isWeb) return;
      setMasteringTakeId(t.id);
      setMasterStage('decode');
      try {
        const { pcm, sr } = await decodeTakePcm(t);
        const res = await engine.masterPcm(pcm, sr, settingsRef.current, (st) => setMasterStage(st));
        pcmCache.set(t.id, { L: res.L, R: res.R, sr: res.sr });
        const bytes = encodeWavBytes([res.L, res.R], res.sr, settingsRef.current.bitDepth);
        const blob = new Blob([bytes], { type: 'audio/wav' });
        const url = (URL as any).createObjectURL(blob);
        setTakes((prev) => {
          const next = prev.map((x) =>
            x.id === t.id
              ? {
                  ...x,
                  masteredUrl: url,
                  masteredLufs: res.lufs,
                  masteredTpDb: res.tpDb,
                  profileUsedId: settingsRef.current.profileId,
                }
              : x
          );
          persistTakes(next);
          return next;
        });
        if (currentTakeIdRef.current === t.id) {
          engine.playerSetMasteredUrl(url);
          engine.playerSetMode('mastered');
        }
      } catch (e: any) {
        setError(e?.message || 'Mastering failed');
      } finally {
        setMasteringTakeId(undefined);
        setMasterStage(undefined);
      }
    },
    [decodeTakePcm, persistTakes]
  );

  const reMaster = useCallback(
    async (id?: string) => {
      const takeId = id || currentTakeIdRef.current;
      const t = takesRef.current.find((x) => x.id === takeId);
      if (!t || !engine.isWeb) return;
      if (masteringTakeId) return;
      await masterTake(t);
    },
    [masteringTakeId, masterTake]
  );

  const finalizeTake = useCallback(
    async (partial: {
      rawUrl: string; durationMs: number; rawDataUri?: string;
      pcm?: Float32Array; sr?: number;
    }) => {
      const id = `take-${Date.now()}`;
      const name = `Poetry Take ${takeCounter++}`;
      let waveform: number[] = new Array(96).fill(0.08);
      if (partial.pcm && partial.sr) {
        rawPcmCache.set(id, { pcm: partial.pcm, sr: partial.sr });
        waveform = dsp.waveformPeaks(partial.pcm, 96);
      }
      const t: Take = {
        id,
        name,
        createdAt: Date.now(),
        durationMs: partial.durationMs,
        rawUrl: partial.rawUrl,
        rawDataUri: partial.rawDataUri,
        waveform,
      };
      setTakes((prev) => {
        const next = [t, ...prev];
        persistTakes(next);
        return next;
      });
      setCurrentTakeId(id);
      await loadIntoPlayer(t);
      // waveform from decode (mic path)
      if (!partial.pcm && engine.isWeb) {
        try {
          const d = await decodeTakePcm(t);
          const wf = dsp.waveformPeaks(d.pcm, 96);
          setTakes((prev) => {
            const next = prev.map((x) => (x.id === id ? { ...x, waveform: wf } : x));
            persistTakes(next);
            return next;
          });
        } catch {}
      }
      // kick mastering render in background
      masterTake(t);
    },
    [persistTakes, loadIntoPlayer, decodeTakePcm, masterTake]
  );

  const stopRecording = useCallback(async () => {
    try {
      const res = await engine.stop();
      const dataUri = await res.dataUriPromise;
      await finalizeTake({ rawUrl: res.url, durationMs: res.durationMs, rawDataUri: dataUri || undefined });
    } catch (e: any) {
      setError(e?.message || 'Could not finish recording');
    }
  }, [finalizeTake]);

  const startRecording = useCallback(async () => {
    setError(undefined);
    engine.stopPlayer();
    try {
      await engine.startRecording();
      setMicDenied(false);
    } catch (e: any) {
      setMicDenied(true);
      setError(
        'Microphone blocked. Allow mic access for this page (browser padlock icon) — or generate the test signal below.'
      );
    }
  }, []);

  const generateTestTake = useCallback(async () => {
    if (!engine.isWeb) {
      setError('Test-signal generator is available in the web build.');
      return;
    }
    try {
      const sr = 48000;
      const pcm = dsp.synthesizeTestSignal(sr, 14);
      const bytes = encodeWavBytes([pcm, pcm], sr, 16);
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = (URL as any).createObjectURL(blob);
      let dataUri: string | undefined;
      try {
        dataUri = await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        });
      } catch {}
      await finalizeTake({ rawUrl: url, durationMs: 14000, rawDataUri: dataUri, pcm, sr });
    } catch (e: any) {
      setError(e?.message || 'Test signal failed');
    }
  }, [finalizeTake]);

  const deleteTake = useCallback(
    (id: string) => {
      setTakes((prev) => {
        const next = prev.filter((x) => x.id !== id);
        persistTakes(next);
        return next;
      });
      pcmCache.delete(id);
      rawPcmCache.delete(id);
      if (currentTakeId === id) {
        setCurrentTakeId(undefined);
        engine.stopPlayer();
      }
    },
    [persistTakes, currentTakeId]
  );

  const exportTake = useCallback(
    async (id?: string, depth?: 16 | 24) => {
      const takeId = id || currentTakeId;
      const t = takesRef.current.find((x) => x.id === takeId);
      if (!t || !engine.isWeb) return;
      setExporting(true);
      try {
        let cached = pcmCache.get(t.id);
        if (!cached) {
          setMasteringTakeId(t.id);
          setMasterStage('render-48k');
          const { pcm, sr } = await decodeTakePcm(t);
          const res = await engine.masterPcm(pcm, sr, settingsRef.current, (st) => setMasterStage(st));
          cached = { L: res.L, R: res.R, sr: res.sr };
          pcmCache.set(t.id, cached);
          setMasteringTakeId(undefined);
          setMasterStage(undefined);
        }
        const d = depth || settingsRef.current.bitDepth;
        const bytes = encodeWavBytes([cached.L, cached.R], cached.sr, d);
        const blob = new Blob([bytes], { type: 'audio/wav' });
        const url = (URL as any).createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${t.name.replace(/\s+/g, '_')}_Naishabda_${d}bit_48k.wav`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => (URL as any).revokeObjectURL(url), 4000);
      } catch (e: any) {
        setError(e?.message || 'Export failed');
      } finally {
        setExporting(false);
        setMasteringTakeId(undefined);
        setMasterStage(undefined);
      }
    },
    [currentTakeId, decodeTakePcm]
  );

  const playerToggle = useCallback(() => {
    engine.playerPlayPause();
  }, []);
  const playerSetMode = useCallback((m: PlayerMode) => {
    engine.playerSetMode(m);
  }, []);
  const playerSeekRatio = useCallback((r: number) => {
    engine.playerSeekRatio(r);
  }, []);
  const setInputGain = useCallback((g: number) => {
    _setInputGain(g);
    engine.setInputGain(g);
  }, []);

  const value: EngineCtx = {
    ready,
    settings,
    updateSettings,
    updateBand,
    applyProfile,
    engineState,
    inputGain,
    setInputGain,
    startRecording,
    pauseRecording: useCallback(() => engine.pause(), []),
    resumeRecording: useCallback(() => engine.resume(), []),
    stopRecording,
    discardRecording: useCallback(() => engine.discard(), []),
    generateTestTake,
    micDenied,
    error,
    clearError: useCallback(() => setError(undefined), []),
    takes,
    currentTakeId,
    currentTake,
    selectTake,
    deleteTake,
    masterStage,
    masteringTakeId,
    reMaster,
    exportTake,
    exporting,
    player,
    playerToggle,
    playerSetMode,
    playerSeekRatio,
    dspAvailable: Platform.OS === 'web',
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEngine(): EngineCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEngine outside provider');
  return v;
}

// ---------- Fast meter stream (isolated so 30-60fps updates don't rerender screens) ----------

interface MeterState {
  bars: number[];
  rmsDb: number;
  peakDb: number;
  elapsedMs: number;
}

const MeterCtx = createContext<MeterState>({
  bars: new Array(64).fill(0),
  rmsDb: -72,
  peakDb: -72,
  elapsedMs: 0,
});

export function MeterProvider({ children }: { children: React.ReactNode }) {
  const [m, setM] = useState<MeterState>({
    bars: new Array(64).fill(0),
    rmsDb: -72,
    peakDb: -72,
    elapsedMs: 0,
  });
  const last = useRef(0);

  useEffect(() => {
    const off = engine.on({
      levels: (bars, rmsDb, peakDb) => {
        const now = Date.now();
        if (now - last.current < 33) return;
        last.current = now;
        setM((prev) => ({ bars: bars as number[], rmsDb, peakDb, elapsedMs: prev.elapsedMs }));
      },
      tick: (ms) => {
        setM((prev) => ({ ...prev, elapsedMs: ms }));
      },
    });
    return off;
  }, []);

  return <MeterCtx.Provider value={m}>{children}</MeterCtx.Provider>;
}

export function useMeter(): MeterState {
  return useContext(MeterCtx);
}
