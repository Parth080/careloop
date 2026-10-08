import { useState } from 'react';

import type { CareApi } from '../api';
import { Button, ModalScreen, Notice } from '../components/kit';
import MedicineFields from '../components/MedicineFields';
import { emptyMedicineForm, errorMessage, formFromMedicine, localDate, medicineProblem, toMedicineInput, type Medicine } from '../model';

type Props = { api: CareApi; medicine: Medicine | null; onClose: () => void; onSaved: () => void };

/** Adding a medicine by hand, or changing one. */
export default function MedicineForm({ api, medicine, onClose, onSaved }: Props) {
  const [form, setForm] = useState(() => (medicine ? formFromMedicine(medicine) : emptyMedicineForm(localDate())));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    const problem = medicineProblem(form);
    if (problem) return setMessage(problem);
    setBusy(true);
    try {
      if (medicine) await api.updateMedicine(medicine.id, toMedicineInput(form));
      else await api.addMedicine(toMedicineInput(form));
      onSaved();
      onClose();
    } catch (error) {
      setMessage(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <ModalScreen
      onClose={onClose}
      title={medicine ? `Change ${medicine.name}` : 'Add a medicine'}
      footer={
        <>
          <Notice message={message} tone="warning" />
          <Button label={busy ? 'Saving…' : 'Save'} disabled={busy} onPress={save} />
        </>
      }
    >
      <MedicineFields value={form} onChange={setForm} api={api} />
    </ModalScreen>
  );
}
