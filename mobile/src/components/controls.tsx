import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, ui } from '../theme';

type ButtonVariant = 'primary' | 'outline' | 'text' | 'danger' | 'emergency' | 'stop';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function Button({ label, onPress, variant = 'primary', disabled = false, accessibilityLabel }: ButtonProps) {
  const filled = variant === 'primary' || variant === 'emergency' || variant === 'stop';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.base, styles[variant], disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={[styles.label, filled ? styles.filledLabel : variant === 'danger' ? styles.dangerLabel : styles.plainLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Notice({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={ui.notice}>
      {message}
    </Text>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={styles.checkboxRow}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>{checked && <Text style={styles.tick}>✓</Text>}</View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  primary: { backgroundColor: colors.primary },
  emergency: { backgroundColor: colors.emergency },
  stop: { backgroundColor: colors.stop },
  outline: { borderWidth: 1.5, borderColor: colors.primary, minHeight: 52 },
  text: { minHeight: 48 },
  danger: { minHeight: 48 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
  label: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  filledLabel: { color: colors.onPrimary },
  plainLabel: { color: colors.link },
  dangerLabel: { color: colors.danger },
  chip: { borderWidth: 1, borderColor: colors.chipBorder, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: '#315440', fontSize: 16 },
  chipTextSelected: { color: colors.onPrimary, fontWeight: '700' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  box: { width: 30, height: 30, borderRadius: 7, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  boxChecked: { backgroundColor: colors.primary },
  tick: { color: colors.onPrimary, fontSize: 18, fontWeight: '900' },
  checkboxLabel: { flex: 1, color: colors.text, fontSize: 17, lineHeight: 24 },
});
