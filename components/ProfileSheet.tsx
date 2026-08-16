import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PROFILES } from '../lib/engine';
import { C, R } from '../lib/theme';

export function ProfileSheet({
  visible,
  activeId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.overlay} onPress={onClose}>
        <Pressable style={st.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={st.grabber} />
          <Text style={st.title}>Engine Profile</Text>
          <Text style={st.sub}
            numberOfLines={1}>
            Vocal chain presets for Boya BY-M1 • 48 kHz render
          </Text>
          {PROFILES.map((p) => {
            const active = p.id === activeId;
            return (
              <TouchableOpacity
                key={p.id}
                style={[st.opt, active && st.optActive]}
                onPress={() => {
                  onSelect(p.id);
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    st.radio,
                    { borderColor: active ? C.blue : C.line2 },
                  ]}
                >
                  {active ? <View style={st.radioFill} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.optLabel, active && { color: C.text }]} numberOfLines={1}>
                    {p.label}
                  </Text>
                  <Text style={st.optSub} numberOfLines={1}>
                    {p.subtitle}
                  </Text>
                </View>
                {active ? <Ionicons name="checkmark" size={16} color={C.blue} /> : null}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={st.done} onPress={onClose} activeOpacity={0.85}>
            <Text style={st.doneText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: C.line2,
    marginBottom: 12,
  },
  title: { color: C.text, fontSize: 17, fontWeight: '800', marginBottom: 2 },
  sub: { color: C.dim, fontSize: 11.5, marginBottom: 14 },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 6,
  },
  optActive: { backgroundColor: C.blueSoft, borderColor: 'rgba(10,132,255,0.4)' },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioFill: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.blue },
  optLabel: { color: C.dim, fontSize: 14, fontWeight: '700' },
  optSub: { color: C.dimmer, fontSize: 11, marginTop: 2 },
  done: {
    marginTop: 8,
    backgroundColor: C.blue,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 13,
  },
  doneText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
});
