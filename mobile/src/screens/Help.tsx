import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';

import type { CareApi } from '../api';
import { afterTransition, Button, Chip, CloseButton, Field, Icon, ModalScreen, Notice, ScreenHeader, Txt } from '../components/kit';
import { dialableNumber, errorMessage, formatPhone, type Contact, type ContactRole } from '../model';
import { callNumber } from '../phone';
import { radius, useTheme } from '../theme';

type Props = {
  api: CareApi;
  contacts: Contact[];
  personName: string;
  forSelf: boolean;
  startEditing?: ContactRole;
  onClose: () => void;
  onChanged: () => void;
};

/** One-tap calls to the emergency contact and the doctor, which work without internet. */
export default function Help({ api, contacts, personName, forSelf, startEditing, onClose, onChanged }: Props) {
  const { c } = useTheme();
  const [listing, setListing] = useState(false); // "Change or remove these numbers"
  const [form, setForm] = useState<ContactRole | null>(null);
  useEffect(() => {
    if (startEditing) afterTransition(() => setForm(startEditing)); // once this screen has slid in
  }, [startEditing]);
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState(''); // shown in warning colours, apart from "saved" messages
  // The older adult's own number is for the caregivers' "Call" button, so only they see it here.
  const roles: ContactRole[] = forSelf ? ['emergency', 'doctor'] : ['emergency', 'doctor', 'person'];
  const label = (role: ContactRole) => (role === 'emergency' ? 'Emergency contact' : role === 'doctor' ? 'Doctor' : `${personName}'s own phone`);
  const find = (role: ContactRole) => contacts.find((contact) => contact.role === role);

  async function call(contact: Contact) {
    setProblem((await callNumber(contact.phone)) ?? '');
  }

  function confirmRemove(role: ContactRole, contact: Contact) {
    Alert.alert(`Remove ${contact.name}?`, 'The call button will disappear for everyone in the care circle.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.removeContact(role);
            onChanged();
          } catch (error) {
            setProblem(errorMessage(error));
          }
        },
      },
    ]);
  }

  const list = (
    <>
      <Txt v="body" tone="textSecondary">
        Everyone in the care circle sees these numbers.
      </Txt>
      {roles.map((role) => {
        const contact = find(role);
        return (
          <View key={role} style={{ gap: 10, backgroundColor: c.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: c.border, padding: 20 }}>
            <Txt v="label" tone="textSecondary">
              {label(role)}
            </Txt>
            {contact ? (
              <>
                <Txt v="title3">{contact.name}</Txt>
                <Txt v="body">{formatPhone(contact.phone)}</Txt>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Button label="Change" variant="secondary" grow onPress={() => setForm(role)} />
                  <Button label="Remove" variant="removal" grow onPress={() => confirmRemove(role, contact)} />
                </View>
              </>
            ) : (
              <Button label={`+ Add ${label(role).toLowerCase()}`} variant="secondary" onPress={() => setForm(role)} />
            )}
          </View>
        );
      })}
    </>
  );

  const calls = (
    <>
      <Txt v="body" tone="textSecondary">
        Calls work even without internet. Everyone in the care circle sees these numbers.
      </Txt>
      {roles
        .filter((role) => find(role))
        .map((role) => {
          const contact = find(role)!;
          const urgent = role === 'emergency';
          const ink = urgent ? c.onDanger : c.onPrimary;
          return (
            <Pressable
              key={role}
              accessibilityRole="button"
              accessibilityLabel={`Call ${contact.name}, ${label(role)}, ${formatPhone(contact.phone)}`}
              onPress={() => call(contact)}
              style={({ pressed }) => ({
                backgroundColor: urgent ? c.danger : c.primary,
                borderRadius: radius.xl,
                padding: 20,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 16,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="phone" size={28} color={ink} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="label" style={{ color: ink, opacity: 0.9 }}>
                  {label(role)}
                </Txt>
                <Txt v="title2" style={{ color: ink }}>
                  Call {contact.name}
                </Txt>
                <Txt v="bodyLarge" style={{ color: ink }}>
                  {formatPhone(contact.phone)}
                </Txt>
              </View>
            </Pressable>
          );
        })}
      {roles
        .filter((role) => !find(role) && role !== 'person')
        .map((role) => (
          <Button key={role} label={`+ Add ${label(role).toLowerCase()}`} variant="secondary" onPress={() => setForm(role)} />
        ))}
      <Notice tone="danger" icon="alert" message="In immediate danger, call your local emergency number (112). These buttons call the people saved above." />
    </>
  );

  // One screen that changes its contents, with the contact form opening over it, so iOS never has to
  // present a new screen while closing another.
  return (
    <ModalScreen
      onClose={listing ? () => setListing(false) : onClose}
      title="Change these numbers"
      header={listing ? undefined : <ScreenHeader title="Call for help" right={<CloseButton onPress={onClose} />} />}
      footer={listing ? undefined : <Button label="Change or remove these numbers" variant="outlineDark" onPress={() => setListing(true)} />}
    >
      {listing ? list : calls}
      <Notice message={problem} tone="warning" />
      <Notice message={message} />
      {form && (
        <ContactForm
          api={api}
          role={form}
          label={label(form)}
          existing={find(form)}
          onDone={(saved) => {
            setForm(null);
            if (saved) {
              setProblem('');
              setMessage(saved);
              onChanged();
            }
          }}
        />
      )}
    </ModalScreen>
  );
}

function ContactForm({ api, role, label, existing, onDone }: { api: CareApi; role: ContactRole; label: string; existing?: Contact; onDone: (saved?: string) => void }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [choices, setChoices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function chooseFromPhone() {
    try {
      // The legacy picker hands back the chosen person's details directly, so iOS needs no Contacts
      // permission. (The newer Contact.presentPicker re-reads the address book, which does.)
      if (Platform.OS === 'android') {
        const permission = await Contacts.requestPermissionsAsync();
        if (!permission.granted) return setMessage('Contacts permission was not given. You can type the name and number instead.');
      }
      const selected = await Contacts.presentContactPickerAsync();
      if (!selected) return;
      const numbers = (selected.phoneNumbers ?? []).map((item) => item.number).filter((value): value is string => !!value);
      setName(selected.name ?? '');
      setChoices(numbers);
      setPhone(numbers.length === 1 ? numbers[0] : '');
      setMessage(numbers.length === 0 ? 'This contact has no phone number. Type one below.' : numbers.length > 1 ? 'Choose the number to call.' : 'Check the number, then save.');
    } catch {
      setMessage("Couldn't open your phone's contacts. You can type the number instead.");
    }
  }

  async function save() {
    const number = dialableNumber(phone);
    if (!name.trim() || !number) return setMessage('Enter a name and a phone number (3 to 15 digits; a + at the start is fine).');
    setBusy(true);
    try {
      await api.saveContact(role, { name: name.trim(), phone: number });
      onDone(`${label} saved.`);
    } catch (error) {
      setMessage(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <ModalScreen onClose={() => onDone()} title={label} footer={<Button label={busy ? 'Saving…' : 'Save'} disabled={busy} onPress={save} />}>
      <Button label="Choose from phone contacts" icon="people" variant="secondary" onPress={chooseFromPhone} />
      {choices.length > 1 && (
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {choices.map((choice, index) => (
            <Chip key={`${choice}-${index}`} label={choice} selected={phone === choice} onPress={() => setPhone(choice)} />
          ))}
        </View>
      )}
      <Field label="Name" maxLength={80} value={name} onChangeText={setName} />
      <Field label="Phone number" keyboardType="phone-pad" maxLength={25} placeholder="+91 98765 43210" value={phone} onChangeText={setPhone} />
      <Notice message={message} tone="warning" />
    </ModalScreen>
  );
}
