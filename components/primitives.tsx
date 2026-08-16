import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, R } from '../lib/theme';

export function Card({
  title,
  right,
  children,
  style,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[s.card, style]}>
      {title ? (
        <View style={s.cardHead}>
          <Text style={s.cardTitle} numberOfLines={1}>
            {title}
          </Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Badge({
  icon,
  label,
  color = C.cyan,
  soft,
}: {
  icon?: string;
  label: string;
  color?: string;
  soft?: boolean;
}) {
  return (
    <View
      style={[
        s.badge,
        { borderColor: color + '55', backgroundColor: soft ? color + '1F' : 'transparent' },
      ]}
    >
      {icon ? <Ionicons name={icon as any} size={11} color={color} /> : null}
      <Text style={[s.badgeText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function SettingRow({
  icon,
  iconColor = C.cyan,
  title,
  subtitle,
  right,
  onPress,
  last,
}: {
  icon: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const inner = (
    <View style={[s.row, !last && s.rowBorder]}>
      <View style={[s.rowIcon, { backgroundColor: iconColor + '1A' }]}>
        <Ionicons name={icon as any} size={15} color={iconColor} />
      </View>
      <View style={s.rowMid}>
        <Text style={s.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.rowSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={s.rowRight}>{right}</View> : null}
      {onPress ? (
        <Ionicons name="chevron-forward" size={14} color={C.dimmer} style={{ marginLeft: 4 }} />
      ) : null}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.6}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

export function ValueText({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <Text style={[s.value, color ? { color } : null]} numberOfLines={1}>
      {children}
    </Text>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: R.card,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  cardTitle: {
    color: C.dim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: R.pill,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    maxHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowMid: { flex: 1, justifyContent: 'center', marginRight: 10 },
  rowTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
  rowSub: { color: C.dim, fontSize: 11, marginTop: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: {
    color: C.dim,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as any,
  },
});
