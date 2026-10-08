import { useState } from 'react';
import { Platform } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

import { useTheme } from '../theme';
import { Button, Sheet, type ButtonVariant } from './kit';

type Props = {
  label: string;
  mode: 'time' | 'date';
  initial: Date;
  confirmLabel: (value: Date) => string;
  onPick: (value: Date) => void;
  minimumDate?: Date;
  variant?: ButtonVariant;
};

/** A button that opens a time or date picker: Android's own dialog, or on iOS a spinner in a sheet. */
export function PickerButton({ label, mode, initial, confirmLabel, onPick, minimumDate, variant = 'secondary' }: Props) {
  const { c } = useTheme();
  const [choosing, setChoosing] = useState<Date | null>(null); // the iOS spinner's value while it's open

  if (Platform.OS === 'android') {
    const open = () => DateTimePickerAndroid.open({ value: initial, mode, minimumDate, onValueChange: (_event, value) => onPick(value) });
    return <Button label={label} variant={variant} onPress={open} />;
  }
  return (
    <>
      <Button label={label} variant={variant} onPress={() => setChoosing(initial)} />
      {choosing && (
        <Sheet visible onClose={() => setChoosing(null)} title={mode === 'time' ? 'Choose a time' : 'Choose a day'}>
          <DateTimePicker
            value={choosing}
            mode={mode}
            display="spinner"
            minimumDate={minimumDate}
            textColor={c.text}
            onValueChange={(_event, value) => setChoosing(value)}
            style={{ alignSelf: 'center' }}
          />
          <Button
            label={confirmLabel(choosing)}
            onPress={() => {
              onPick(choosing);
              setChoosing(null);
            }}
          />
        </Sheet>
      )}
    </>
  );
}
