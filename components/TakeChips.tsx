import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEngine, Take } from '../state/EngineContext';
import { C, R, mono } from '../lib/theme';
import { fmtMs } from '../lib/format';

export function TakeChips() {
  const { takes, currentTakeId, selectTake } = useEngine();
  if (!takes.length) return null;

  const render = ({ item }: { item: Take }) => {
    const active = item.id === currentTakeId;
    return (
      <TouchableOpacity
        style={[st.chip, active && st.chipActive]}
        onPress={() => selectTake(item.id)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={item.masteredUrl ? 'sparkles' : 'mic'}
          size={12}
          color={active ? C.cyan : C.dim}
        />
        <View>
          <Text
            style={[st.chipLabel, active && { color: C.text }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text style={[st.chipSub, mono]} numberOfLines={1}>
            {fmtMs(item.durationMs, false)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View>
      <FlatList
        horizontal
        data={takes}
        keyExtractor={(t) => t.id}
        renderItem={render}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.card,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: C.line,
  },
  chipActive: { borderColor: C.cyan, backgroundColor: C.card2 },
  chipLabel: { color: C.dim, fontSize: 12, fontWeight: '700', maxWidth: 130 },
  chipSub: { color: C.dimmer, fontSize: 10, fontWeight: '700', marginTop: 1 },
});
