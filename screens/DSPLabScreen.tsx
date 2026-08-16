import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEngine } from '../state/EngineContext';
import { PROFILES } from '../lib/engine';
import { Card, Badge, SettingRow, ValueText } from '../components/primitives';
import { EQGraph } from '../components/EQGraph';
import { StudioSlider } from '../components/Slider';
import { ProfileSheet } from '../components/ProfileSheet';
import { C, R } from '../lib/theme';
import { fmtDb } from '../lib/format';

const ATTACK_RELEASE: [number, number][] = [[5, 40], [12, 80], [20, 120]];
const DECAYS = [0.8, 1.0, 1.2, 1.5];
const PREDELAYS = [0, 9, 18, 27];
const FLOORS = [-50, -60, -80];

export default function DSPLabScreen() {
  const {
    settings,
    updateSettings,
    updateBand,
    applyProfile,
    currentTake,
    reMaster,
    masterStage,
    masteringTakeId,
    dspAvailable,
  } = useEngine();
  const [sheet, setSheet] = useState(false);

  const s = settings;
  const profile = PROFILES.find((p) => p.id === s.profileId);
  const busy = !!masteringTakeId;

  const setBand = (key: 'hp' | 'body' | 'box' | 'diction' | 'air', patch: any) =>
    updateSettings({ [key]: { ...s[key], ...patch } } as any);

  const cycle = (arr: number[], cur: number) => {
    const i = arr.indexOf(cur);
    return arr[(i + 1) % arr.length];
  };

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={st.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={st.header}>
          <View>
            <Text style={st.title}>DSP Lab</Text>
            <Text style={st.subtitle} numberOfLines={1}>
              Naishabda নৈঃশব্দ speech chain • render offline
            </Text>
          </View>
          <Badge icon="flash" label="Engine Active" color={C.cyan} soft />
        </View>

        {/* PROFILE */}
        <Card title="Engine Profile">
          <SettingRow
            icon="person-circle"
            iconColor={C.blue}
            title={profile?.label || 'Custom'}
            subtitle="21Y male vocal • Boya BY-M1 condenser"
            onPress={() => setSheet(true)}
            right={<ValueText color={C.blue}>Change</ValueText>}
            last
          />
        </Card>

        {/* EQ GRAPH */}
        <Card title="Acoustic Transfer EQ" right={<Badge icon="hand-left" label="Drag nodes" color={C.dim} />}>
          <View style={{ paddingHorizontal: 8, paddingTop: 6 }}>
            <EQGraph
              settings={s}
              onBandGain={(key, db) => {
                if (key === 'deesser') updateSettings({ deesserMaxDb: Math.max(0, -db) });
                else updateBand(key, db);
              }}
            />
          </View>
          <View style={st.chipRow}>
            <BandChip label={`B ${fmtDb(s.body.gain)}`} color={C.red} dim={!s.body.on} />
            <BandChip label={`X ${fmtDb(s.box.gain)}`} color={C.amber} dim={!s.box.on} />
            <BandChip label={`D ${fmtDb(s.diction.gain)}`} color={C.cyan} dim={!s.diction.on} />
            <BandChip label={`DS -${s.deesserMaxDb.toFixed(1)}`} color={C.violet} dim={!s.deesserOn} />
            <BandChip label={`A ${fmtDb(s.air.gain)}`} color={C.blue} dim={!s.air.on} />
          </View>
          <SettingRow
            icon="trending-down"
            iconColor={C.red}
            title="Sub-Bass Cut — 80 Hz"
            subtitle="4th-order Butterworth HP • kills rumble & mic pops"
            right={
              <Switch
                value={s.hp.on}
                onValueChange={(v) => setBand('hp', { on: v })}
                trackColor={{ false: C.line2, true: C.red }}
                thumbColor="#FFF"
              />
            }
          />
          <SettingRow
            icon="heart"
            iconColor={C.red}
            title="Chest Body — 250 Hz"
            subtitle="মিষ্টি রেস warm velvety resonance"
            right={
              <>
                <ValueText color={C.red}>{fmtDb(s.body.gain)}</ValueText>
                <Switch
                  value={s.body.on}
                  onValueChange={(v) => setBand('body', { on: v })}
                  trackColor={{ false: C.line2, true: C.red }}
                  thumbColor="#FFF"
                />
              </>
            }
          />
          <SettingRow
            icon="cube"
            iconColor={C.amber}
            title="De-Box Notch — 450 Hz"
            subtitle="Sweeps muffled small-room boxiness"
            right={
              <>
                <ValueText color={C.amber}>{fmtDb(s.box.gain)}</ValueText>
                <Switch
                  value={s.box.on}
                  onValueChange={(v) => setBand('box', { on: v })}
                  trackColor={{ false: C.line2, true: C.amber }}
                  thumbColor="#FFF"
                />
              </>
            }
          />
          <SettingRow
            icon="megaphone"
            iconColor={C.cyan}
            title="Diction — 3.4 kHz"
            subtitle="প ত ক চ consonants 100% sharp"
            right={
              <>
                <ValueText color={C.cyan}>{fmtDb(s.diction.gain)}</ValueText>
                <Switch
                  value={s.diction.on}
                  onValueChange={(v) => setBand('diction', { on: v })}
                  trackColor={{ false: C.line2, true: C.cyan }}
                  thumbColor="#FFF"
                />
              </>
            }
          />
          <SettingRow
            icon="cloudy"
            iconColor={C.blue}
            title="Poetic Air — 10 kHz shelf"
            subtitle="Delicate breath texture sheen"
            right={
              <>
                <ValueText color={C.blue}>{fmtDb(s.air.gain)}</ValueText>
                <Switch
                  value={s.air.on}
                  onValueChange={(v) => setBand('air', { on: v })}
                  trackColor={{ false: C.line2, true: C.blue }}
                  thumbColor="#FFF"
                />
              </>
            }
            last
          />
        </Card>

        {/* NEURAL FILTER */}
        <Card title="Zero-Noise Neural Filter" right={<Badge icon="checkmark-done" label="Hiss 0%" color={C.green} soft />}>
          <SettingRow
            icon="color-wand"
            iconColor={C.green}
            title="RNNoise Neural Suppression"
            subtitle="Learned-style hiss isolation before dynamics"
            right={
              <Switch
                value={s.denoiseOn}
                onValueChange={(v) => updateSettings({ denoiseOn: v })}
                trackColor={{ false: C.line2, true: C.green }}
                thumbColor="#FFF"
              />
            }
          />
          <SettingRow
            icon="git-commit"
            iconColor={C.cyan}
            title="Adaptive Gate Threshold"
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <StudioSlider
                  mini
                  fixedW={118}
                  value={s.gateThresholdDb}
                  min={-70}
                  max={-30}
                  step={1}
                  onChange={(v) => updateSettings({ gateThresholdDb: v, gateOn: true })}
                  color={C.cyan}
                />
                <ValueText color={C.cyan}>{s.gateThresholdDb.toFixed(0)} dB</ValueText>
              </View>
            }
          />
          <SettingRow
            icon="volume-mute"
            iconColor={C.violet}
            title="Gate Floor (silence = absolute 0%)"
            onPress={() =>
              updateSettings({ gateFloorDb: cycle(FLOORS, s.gateFloorDb) })
            }
            right={<ValueText color={C.violet}>{s.gateFloorDb} dBFS</ValueText>}
          />
          <SettingRow
            icon="shield"
            iconColor={C.green}
            title="Formant Preservation"
            subtitle="100 Hz – 4.5 kHz speech untouched, no artifacts"
            right={<ValueText color={C.green}>100%</ValueText>}
            last
          />
        </Card>

        {/* DYNAMICS & LOUDNESS */}
        <Card title="Dynamics & Loudness">
          <SettingRow
            icon="git-compare"
            iconColor={C.blue}
            title="Soft-Knee Compressor"
            subtitle={`Single-pass • ${s.compKneeDb.toFixed(0)} dB knee • thr ${s.compThresholdDb} dB`}
            right={
              <Switch
                value={s.compOn}
                onValueChange={(v) => updateSettings({ compOn: v })}
                trackColor={{ false: C.line2, true: C.blue }}
                thumbColor="#FFF"
              />
            }
          />
          <SettingRow
            icon="resize"
            iconColor={C.blue}
            title="Ratio"
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <StudioSlider
                  mini
                  fixedW={118}
                  value={s.compRatio}
                  min={1.5}
                  max={8}
                  step={0.1}
                  onChange={(v) => updateSettings({ compRatio: Math.round(v * 10) / 10 })}
                  color={C.blue}
                />
                <ValueText color={C.blue}>{s.compRatio.toFixed(1)}:1</ValueText>
              </View>
            }
          />
          <SettingRow
            icon="timer"
            iconColor={C.blue}
            title="Attack / Release"
            onPress={() => {
              const next = ATTACK_RELEASE.find(
                ([a, r]) => a === s.compAttackMs && r === s.compReleaseMs
              );
              const i = next ? ATTACK_RELEASE.indexOf(next) : 0;
              const [a, r] = ATTACK_RELEASE[(i + 1) % ATTACK_RELEASE.length];
              updateSettings({ compAttackMs: a, compReleaseMs: r });
            }}
            right={
              <ValueText color={C.blue}>
                {s.compAttackMs} ms / {s.compReleaseMs} ms
              </ValueText>
            }
          />
          <SettingRow
            icon="lock-closed"
            iconColor={C.amber}
            title="Loudness Target — Social Media"
            subtitle="Broadcast standard for streaming & reels"
            right={<ValueText color={C.amber}>−14.0 LUFS</ValueText>}
          />
          <SettingRow
            icon="lock-closed"
            iconColor={C.red}
            title="True-Peak Lookahead Limiter"
            subtitle="4x oversampled • zero clipping guaranteed"
            right={<ValueText color={C.red}>{s.limiterCeilingDb.toFixed(1)} dBTP</ValueText>}
            last
          />
        </Card>

        {/* REVERB */}
        <Card title="Intimate Studio Booth Reverb">
          <SettingRow
            icon="albums"
            iconColor={C.violet}
            title="Stereo Plate"
            subtitle="Silent treated-booth simulation"
            right={
              <Switch
                value={s.reverbOn}
                onValueChange={(v) => updateSettings({ reverbOn: v })}
                trackColor={{ false: C.line2, true: C.violet }}
                thumbColor="#FFF"
              />
            }
          />
          <SettingRow
            icon="water"
            iconColor={C.violet}
            title="Wet Mix"
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <StudioSlider
                  mini
                  fixedW={118}
                  value={s.reverbWet}
                  min={0}
                  max={0.3}
                  step={0.01}
                  onChange={(v) => updateSettings({ reverbWet: v })}
                  color={C.violet}
                />
                <ValueText color={C.violet}>{Math.round(s.reverbWet * 100)}%</ValueText>
              </View>
            }
          />
          <SettingRow
            icon="time"
            iconColor={C.violet}
            title="Decay Time"
            onPress={() => updateSettings({ reverbDecaySec: cycle(DECAYS, s.reverbDecaySec) })}
            right={<ValueText color={C.violet}>{s.reverbDecaySec.toFixed(1)} s</ValueText>}
          />
          <SettingRow
            icon="hourglass"
            iconColor={C.violet}
            title="Pre-Delay"
            onPress={() => updateSettings({ reverbPredelayMs: cycle(PREDELAYS, s.reverbPredelayMs) })}
            right={<ValueText color={C.violet}>{s.reverbPredelayMs} ms</ValueText>}
            last
          />
        </Card>

        {/* OUTPUT */}
        <Card title="Lossless Output">
          <SettingRow
            icon="disc"
            iconColor={C.cyan}
            title="Export Format"
            subtitle="PCM WAV — master-grade"
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[24, 16].map((d) => (
                  <TouchableOpacity
                    key={d}
                    onPress={() => updateSettings({ bitDepth: d as 16 | 24 })}
                    style={[st.fmtChip, s.bitDepth === d && st.fmtChipActive]}
                  >
                    <Text
                      style={[st.fmtChipText, s.bitDepth === d && { color: C.cyan }]}
                      numberOfLines={1}
                    >
                      {d}-bit
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            }
          />
          <SettingRow
            icon="pulse"
            iconColor={C.cyan}
            title="Sample Rate"
            right={<ValueText color={C.dim}>48 000 Hz • locked</ValueText>}
          />
          <SettingRow
            icon="server"
            iconColor={C.dim}
            title="Render Thread"
            subtitle="OfflineAudioContext — isolated from UI thread"
            right={<ValueText color={C.dim}>{dspAvailable ? 'ARMED' : 'WEB-ONLY'}</ValueText>}
            last
          />
        </Card>

        {/* RE-MASTER action */}
        <TouchableOpacity
          style={[st.remaster, (!currentTake || busy) && { opacity: 0.45 }]}
          disabled={!currentTake || busy}
          onPress={() => reMaster()}
          activeOpacity={0.85}
        >
          {busy ? (
            <>
              <ActivityIndicator color="#FFF" size="small" />
              <Text style={st.remasterText}>
                {masterStage === 'neural-filter'
                  ? 'Neural filter…'
                  : masterStage === 'de-esser'
                  ? 'De-essing…'
                  : masterStage === 'render-48k'
                  ? 'Rendering 48 kHz…'
                  : masterStage === 'loudness-tp'
                  ? 'Locking loudness…'
                  : 'Working…'}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="sparkles" size={16} color="#FFF" />
              <Text style={st.remasterText}>
                {currentTake ? `Re-Master “${currentTake.name}”` : 'Record a take to master'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={st.foot} numberOfLines={2}>
          Every control re-renders the take through the full Naishabda chain:
          gate → de-esser → EQ → plate → comp → −14 LUFS → −1.5 dBTP limiter.
        </Text>
        <View style={{ height: 16 }} />
      </ScrollView>

      <ProfileSheet
        visible={sheet}
        activeId={s.profileId}
        onSelect={applyProfile}
        onClose={() => setSheet(false)}
      />
    </SafeAreaView>
  );
}

function BandChip({ label, color, dim }: { label: string; color: string; dim?: boolean }) {
  return (
    <View
      style={[
        st.bandChip,
        { borderColor: color + (dim ? '22' : '66'), backgroundColor: color + (dim ? '0A' : '1F') },
      ]}
    >
      <Text style={[st.bandChipText, { color: dim ? C.dimmer : color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    gap: 10,
  },
  title: { color: C.text, fontSize: 30, fontWeight: '800' },
  subtitle: { color: C.dim, fontSize: 11.5, marginTop: 2 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  bandChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: R.pill,
    borderWidth: 1,
  },
  bandChipText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  fmtChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: C.inset,
  },
  fmtChipActive: { borderColor: C.cyan, backgroundColor: C.cyanSoft },
  fmtChipText: { color: C.dim, fontSize: 11.5, fontWeight: '800' },
  remaster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.blue,
    borderRadius: 16,
    paddingVertical: 15,
    shadowColor: C.blue,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  remasterText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  foot: { color: C.dimmer, fontSize: 10.5, textAlign: 'center', lineHeight: 15, paddingHorizontal: 20 },
});
