import { ScrollView, View } from 'react-native';

import { categories, categoryLabels, type NoteInput } from '../model';
import { Checkbox, Chip, Field, Txt } from './kit';

type Props = { value: NoteInput; onChange: (value: NoteInput) => void; canChangePrivacy: boolean };

/** The parts of a note a person can change: type, title, details, when, and who can see it. */
export default function NoteFields({ value, onChange, canChangePrivacy }: Props) {
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Txt v="label">Type</Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="radiogroup">
          {categories.map((category) => (
            <Chip key={category} label={categoryLabels[category]} selected={value.category === category} onPress={() => onChange({ ...value, category })} />
          ))}
        </ScrollView>
      </View>
      <Field label="Title" maxLength={120} value={value.title} onChangeText={(title) => onChange({ ...value, title })} />
      <Field label="Details" multiline maxLength={1000} value={value.details} onChangeText={(details) => onChange({ ...value, details })} />
      <Field
        label="When"
        maxLength={200}
        placeholder="For example: this morning"
        value={value.event_time_text ?? ''}
        onChangeText={(event_time_text) => onChange({ ...value, event_time_text })}
      />
      {canChangePrivacy && (
        <Checkbox label="Only me: hide from the care circle" checked={value.private} onChange={(isPrivate) => onChange({ ...value, private: isPrivate })} />
      )}
    </View>
  );
}
