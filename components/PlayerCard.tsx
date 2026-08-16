import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEngine } from '../state/EngineContext';
import { C, R, mono } from '../lib/theme';
import { fmtMs } from '../lib/format';

const STAGE_LABELS: Record<string, string> = {
  decode: 'Decoding raw PCM…',
  'neural-filter': 'Neural filter — hiss → 0%…',
  'de-esser': 'Dynamic de-esser…',
  'render-48k': 'Rendering 48 kHz offline chain…',
  'loudness-tp': 'Locking −14.0 LUFS • −1.5 dBTP…',
};

export function PlayerCard() {
  const {
    currentTake,
    player,
    playerToggle,
    playerSetMode,
    playerSeekRatio,
    masteringTakeId,
    masterStage,
    exportTake,
    reMaster,
    deleteTake,
    exporting,
  } = useEngine();

  const ind = useRef(new Animated.Value(player.mode === 'mastered' ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(ind, {
      toValue: player.mode === 'mastered' ? 1 : 0,
      useNativeDriver: false,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [player.mode, ind]);

  const [ww, setWw] = useState(320);
  const waveW = useRef(320);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => playerSeekRatio(e.nativeEvent.locationX / waveW.current),
      onPanResponderMove: (e) => playerSeekRatio(e.nativeEvent.locationX / waveW.current),
    })
  ).current;

  const mastering = !!currentTake && masteringTakeId === currentTake.id;
  const masteredReady = !!currentTake?.masteredUrl && !mastering;

  const wave = currentTake?.waveform;
  const bars = useMemo(() => {
    if (wave && wave.length) return wave;
    return new Array(96).fill(0.07);
  }, [wave]);

  const progress =
    player.durationMs > 0 ? Math.min(1, player.positionMs / player.durationMs) : 0;
  const activeColor = player.mode === 'mastered' ? C.cyan : C.red;

  if (!currentTake) return null;

  const d = new Date(currentTake.createdAt);
  const dateStr = `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;

  return (
    <View style={st.card}>
      {/* header */}
      <View style={st.head}>
        <View style={{ flex: 1 }}>
          <Text style={st.name} numberOfLines={1}>
            {currentTake.name}
          </Text>
          <Text style={st.meta} numberOfLines={1}>
            Today {dateStr} • {fmtMs(currentTake.durationMs, false)}
            {masteredReady ? ' • Mastered' : ''}
          </Text>
        </View>
        {mastering ? (
          <View style={st.masteringPill}>
            <ActivityIndicator size="small" color={C.cyan} />
          </View>
        ) : masteredReady ? (
          <View style={[st.pill, { borderColor: C.cyan + '55', backgroundColor: C.cyanSoft }]}>
            <Ionicons name="checkmark-circle" size={11} color={C.cyan} />
            <Text style={[st.pillText, { color: C.cyan }]}>HISS 0%</Text>
          </View>
        ) : null}
      </View>

      {/* A/B segmented control */}
      <View style={st.segWrap}>
        <View style={st.seg}>
          <Animated.View
            style={[
              st.segInd,
              {
                backgroundColor:
                  player.mode === 'mastered' ? 'rgba(0,229,204,0.18)' : 'rgba(255,71,87,0.18)',
                borderColor: player.mode === 'mastered' ? C.cyan : C.red,
                left: ind.interpolate({ inputRange: [0, 1], outputRange: ['1.5%', '50.5%'] }),
              },
            ]}
          />
          <TouchableOpacity
            style={st.segBtn}
            activeOpacity={0.7}
            onPress={() => playerSetMode('raw')}
          >
            <Ionicons
              name="pulse"
              size={13}
              color={player.mode === 'raw' ? C.red : C.dim}
            />
            <Text style={[st.segText, { color: player.mode === 'raw' ? C.red : C.dim }]}>
              RAW
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={st.segBtn}
            activeOpacity={0.7}
            disabled={!masteredReady}
            onPress={() => playerSetMode('mastered')}
          >
            <Ionicons
              name="sparkles"
              size={13}
              color={player.mode === 'mastered' ? C.cyan : C.dim}
            />
            <Text
              style={[
                st.segText,
                { color: player.mode === 'mastered' ? C.cyan : C.dim },
              ]}
            >
              MASTERED
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* mastering stage line */}
      {mastering ? (
        <View style={st.stageRow}>
          <Ionicons name="cog" size={12} color={C.cyan} />
          <Text style={st.stageText} numberOfLines={1}>
            {STAGE_LABELS[masterStage || ''] || 'Naishabda engine working…'}
          </Text>
        </View>
      ) : null}

      {/* waveform + seek */}
      <View
        style={st.waveWrap}
        onLayout={(e) => {
          setWw(e.nativeEvent.layout.width);
          waveW.current = e.nativeEvent.layout.width;
        }}
        {...pan.panHandlers}
      >
        <View style={st.waveRow}>
          {bars.map((v, i) => (
            <View
              key={i}
              style={[
                st.waveBar,
                {
                  height: Math.max(3, v * 54),
                  backgroundColor: C.line2,
                },
              ]}
            />
          ))}
        </View>
        <View
          style={[st.waveOverlay, { width: progress * ww }]}
          pointerEvents="none"
        >
          <View style={[st.waveRow, { width: ww }]}>
            {bars.map((v, i) => (
              <View
                key={i}
                style={[
                  st.waveBar,
                  { height: Math.max(3, v * 54), backgroundColor: activeColor },
                ]}
              />
            ))}
          </View>
        </View>
        <View
          style={[st.playhead, { left: progress * ww - 1, backgroundColor: activeColor }]}
          pointerEvents="none"
        />
      </View>

      {/* transport */}
      <View style={st.transport}>
        <Text style={[st.time, { color: activeColor }]} numberOfLines={1}>
          {fmtMs(player.positionMs)}
        </Text>
        <View style={st.transportMid}>
          <TouchableOpacity
            style={st.skipBtn}
            onPress={() => {
              if (player.durationMs > 0) {
                playerSeekRatio(
                  Math.max(0, (player.positionMs - 15000) / player.durationMs)
                );
              }
            }}
          >
            <Ionicons name="play-back" size={17} color={C.dim} />
          </TouchableOpacity>
          <TouchableOpacity style={st.playBtn} onPress={playerToggle} activeOpacity={0.85}>
            <Ionicons
              name={player.playing ? 'pause' : 'play'}
              size={26}
              color="#FFFFFF"
              style={{ marginLeft: player.playing ? 0 : 2 }}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={st.skipBtn}
            onPress={() => {
              if (player.durationMs > 0) {
                playerSeekRatio(
                  Math.min(1, (player.positionMs + 15000) / player.durationMs)
                );
              }
            }}
          >
            <Ionicons name="play-forward" size={17} color={C.dim} />
          </TouchableOpacity>
        </View>
        <Text style={st.time} numberOfLines={1}>
          {player.durationMs > 0 ? fmtMs(player.durationMs, false) : '--:--'}
        </Text>
      </View>

      {/* master metrics */}
      {masteredReady ? (
        <View style={st.metrics}>
          <Metric label={`${(currentTake.masteredLufs ?? -14).toFixed(1)} LUFS`} />
          <Metric label={`${(currentTake.masteredTpDb ?? -1.5).toFixed(1)} dBTP`} />
          <Metric label="48 kHz" />
          <Metric label={"24-bit"} />
        </View>
      ) : null}

      {/* actions */}
      <View style={st.actions}>
        <TouchableOpacity
          style={[st.actionPrimary, exporting && { opacity: 0.5 }]}
          onPress={() => exportTake()}
          disabled={exporting}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-down-circle" size={16} color="#FFF" />
          <Text style={st.actionPrimaryText}>{exporting ? 'Rendering…' : 'Export WAV'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.actionGhost}
          onPress={() => reMaster()}
          disabled={mastering}
          activeOpacity={0.7}
        >
          <Ionicons name="sync" size={15} color={C.cyan} />
          <Text style={[st.actionGhostText, { color: C.cyan }]}>Re-Master</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.actionGhost}
          onPress={() => deleteTake(currentTake.id)}
          activeOpacity={0.7}
        >
          <Ionicons name="trash" size={15} color={C.red} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Metric({ label }: { label: string }) {
  return (
    <View style={st.metric}>
      <Ionicons name="shield-checkmark" size={10} color={C.cyan} />
      <Text style={st.metricText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: R.card,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { color: C.text, fontSize: 16, fontWeight: '700' },
  meta: { color: C.dim, fontSize: 11, marginTop: 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: R.pill,
    borderWidth: 1,
  },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  masteringPill: {
    width: 34,
    height: 24,
    borderRadius: R.pill,
    backgroundColor: C.cyanSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segWrap: {},
  seg: {
    flexDirection: 'row',
    backgroundColor: C.inset,
    borderRadius: 12,
    padding: 3,
    position: 'relative',
  },
  segInd: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    width: '48%',
    borderRadius: 10,
    borderWidth: 1,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  segText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 4,
  },
  stageText: { color: C.cyan, fontSize: 11.5, fontWeight: '600', flex: 1 },
  waveWrap: { height: 60, justifyContent: 'center', overflow: 'hidden' },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 60,
    gap: 2,
  },
  waveBar: { flex: 1, borderRadius: 1.5 },
  waveOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  playhead: { position: 'absolute', top: 2, bottom: 2, width: 2, borderRadius: 1 },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  transportMid: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.blue,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  skipBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: { ...mono, color: C.dim, fontSize: 12, fontWeight: '700', minWidth: 78, textAlign: 'center' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.cyanSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: R.pill,
  },
  metricText: { color: C.cyan, fontSize: 10.5, fontWeight: '700', ...mono },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: C.blue,
    paddingVertical: 12,
    borderRadius: 14,
  },
  actionPrimaryText: { color: '#FFF', fontSize: 13.5, fontWeight: '800', letterSpacing: 0.2 },
  actionGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.card2,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 14,
  },
  actionGhostText: { fontSize: 12.5, fontWeight: '700' },
});
