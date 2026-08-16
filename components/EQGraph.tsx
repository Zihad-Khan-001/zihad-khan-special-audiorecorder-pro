import React, { useMemo, useRef, useState } from 'react';
import { View, PanResponder } from 'react-native';
import Svg, { Path, Line, Circle, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as dsp from '../lib/dspMath';
import { DSPSettings } from '../lib/engine';
import { C } from '../lib/theme';

const FS = 48000;
const FMIN = 20;
const FMAX = 20000;
const DB_MAX = 15;
const DB_MIN = -15;

const GRID_FREQS = [50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000];
const GRID_LABELS: Record<number, string> = {
  50: '50', 100: '100', 250: '250', 500: '500',
  1000: '1k', 2000: '2k', 4000: '4k', 8000: '8k', 16000: '16k',
};
const GRID_DB = [-12, -6, 0, 6, 12];

type DragKey = 'body' | 'box' | 'diction' | 'air' | 'deesser';

interface DotDef {
  key: DragKey;
  freq: number;
  gain: number; // plotted dB
  color: string;
  label: string;
}

export function EQGraph({
  settings,
  onBandGain,
  height = 190,
}: {
  settings: DSPSettings;
  onBandGain: (key: DragKey, db: number) => void;
  height?: number;
}) {
  const [w, setW] = useState(330);
  const mL = 30;
  const mR = 12;
  const mT = 12;
  const mB = 20;
  const pw = Math.max(40, w - mL - mR);
  const ph = height - mT - mB;

  const fx = (f: number) => mL + (Math.log(f / FMIN) / Math.log(FMAX / FMIN)) * pw;
  const gy = (db: number) => mT + ((DB_MAX - db) / (DB_MAX - DB_MIN)) * ph;
  const dbPerPx = (DB_MAX - DB_MIN) / ph;

  const { pathStr, fillStr } = useMemo(() => {
    const s = settings;
    const bands: dsp.Biquad[] = [];
    if (s.hp.on) {
      bands.push(dsp.highpass(s.hp.freq, 0.541196, FS));
      bands.push(dsp.highpass(s.hp.freq, 1.306563, FS));
    }
    if (s.body.on) bands.push(dsp.peaking(s.body.freq, s.body.q, s.body.gain, FS));
    if (s.box.on) bands.push(dsp.peaking(s.box.freq, s.box.q, s.box.gain, FS));
    if (s.diction.on) bands.push(dsp.peaking(s.diction.freq, s.diction.q, s.diction.gain, FS));
    if (s.air.on) bands.push(dsp.highshelf(s.air.freq, s.air.gain, FS));
    if (s.deesserOn && s.deesserMaxDb > 0)
      bands.push(dsp.peaking(6000, 2.2, -s.deesserMaxDb, FS));

    const freqs = dsp.logFreqs(160, FMIN, FMAX);
    const pts = freqs.map((f) => {
      let db = 0;
      for (const b of bands) db += dsp.biquadMagDb(b, f, FS);
      db = Math.max(DB_MIN + 0.5, Math.min(DB_MAX - 0.5, db));
      return [fx(f), gy(db)] as const;
    });
    let p = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) p += ` L ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
    const fpath =
      p +
      ` L ${(mL + pw).toFixed(1)} ${gy(0).toFixed(1)} L ${mL.toFixed(1)} ${gy(0).toFixed(1)} Z`;
    return { pathStr: p, fillStr: fpath };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, w, height]);

  const dots: DotDef[] = [
    { key: 'body', freq: settings.body.freq, gain: settings.body.gain, color: C.red, label: '250' },
    { key: 'box', freq: settings.box.freq, gain: settings.box.gain, color: C.amber, label: '450' },
    { key: 'diction', freq: settings.diction.freq, gain: settings.diction.gain, color: C.cyan, label: '3.4k' },
    { key: 'deesser', freq: 6000, gain: -settings.deesserMaxDb, color: C.violet, label: 'DS' },
    { key: 'air', freq: settings.air.freq, gain: settings.air.gain, color: C.blue, label: '10k' },
  ];

  const dotRanges: Record<DragKey, [number, number]> = {
    body: [-6, 8],
    box: [-8, 4],
    diction: [-6, 8],
    deesser: [-6, 0],
    air: [-6, 8],
  };

  return (
    <View style={{ width: '100%', height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={height}>
        <Defs>
          <LinearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.cyan} stopOpacity="0.28" />
            <Stop offset="1" stopColor={C.cyan} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        {GRID_FREQS.map((f) => (
          <React.Fragment key={f}>
            <Line x1={fx(f)} y1={mT} x2={fx(f)} y2={mT + ph} stroke={C.line} strokeWidth={1} />
            <SvgText
              x={fx(f)}
              y={height - 6}
              fontSize={9}
              fill={C.dimmer}
              textAnchor="middle"
            >
              {GRID_LABELS[f]}
            </SvgText>
          </React.Fragment>
        ))}
        {GRID_DB.map((db) => (
          <React.Fragment key={db}>
            <Line
              x1={mL}
              y1={gy(db)}
              x2={mL + pw}
              y2={gy(db)}
              stroke={db === 0 ? C.line2 : C.line}
              strokeWidth={db === 0 ? 1.2 : 1}
              strokeDasharray={db === 0 ? undefined : '3 4'}
            />
            <SvgText x={4} y={gy(db) + 3} fontSize={8.5} fill={C.dimmer}>
              {db > 0 ? `+${db}` : db}
            </SvgText>
          </React.Fragment>
        ))}
        {settings.hp.on ? (
          <React.Fragment>
            <Line
              x1={fx(settings.hp.freq)}
              y1={mT}
              x2={fx(settings.hp.freq)}
              y2={mT + ph}
              stroke={C.red}
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.65}
            />
            <SvgText x={fx(settings.hp.freq) + 3} y={mT + 9} fontSize={8.5} fill={C.red}>
              HPF 80
            </SvgText>
          </React.Fragment>
        ) : null}
        <Path d={fillStr} fill="url(#eqfill)" />
        <Path d={pathStr} fill="none" stroke={C.cyan} strokeWidth={2} strokeLinejoin="round" />
        {dots.map((d) => {
          const off =
            (d.key === 'body' && !settings.body.on) ||
            (d.key === 'box' && !settings.box.on) ||
            (d.key === 'diction' && !settings.diction.on) ||
            (d.key === 'air' && !settings.air.on) ||
            (d.key === 'deesser' && !settings.deesserOn);
          return (
            <React.Fragment key={d.key}>
              <Circle
                cx={fx(d.freq)}
                cy={gy(d.gain)}
                r={7.5}
                fill={C.card2}
                stroke={d.color}
                strokeWidth={2}
                opacity={off ? 0.3 : 1}
              />
              <Circle cx={fx(d.freq)} cy={gy(d.gain)} r={2.4} fill={d.color} opacity={off ? 0.3 : 1} />
            </React.Fragment>
          );
        })}
      </Svg>
      {dots.map((d) => (
        <DragHandle
          key={d.key}
          x={fx(d.freq)}
          y={gy(d.gain)}
          onDrag={(dy, startDb) => {
            const [lo, hi] = dotRanges[d.key];
            let db = startDb - dy * dbPerPx;
            db = Math.max(lo, Math.min(hi, db));
            onBandGain(d.key, Math.round(db * 10) / 10);
          }}
          startDb={d.gain}
        />
      ))}
    </View>
  );
}

function DragHandle({
  x,
  y,
  startDb,
  onDrag,
}: {
  x: number;
  y: number;
  startDb: number;
  onDrag: (dy: number, startDb: number) => void;
}) {
  const startRef = useRef(startDb);
  startRef.current = startDb;
  const grabDb = useRef(startDb);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        grabDb.current = startRef.current;
      },
      onPanResponderMove: (_e, gs) => {
        onDrag(gs.dy, grabDb.current);
      },
    })
  ).current;
  return (
    <View
      {...pan.panHandlers}
      style={{
        position: 'absolute',
        left: x - 18,
        top: y - 18,
        width: 36,
        height: 36,
      }}
    />
  );
}
