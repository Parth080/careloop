import { Text, TextInput, View } from 'react-native';

import { categories, categoryLabels, type NoteInput } from '../model';
import { colors, ui } from '../theme';
import { Checkbox, Chip } from './controls';

type Props = { value: NoteInput; onChange: (value: NoteInput) => void; canChangePrivacy: boolean };

export default function NoteEditor({ value, onChange, canChangePrivacy }: Props) {
  return (
    <>
      <Text style={ui.label}>Type</Text>
      <View accessibilityRole="radiogroup" style={ui.row}>
        {categories.map((category) => (
          <Chip
            key={category}
            label={categoryLabels[category]}
            selected={value.category === category}
            onPress={() => onChange({ ...value, category })}
          />
        ))}
      </View>
      <Text style={ui.label}>Title</Text>
      <TextInput
        accessibilityLabel="Title"
        maxLength={120}
        style={ui.input}
        value={value.title}
        onChangeText={(title) => onChange({ ...value, title })}
      />
      <Text style={ui.label}>Details</Text>
      <TextInput
        accessibilityLabel="Details"
        multiline
        maxLength={1000}
        style={[ui.input, ui.largeInput]}
        value={value.details}
        onChangeText={(details) => onChange({ ...value, details })}
      />
      <Text style={ui.label}>When (optional)</Text>
      <TextInput
        accessibilityLabel="When it happened"
        maxLength={200}
        placeholder="For example: this morning"
        placeholderTextColor={colors.placeholder}
        style={ui.input}
        value={value.event_time_text ?? ''}
        onChangeText={(event_time_text) => onChange({ ...value, event_time_text })}
      />
      {canChangePrivacy && (
        <Checkbox
          label="Only me: hide this note from the rest of the care circle"
          checked={value.private}
          onChange={(isPrivate) => onChange({ ...value, private: isPrivate })}
        />
      )}
    </>
  );
}
