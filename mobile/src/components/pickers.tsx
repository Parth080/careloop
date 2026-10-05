import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

import { colors } from '../theme';
import { Button } from './controls';

type Props = {
  label: string;
  mode: 'time' | 'date';
  initial: Date;
  confirmLabel: (value: Date) => string;
  onPick: (value: Date) => void;
  minimumDate?: Date;
};

/** A button that opens a time or date picker: Android's own dialog, or a spinner here on iOS. */
export function PickerButton({ label, mode, initial, confirmLabel, onPick, minimumDate }: Props) {
  const [choosing, setChoosing] = useState<Date | null>(null); // the iOS spinner's value while it's open

  if (Platform.OS === 'android') {
    const open = () => DateTimePickerAndroid.open({ value: initial, mode, minimumDate, onValueChange: (_event, value) => onPick(value) });
    return <Button label={label} variant="outline" onPress={open} />;
  }
  if (!choosing) return <Button label={label} variant="outline" onPress={() => setChoosing(initial)} />;
  return (
    <View style={styles.spinner}>
      <DateTimePicker
        value={choosing}
        mode={mode}
        display="spinner"
        minimumDate={minimumDate}
        textColor={colors.heading}
        onValueChange={(_event, value) => setChoosing(value)}
      />
      <Button
        label={confirmLabel(choosing)}
        onPress={() => {
          onPick(choosing);
          setChoosing(null);
        }}
      />
      <Button label="Cancel" variant="text" onPress={() => setChoosing(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  spinner: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 8, gap: 4 },
});
