import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  engine,
  EngineState,
  DSPSettings,
  DEFAULT_SETTINGS,
  PlayerSnapshot,
  PlayerMode,
  PROFILES,
} from '../lib/engine';
import { encodeWavBytes } from '../lib/wav';

export interface Take {
  id: string;
  name: string;
  createdAt: number;
  durationMs: number;
  rawUrl: string;
  rawPcm?: Float32Array;
  rawSr?: number;
  masteredUrl?: string;
  masteredLufs?: number;
  masteredTpDb?: number;
  waveform: number[];
}

interface EngineContextValue {
  recState: EngineState;
  recTimeMs: number;
  bars: number[];
  rmsDb: number;
  peakDb: number;
  inputGain: number;
  setInputGain: (g: number) => void;
  dsp: DSPSettings;
  setDsp: React.Dispatch<React.SetStateAction<DSPSettings>>;
  applyProfile: (profileId: string) => void;
  takes: Take[];
  currentTake: Take | null;
  selectTake: (id: string) => void;
  player: PlayerSnapshot;
  playerToggle: () => void;
  playerSetMode: (m: PlayerMode) => void;
  playerSeekMs: (ms: number) => void;
  playerSeekRatio: (r: number) => void;
  masteringTakeId: string | null;
  masterStage: string | null;
  exporting: boolean;
  startRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<void>;
  discardRecording: () => void;
  reMaster: (settingsOverride?: DSPSettings) => Promise<void>;
  exportRawTake: () => Promise<void>;
  exportMasteredTake: () => Promise<void>;
  deleteTake: (id: string) => void;
}

const EngineContext = createContext<EngineContextValue | null>(null);

export function EngineProvider({ children }: { children: ReactNode }) {
  const [recState, setRecState] = useState<EngineState>('idle');
  const [recTimeMs, setRecTimeMs] = useState(0);
  const [bars, setBars] = useState<number[]>(() => new Array(64).fill(0));
  const [rmsDb, setRmsDb] = useState(-72);
  const [peakDb, setPeakDb] = useState(-72);
  const [inputGain, setInputGainState] = useState(1.0);
  const [dsp, setDsp] = useState<DSPSettings>(DEFAULT_SETTINGS);
  const [takes, setTakes] = useState<Take[]>([]);
  const [currentTakeId, setCurrentTakeId] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerSnapshot>({
    playing: false,
    positionMs: 0,
    durationMs: 0,
    mode: 'raw',
  });
  const [masteringTakeId, setMasteringTakeId] = useState<string | null>(null);
  const [masterStage, setMasterStage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    return engine.on({
      state: setRecState,
      tick: setRecTimeMs,
      levels: (b, r, p) => {
        setBars(b);
        setRmsDb(r);
        setPeakDb(p);
      },
      player: setPlayer,
    });
  }, []);

  const setInputGain = (g: number) => {
    setInputGainState(g);
    engine.setInputGain(g);
  };

  const applyProfile = (id: string) => {
    const prof = PROFILES.find((p) => p.id === id);
    if (prof) setDsp(JSON.parse(JSON.stringify(prof.settings)));
  };

  const currentTake = takes.find((t) => t.id === currentTakeId) || null;

  const selectTake = (id: string) => {
    setCurrentTakeId(id);
    const t = takes.find((x) => x.id === id);
    if (t) {
      engine.playerLoad(t.rawUrl, t.masteredUrl);
    }
  };

  const startRecording = async () => {
    await engine.startRecording();
  };

  const pauseRecording = () => engine.pause();
  const resumeRecording = () => engine.resume();

  const runMastering = async (take: Take, settings: DSPSettings): Promise<Take> => {
    setMasteringTakeId(take.id);
    try {
      let pcm = take.rawPcm;
      let sr = take.rawSr || 48000;

      if (!pcm && Platform.OS === 'web') {
        setMasterStage('decode');
        const res = await engine.decodeUrlToMono(take.rawUrl);
        pcm = res.pcm;
        sr = res.sr;
      }

      if (!pcm) {
        setMasteringTakeId(null);
        setMasterStage(null);
        return take;
      }

      const mRes = await engine.masterPcm(pcm, sr, settings, (st) => setMasterStage(st));
      const wavBytes = engine.encodeWav(mRes.L, mRes.R, mRes.sr, settings.bitDepth);
      const blob = new Blob([wavBytes.buffer], { type: 'audio/wav' });
      const masteredUrl = URL.createObjectURL(blob);

      const updated: Take = {
        ...take,
        rawPcm: pcm,
        rawSr: sr,
        masteredUrl,
        masteredLufs: mRes.lufs,
        masteredTpDb: mRes.tpDb,
      };

      setTakes((prev) => prev.map((x) => (x.id === take.id ? updated : x)));
      engine.playerSetMasteredUrl(masteredUrl);
      return updated;
    } catch (e) {
      console.error('Mastering error:', e);
      return take;
    } finally {
      setMasteringTakeId(null);
      setMasterStage(null);
    }
  };

  const stopRecording = async () => {
    const { url, durationMs } = await engine.stop();
    const id = 'take_' + Date.now();
    const mockBars = Array.from({ length: 96 }, () => 0.05 + Math.random() * 0.85);

    const newTake: Take = {
      id,
      name: `Take ${takes.length + 1}`,
      createdAt: Date.now(),
      durationMs,
      rawUrl: url,
      waveform: mockBars,
    };

    setTakes((prev) => [newTake, ...prev]);
    setCurrentTakeId(id);
    engine.playerLoad(url);

    if (Platform.OS === 'web') {
      runMastering(newTake, dsp);
    }
  };

  const discardRecording = () => engine.discard();

  const reMaster = async (settingsOverride?: DSPSettings) => {
    if (!currentTake) return;
    const s = settingsOverride || dsp;
    await runMastering(currentTake, s);
  };

  const saveAudioToStorage = async (uri: string, filename: string) => {
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = uri;
      a.download = filename;
      a.click();
      return;
    }
    try {
      const targetUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.copyAsync({ from: uri, to: targetUri });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(targetUri);
      } else {
        Alert.alert('Saved', `Audio saved to local storage: ${targetUri}`);
      }
    } catch (e: any) {
      Alert.alert('Export Error', e.message || 'Failed to export audio');
    }
  };

  const exportRawTake = async () => {
    if (!currentTake) return;
    setExporting(true);
    try {
      await saveAudioToStorage(currentTake.rawUrl, `${currentTake.name}_RAW.wav`);
    } finally {
      setExporting(false);
    }
  };

  const exportMasteredTake = async () => {
    if (!currentTake || !currentTake.masteredUrl) return;
    setExporting(true);
    try {
      await saveAudioToStorage(currentTake.masteredUrl, `${currentTake.name}_MASTERED.wav`);
    } finally {
      setExporting(false);
    }
  };

  const deleteTake = (id: string) => {
    engine.stopPlayer();
    setTakes((prev) => prev.filter((t) => t.id !== id));
    if (currentTakeId === id) {
      setCurrentTakeId(null);
    }
  };

  return (
    <EngineContext.Provider
      value={{
        recState,
        recTimeMs,
        bars,
        rmsDb,
        peakDb,
        inputGain,
        setInputGain,
        dsp,
        setDsp,
        applyProfile,
        takes,
        currentTake,
        selectTake,
        player,
        playerToggle: () => engine.playerPlayPause(),
        playerSetMode: (m) => engine.playerSetMode(m),
        playerSeekMs: (ms) => engine.playerSeekMs(ms),
        playerSeekRatio: (r) => engine.playerSeekRatio(r),
        masteringTakeId,
        masterStage,
        exporting,
        startRecording,
        pauseRecording,
        resumeRecording,
        stopRecording,
        discardRecording,
        reMaster,
        exportRawTake,
        exportMasteredTake,
        deleteTake,
      }}
    >
      {children}
    </EngineContext.Provider>
  );
}

export function useEngine() {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEngine must be used within EngineProvider');
  return ctx;
}
