import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CareApi } from '../api';
import { Button, Checkbox, CheckConfirm, Expander, Icon, ModalScreen, Notice, Segments, Txt } from '../components/kit';
import MedicineFields from '../components/MedicineFields';
import {
  errorMessage,
  formFromDraft,
  localDate,
  medicineProblem,
  modelLabel,
  toMedicineInput,
  type MedicineForm,
  type PrescriptionReading,
} from '../model';
import type { Photo } from '../photos';
import { radius, useTheme } from '../theme';

type Item = { form: MedicineForm; keep: boolean; checked: boolean };
type Props = { api: CareApi; photo: Photo; onClose: () => void; onSaved: () => void; onDone: (message: string) => void };

/** Reading a prescription photo, then checking each medicine against it, one at a time. */
export default function PrescriptionCheck({ api, photo, onClose, onSaved, onDone }: Props) {
  const { c, s } = useTheme();
  const [reading, setReading] = useState<PrescriptionReading | null>(null);
  const [problem, setProblem] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [step, setStep] = useState(0);
  const [enlarged, setEnlarged] = useState(false);
  const [adviceSaved, setAdviceSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let current = true;
    api
      .readPrescription(photo.base64, 'image/jpeg')
      .then((result) => {
        if (!current) return;
        setReading(result);
        setItems(result.medicines.map((medicine) => ({ form: formFromDraft(medicine, localDate()), keep: true, checked: false })));
      })
      .catch((error) => current && setProblem(errorMessage(error)));
    return () => {
      current = false;
    };
  }, [api, photo]);

  const update = (index: number, change: Partial<Item>) => setItems((all) => all.map((item, i) => (i === index ? { ...item, ...change } : item)));
  const item = items[step];
  const last = step === items.length - 1;
  const kept = items.filter((one) => one.keep);

  function next() {
    if (item.keep) {
      if (!item.checked) return setMessage(`Compare ${item.form.name || 'this medicine'} with the photo, then tick "I checked this against the photo".`);
      const wrong = medicineProblem(item.form);
      if (wrong) return setMessage(wrong);
    }
    setMessage('');
    setStep(step + 1);
  }

  async function save() {
    if (item.keep) {
      if (!item.checked) return setMessage(`Compare ${item.form.name || 'this medicine'} with the photo, then tick "I checked this against the photo".`);
      const wrong = medicineProblem(item.form);
      if (wrong) return setMessage(wrong);
    }
    if (kept.length === 0) return onClose();
    setBusy(true);
    const unsaved: Item[] = [];
    for (const one of kept) {
      try {
        await api.addMedicine(toMedicineInput(one.form));
      } catch (error) {
        unsaved.push(one);
        setMessage(`Not saved: ${errorMessage(error)}`);
      }
    }
    setBusy(false);
    onSaved();
    if (unsaved.length > 0) {
      setItems(unsaved);
      setStep(0);
      return;
    }
    onDone(kept.length === 1 ? 'Medicine saved.' : `${kept.length} medicines saved.`);
  }

  async function saveAdvice() {
    if (!reading) return;
    try {
      await api.createNote({
        category: 'general',
        title: "Doctor's advice",
        details: reading.other_instructions.join('\n').slice(0, 1000),
        event_time_text: null,
        private: false,
        source_text: reading.readings[0].text.slice(0, 4000),
        model: reading.organizing_model,
      });
      setAdviceSaved(true);
      onSaved();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  if (!reading || items.length === 0) {
    return (
      <ModalScreen onClose={onClose} title={problem ? "Couldn't read it" : reading ? 'No medicines found' : 'Reading the prescription'} footer={(problem || reading) && <Button label="Close" onPress={onClose} />}>
        <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 260, borderRadius: radius.lg, backgroundColor: c.surfaceSunken }} resizeMode="contain" />
        {problem ? (
          <Notice tone="warning" icon="alert" message={problem} />
        ) : reading ? (
          <>
            <Txt v="body">No medicines were found in this photo. You can add them yourself from the Medicines page.</Txt>
            <ReadingExtras reading={reading} adviceSaved={adviceSaved} onSaveAdvice={saveAdvice} />
          </>
        ) : (
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 12 }}>
            <ActivityIndicator size="large" color={c.primary} />
            <Txt v="bodyLarge" style={{ textAlign: 'center' }}>
              Two AI readers are reading the photo. This usually takes under 20 seconds.
            </Txt>
          </View>
        )}
      </ModalScreen>
    );
  }

  const header = (
    <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Txt v="title2" accessibilityRole="header" style={{ flex: 1 }}>
          Check medicine {step + 1} of {items.length}
        </Txt>
        <Button label="Close" variant="quiet" onPress={onClose} />
      </View>
      <Segments marks={items.map((_, index) => (index <= step ? 'taken' : 'none'))} />
    </View>
  );
  const nextName = items[step + 1]?.form.name || `medicine ${step + 2}`;
  const footer = (
    <>
      <Notice message={message} tone="warning" />
      {last ? (
        <Button
          label={busy ? 'Saving…' : kept.length === 0 ? 'Close without saving' : kept.length === 1 ? 'Save 1 medicine' : `Save ${kept.length} medicines`}
          disabled={busy || (item.keep && !item.checked)}
          onPress={save}
        />
      ) : (
        <Button label={`Next: ${nextName}`} disabled={item.keep && !item.checked} onPress={next} />
      )}
      {step > 0 && <Button label="Back to the last medicine" variant="quiet" onPress={() => setStep(step - 1)} />}
    </>
  );

  return (
    <ModalScreen onClose={onClose} header={header} footer={footer} scrollKey={step}>
      <View style={[s.card, { flexDirection: 'row', gap: 14, padding: 14 }]}>
        <Pressable accessibilityRole="imagebutton" accessibilityLabel="Prescription photo. Tap to enlarge." onPress={() => setEnlarged(true)}>
          <Image source={{ uri: photo.uri }} style={{ width: 76, height: 96, borderRadius: radius.sm, backgroundColor: c.surfaceSunken }} resizeMode="cover" />
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt v="bodySmall" tone="textMuted">
            On the prescription
          </Txt>
          <Txt v="headline">{item.form.source_text ? `"${item.form.source_text}"` : 'This line was hard to read.'}</Txt>
          <Button label="Tap to enlarge photo" variant="quiet" onPress={() => setEnlarged(true)} style={{ paddingHorizontal: 0, alignSelf: 'flex-start' }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Icon name="alert" color={c.onWarning} />
        <Txt v="body" tone="textSecondary" style={{ flex: 1 }}>
          Two AI readers read the photo. Anything they disagreed on or couldn't read is marked ⚠.
        </Txt>
      </View>
      <View style={[s.card, { paddingVertical: 4 }]}>
        <Checkbox label="Add this medicine" bold checked={item.keep} onChange={(keep) => update(step, { keep })} />
      </View>
      {item.keep ? (
        <>
          <MedicineFields key={step} value={item.form} api={api} onChange={(form) => update(step, { form })} />
          <CheckConfirm label="I checked this against the photo" checked={item.checked} onChange={(checked) => update(step, { checked })} />
        </>
      ) : (
        <Txt v="body" tone="textSecondary">
          This one won't be added.
        </Txt>
      )}

      {last && <ReadingExtras reading={reading} adviceSaved={adviceSaved} onSaveAdvice={saveAdvice} />}

      <PhotoViewer uri={photo.uri} visible={enlarged} onClose={() => setEnlarged(false)} />
    </ModalScreen>
  );
}

/** The rest of the prescription: advice that isn't about one medicine, and what each reader saw. */
function ReadingExtras({ reading, adviceSaved, onSaveAdvice }: { reading: PrescriptionReading; adviceSaved: boolean; onSaveAdvice: () => void }) {
  const { s } = useTheme();
  const [showReadings, setShowReadings] = useState(false);
  return (
    <>
      {reading.other_instructions.length > 0 && (
        <View style={[s.card, { gap: 10 }]}>
          <Txt v="title3">Also on the prescription</Txt>
          {reading.other_instructions.map((line, index) => (
            <Txt key={index} v="body">
              • {line}
            </Txt>
          ))}
          <Button label={adviceSaved ? 'Saved as a note' : 'Save as a note'} icon={adviceSaved ? 'check' : undefined} variant="secondary" disabled={adviceSaved} onPress={onSaveAdvice} />
        </View>
      )}
      <Expander label="What CareLoop read" expanded={showReadings} onToggle={() => setShowReadings(!showReadings)} />
      {showReadings &&
        reading.readings.map((one, index) => (
          <View key={index} style={[s.cardRecord, { gap: 6 }]}>
            <Txt v="label">{modelLabel(one.model)} read:</Txt>
            <Txt v="body">{one.text}</Txt>
          </View>
        ))}
      <Txt v="bodySmall" tone="textMuted">
        Read by {reading.readings.map((one) => modelLabel(one.model)).join(' and ')} and organized by {modelLabel(reading.organizing_model)} on Nebius. The photo is not stored.
      </Txt>
    </>
  );
}

function PhotoViewer({ uri, visible, onClose }: { uri: string; visible: boolean; onClose: () => void }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#111', paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16, paddingHorizontal: 16, gap: 12 }}>
        <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <Image source={{ uri }} style={{ width: '100%', height: height * 0.75 }} resizeMode="contain" accessibilityLabel="Prescription photo" />
        </ScrollView>
        <Button label="Close" onPress={onClose} />
      </View>
    </Modal>
  );
}
