import React, { useRef, useState } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';
import { C } from '../lib/theme';

export function StudioSlider({
  value,
  min,
  max,
  step,
  onChange,
  color = C.blue,
  width: fixedW,
  mini,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  color?: string;
  width?: number;
  mini?: boolean;
}) {
  const [layoutW, setLayoutW] = useState(fixedW || 200);
  const valRef = useRef(value);
  valRef.current = value;
  const w = Math.max(40, fixedW || layoutW);

  const setFromX = (x: number) => {
    let r = Math.min(1, Math.max(0, x / w));
    let v = min + r * (max - min);
    if (step) v = Math.round(v / step) * step;
    onChange(Math.min(max, Math.max(min, v)));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    })
  ).current;

  const ratio = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const trackH = mini ? 3.5 : 5;
  const thumb = mini ? 16 : 24;

  return (
    <View
      style={{ width: fixedW || '100%', height: Math.max(thumb, 24), justifyContent: 'center' }}
      onLayout={
        fixedW ? undefined : (e) => setLayoutW(e.nativeEvent.layout.width)
      }
      {...pan.panHandlers}
    >
      <View
        style={{
          height: trackH,
          borderRadius: trackH / 2,
          backgroundColor: C.line2,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: ratio * w,
            backgroundColor: color,
            borderRadius: trackH / 2,
          }}
        />
      </View>
      <View
        style={[
          st.thumb,
          {
            width: thumb,
            height: thumb,
            borderRadius: thumb / 2,
            left: ratio * (w - thumb),
          },
        ]}
        pointerEvents="none"
      />
    </View>
  );
}

const st = StyleSheet.create({
  thumb: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
