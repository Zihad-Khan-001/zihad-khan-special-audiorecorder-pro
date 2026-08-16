import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEngine, useMeter } from '../state/EngineContext';
import { Visualizer } from '../components/Visualizer';
import { PlayerCard } from '../components/PlayerCard';
import { TakeChips } from '../components/TakeChips';
import { StudioSlider } from '../components/Slider';
import { Badge } from '../components/primitives';
import { C, R, mono } from '../lib/theme';
import { fmtMs } from '../lib/format';

type EngineStateName = 'idle' | 'recording' | 'paused';

// -------- meter-isolated pieces (rerender at meter rate only) --------

function LiveHeader({ engineState, playing }: { engineState: EngineStateName; playing: boolean }) {
  const { rmsDb } = useMeter();
  const blink = useRef(new Animated.Value(1)).current;
  const recording = engineState === 'recording';
  useEffect(() => {
    if (!recording) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.25, duration: 650, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => {
      anim.stop();
      blink.setValue(1);
    };
  }, [recording, blink]);

  const label = recording
    ? 'RECORDING — LIVE INPUT'
    : engineState === 'paused'
    ? 'PAUSED'
    : playing
    ? 'PLAYBACK — MONITOR'
    : 'INPUT — Boya BY-M1 Condenser';

  return (
    <View style={st.recTopRow}>
      <View style={st.liveLabelRow}>
        <Animated.View
          style={[
            st.liveDot,
            { opacity: recording ? blink : 1, backgroundColor: recording ? C.red : C.line2 },
          ]}
        />
        <Text style={[st.liveLabel, { color: recording ? C.red : C.dim }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[st.dbfs, mono]} numberOfLines={1}>
        {rmsDb <= -70 ? '−−.−' : rmsDb.toFixed(1)} dBFS
      </Text>
    </View>
  );
}

function LiveVisualizer({ engineState, playing }: { engineState: EngineStateName; playing: boolean }) {
  const { bars } = useMeter();
  const color: 'red' | 'cyan' | 'idle' =
    engineState === 'recording' ? 'red' : playing ? 'cyan' : 'idle';
  return (
    <Visualizer
      bars={bars}
      color={color}
      idle={engineState === 'idle' && !playing}
      height={128}
    />
  );
}

function BigCounter({ engineState }: { engineState: EngineStateName }) {
  const { elapsedMs } = useMeter();
  return (
    <View style={st.counterWrap}>
      <Text style={[st.counter, mono]} numberOfLines={1}>
        {fmtMs(engineState === 'idle' ? 0 : elapsedMs)}
      </Text>
      {engineState === 'paused' ? <Text style={st.pausedTag}>PAUSED</Text> : null}
    </View>
  );
}

function MeterStrip({ engineState }: { engineState: EngineStateName }) {
  const { rmsDb, peakDb } = useMeter();
  const levelPct = Math.max(0, Math.min(1, (rmsDb + 60) / 60));
  const peakPct = Math.max(0, Math.min(1, (peakDb + 60) / 60));
  return (
    <View style={st.meterRow}>
      <Ionicons name="speedometer" size={12} color={C.dim} />
      <View style={st.meterTrack}>
        <View
          style={[
            st.meterFill,
            {
              width: `${levelPct * 100}%`,
              backgroundColor: engineState === 'recording' ? C.red : C.cyan,
            },
          ]}
        />
        <View style={[st.meterPeakTick, { left: `${peakPct * 100}%` }]} />
      </View>
      <Text style={[st.meterDb, mono]} numberOfLines={1}>
        pk {peakDb <= -70 ? '−−' : peakDb.toFixed(0)}
      </Text>
    </View>
  );
}

// -------- screen --------

export default function StudioScreen() {
  const {
    engineState,
    inputGain,
    setInputGain,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
    generateTestTake,
    micDenied,
    error,
    clearError,
    player,
  } = useEngine();

  const recording = engineState === 'recording';
  const idle = engineState === 'idle';

  const press = useRef(new Animated.Value(0)).current;
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] });

  const gainDb = inputGain <= 0.02 ? '−∞ dB' : `${(20 * Math.log10(inputGain)).toFixed(1)} dB`;

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={st.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={st.header}>
          <View>
            <Text style={st.title}>Studio</Text>
            <Text style={st.subtitle} numberOfLines={1}>
              Naishabda Voice Engine • 48 kHz session
            </Text>
          </View>
          <Badge icon="mic" label="Boya BY-M1 • Calibrated" color={C.cyan} soft />
        </View>

        <TakeChips />

        <View style={st.recCard}>
          <LiveHeader engineState={engineState} playing={player.playing} />
          <LiveVisualizer engineState={engineState} playing={player.playing} />
          <BigCounter engineState={engineState} />
          <MeterStrip engineState={engineState} />

          <View style={st.gainRow}>
            <Ionicons name="options" size={15} color={C.dim} />
            <Text style={st.gainLabel} numberOfLines={1}>
              Input Gain
            </Text>
            <View style={{ flex: 1 }}>
              <StudioSlider
                value={inputGain}
                min={0.05}
                max={2}
                onChange={setInputGain}
                color={C.cyan}
              />
            </View>
            <Text style={[st.gainVal, mono]} numberOfLines={1}>
              {gainDb}
            </Text>
          </View>

          <View style={st.specRow}>
            <Text style={st.specText} numberOfLines={1}>
              256-sample buffer • zero-copy meters • DSP render on isolated audio thread
            </Text>
          </View>

          {error ? (
            <View style={st.errBox}>
              <View style={{ flex: 1 }}>
                <Text style={st.errTitle}>Microphone unavailable</Text>
                <Text style={st.errText}>{error}</Text>
              </View>
              <TouchableOpacity onPress={clearError} hitSlop={8}>
                <Ionicons name="close" size={16} color={C.dim} />
              </TouchableOpacity>
            </View>
          ) : null}
          {micDenied ? (
            <TouchableOpacity style={st.testBtn} onPress={generateTestTake} activeOpacity={0.85}>
              <Ionicons name="flask" size={15} color={C.blue} />
              <Text style={st.testBtnText}>
                Generate 14s male-vocal test signal (runs the full mastering chain)
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={st.controls}>
          <View style={st.sideSlot}>
            {!idle ? (
              <TouchableOpacity style={st.sideBtn} onPress={discardRecording} activeOpacity={0.8}>
                <Ionicons name="close" size={20} color={C.dim} />
              </TouchableOpacity>
            ) : null}
          </View>

          <Animated.View style={{ transform: [{ scale }] }}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPressIn={() =>
                Animated.timing(press, { toValue: 1, duration: 90, useNativeDriver: true }).start()
              }
              onPressOut={() =>
                Animated.timing(press, { toValue: 0, duration: 130, useNativeDriver: true }).start()
              }
              onPress={() => {
                if (idle) startRecording();
                else stopRecording();
              }}
              style={[st.recOuter, !idle && st.recOuterLive]}
            >
              {idle ? (
                <View style={st.recInner}>
                  <Ionicons name="mic" size={30} color="#FFF" />
                </View>
              ) : (
                <View style={st.stopSquare} />
              )}
            </TouchableOpacity>
          </Animated.View>

          <View style={st.sideSlot}>
            {!idle ? (
              <TouchableOpacity
                style={[st.sideBtn, { backgroundColor: C.cyanSoft, borderColor: C.cyan + '44' }]}
                onPress={recording ? pauseRecording : resumeRecording}
                activeOpacity={0.8}
              >
                <Ionicons name={recording ? 'pause' : 'mic'} size={18} color={C.cyan} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <Text style={st.controlHint} numberOfLines={1}>
          {idle
            ? 'Tap to begin recitation capture'
            : recording
            ? 'Center: finish • Right: pause'
            : 'Center: finish & master • Right: resume'}
        </Text>

        <PlayerCard />

        <Text style={st.foot} numberOfLines={1}>
          Naishabda নৈঃশব্দ — zero-hiss poetry mastering engine
        </Text>
        <View style={{ height: 12 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 2,
  },
  title: { color: C.text, fontSize: 30, fontWeight: '800', letterSpacing: 0.2 },
  subtitle: { color: C.dim, fontSize: 11.5, marginTop: 2 },
  recCard: {
    backgroundColor: C.card,
    borderRadius: R.card,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
    gap: 12,
  },
  recTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  liveLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  liveDot: { width: 9, height: 9, borderRadius: 4.5 },
  liveLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.0, flexShrink: 1 },
  dbfs: { color: C.cyan, fontSize: 12, fontWeight: '700' },
  counterWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  counter: { color: C.text, fontSize: 44, fontWeight: '200', letterSpacing: 1 },
  pausedTag: { color: C.amber, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meterTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.inset,
    overflow: 'hidden',
  },
  meterFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  meterPeakTick: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: C.amber },
  meterDb: { color: C.dim, fontSize: 10, fontWeight: '700', width: 42 },
  gainRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gainLabel: { color: C.dim, fontSize: 12, fontWeight: '600', width: 66 },
  gainVal: { color: C.text, fontSize: 12, fontWeight: '700', width: 58, textAlign: 'right' },
  specRow: { alignItems: 'center' },
  specText: { color: C.dimmer, fontSize: 10, fontWeight: '600', letterSpacing: 0.2 },
  errBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: C.redSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.red + '44',
    padding: 12,
  },
  errTitle: { color: C.red, fontSize: 12.5, fontWeight: '800', marginBottom: 2 },
  errText: { color: C.dim, fontSize: 11.5, lineHeight: 16 },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.blueSoft,
    borderWidth: 1,
    borderColor: C.blue + '55',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  testBtnText: { color: C.blue, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 34,
    marginTop: 2,
  },
  sideSlot: { width: 54, alignItems: 'center' },
  sideBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3.5,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recOuterLive: { borderColor: 'rgba(255,71,87,0.55)' },
  recInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: C.red,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.red,
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  stopSquare: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: C.red,
    shadowColor: C.red,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  controlHint: {
    textAlign: 'center',
    color: C.dimmer,
    fontSize: 11,
    fontWeight: '600',
    marginTop: -6,
  },
  foot: { textAlign: 'center', color: C.dimmer, fontSize: 10.5, fontWeight: '600' },
});
