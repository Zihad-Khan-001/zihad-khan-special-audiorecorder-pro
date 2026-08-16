import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { C } from '../lib/theme';

const BARS = 64;

export function Visualizer({
  bars,
  color,
  height = 132,
  idle,
}: {
  bars: number[];
  color: 'red' | 'cyan' | 'idle';
  height?: number;
  idle?: boolean;
}) {
  const [w, setW] = useState(320);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!idle) return;
    const iv = setInterval(() => setTick((t) => t + 1), 90);
    return () => clearInterval(iv);
  }, [idle]);

  const gap = 2;
  const bw = Math.max(1.6, (w - (BARS - 1) * gap) / BARS);

  const fill = useMemo(() => {
    if (color === 'red') return C.red;
    if (color === 'cyan') return C.cyan;
    return C.line2;
  }, [color]);

  return (
    <View style={{ width: '100%', height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={height}>
        {Array.from({ length: BARS }).map((_, i) => {
          let v = bars[i] || 0;
          if (idle) {
            v = 0.045 + 0.03 * Math.abs(Math.sin(tick * 0.4 + i * 0.42));
          }
          const h = Math.max(3, v * (height - 8));
          const x = i * (bw + gap);
          const y = (height - h) / 2;
          const opacity = idle ? 0.8 : 0.35 + 0.65 * Math.min(1, v * 1.6);
          return (
            <Rect key={i} x={x} y={y} width={bw} height={h} rx={bw / 2} fill={fill} opacity={opacity} />
          );
        })}
      </Svg>
    </View>
  );
}
