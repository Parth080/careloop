import { useState } from 'react';
import { Alert, View } from 'react-native';

import type { CareApi } from '../api';
import { afterTransition, Badge, Button, Card, Expander, Notice, PressCard, Sheet, Txt } from '../components/kit';
import TabPage from '../components/TabPage';
import { errorMessage, isFinished, localDate, medicineLine, medicineMeta, spokenMedicine, type Medicine } from '../model';
import type { Overlay } from '../navigation';
import { getPhoto } from '../photos';
import { readAloud } from '../readAloud';

type Props = {
  medicines: Medicine[];
  api: CareApi;
  onChanged: () => void;
  open: (overlay: Overlay) => void;
  refreshing: boolean;
  onRefresh: () => void;
  offline: boolean;
};

export default function MedicinesTab({ medicines, api, onChanged, open, refreshing, onRefresh, offline }: Props) {
  const [chosen, setChosen] = useState<Medicine | null>(null);
  const [showFinished, setShowFinished] = useState(false);
  const [message, setMessage] = useState('');
  const today = localDate();
  const current = medicines.filter((medicine) => !isFinished(medicine, today));
  const finished = medicines.filter((medicine) => isFinished(medicine, today));

  function chooseSource() {
    Alert.alert('Read a prescription', 'Photograph the whole page in good light, or choose a photo you already have.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Choose a photo', onPress: () => void readPrescription('library') },
      { text: 'Take a photo', onPress: () => void readPrescription('camera') },
    ]);
  }

  async function readPrescription(source: 'camera' | 'library') {
    setMessage('');
    try {
      const photo = await getPhoto(source);
      if (photo) open({ kind: 'prescription', photo });
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  function confirmRemove(medicine: Medicine) {
    Alert.alert(`Remove ${medicine.name}?`, 'It will be removed for everyone in the care circle, with its dose records.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteMedicine(medicine.id);
            setChosen(null);
            onChanged();
          } catch (error) {
            setMessage(errorMessage(error));
          }
        },
      },
    ]);
  }

  const card = (medicine: Medicine) => (
    <PressCard
      key={medicine.id}
      label={`${medicine.name}${medicine.strength ? `, ${medicine.strength}` : ''}. ${medicineLine(medicine)}. ${medicineMeta(medicine, today)}. Opens actions.`}
      onPress={() => setChosen(medicine)}
    >
      <Txt v="title3">
        {medicine.name}
        {medicine.strength ? ` · ${medicine.strength}` : ''}
      </Txt>
      {medicine.as_needed && <Badge label="When needed" kind="outline" />}
      {!!medicineLine(medicine) && <Txt v="body">{medicineLine(medicine)}</Txt>}
      {!medicine.as_needed && !!medicine.instructions && <Txt v="body" tone="textSecondary">{medicine.instructions}</Txt>}
      <Txt v="bodySmall" tone="textMuted">
        {medicineMeta(medicine, today)}
      </Txt>
    </PressCard>
  );

  return (
    <TabPage refreshing={refreshing} onRefresh={onRefresh} offline={offline}>
      <Txt v="title1" accessibilityRole="header">
        Medicines
      </Txt>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button label="Read a prescription" icon="camera" grow onPress={chooseSource} />
        <Button label="+ Add one" variant="secondary" onPress={() => open({ kind: 'medicine', medicine: null })} style={{ paddingHorizontal: 16 }} />
      </View>
      <Notice message={message} tone="warning" />
      {current.length === 0 ? (
        <Card>
          <Txt v="title3">No medicines yet</Txt>
          <Txt v="body" tone="textSecondary">
            Photograph a prescription and CareLoop will read it for you. You check every medicine before it's saved.
          </Txt>
        </Card>
      ) : (
        <>
          {current.map(card)}
          <Txt v="bodySmall" tone="textMuted" style={{ textAlign: 'center' }}>
            Tap a medicine to hear it, change it or remove it.
          </Txt>
        </>
      )}
      {finished.length > 0 && <Expander label="Finished medicines" count={finished.length} expanded={showFinished} onToggle={() => setShowFinished(!showFinished)} />}
      {showFinished && finished.map(card)}

      {chosen && (
        <Sheet
          visible
          onClose={() => setChosen(null)}
          title={`${chosen.name}${chosen.strength ? ` · ${chosen.strength}` : ''}`}
          subtitle={
            <>
              {!!medicineLine(chosen) && <Txt v="bodyLarge">{chosen.as_needed ? `${medicineLine(chosen)} · only when needed` : medicineLine(chosen)}</Txt>}
              {!chosen.as_needed && !!chosen.instructions && <Txt v="body" tone="textSecondary">{chosen.instructions}</Txt>}
              <Txt v="bodySmall" tone="textMuted">
                {medicineMeta(chosen, today)}
              </Txt>
            </>
          }
        >
          <Button label="Read aloud" icon="speaker" variant="secondary" onPress={() => readAloud(spokenMedicine(chosen))} />
          <Button
            label="Edit"
            icon="edit"
            variant="secondary"
            onPress={() => {
              const medicine = chosen;
              setChosen(null);
              afterTransition(() => open({ kind: 'medicine', medicine }));
            }}
          />
          <Button label="Remove this medicine" icon="trash" variant="removal" onPress={() => confirmRemove(chosen)} />
        </Sheet>
      )}
    </TabPage>
  );
}
