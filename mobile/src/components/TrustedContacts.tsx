import { useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';

import type { CareApi } from '../api';
import { dialableNumber, errorMessage, type Contact, type ContactRole } from '../model';
import { colors, ui } from '../theme';
import { Button, Chip, Notice } from './controls';

const roles: ContactRole[] = ['emergency', 'doctor'];
const label = (role: ContactRole) => (role === 'emergency' ? 'Emergency contact' : 'Doctor');

type Props = { contacts: Contact[]; api: CareApi; onChanged: () => void };

export default function TrustedContacts({ contacts, api, onChanged }: Props) {
  const [editing, setEditing] = useState<ContactRole | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneChoices, setPhoneChoices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function startEditing(role: ContactRole) {
    const existing = contacts.find((contact) => contact.role === role);
    setEditing(role);
    setName(existing?.name ?? '');
    setPhone(existing?.phone ?? '');
    setPhoneChoices([]);
    setMessage('');
  }

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
      setPhoneChoices(numbers);
      setPhone(numbers.length === 1 ? numbers[0] : '');
      setMessage(numbers.length === 0 ? 'This contact has no phone number. Type one below.' : numbers.length > 1 ? 'Choose the number to call.' : 'Check the number, then save.');
    } catch {
      setMessage("Couldn't open your phone's contacts. You can type the number instead.");
    }
  }

  async function save() {
    if (!editing) return;
    const number = dialableNumber(phone);
    if (!name.trim() || !number) return setMessage('Enter a name and a phone number (3 to 15 digits; a + at the start is fine).');
    setBusy(true);
    try {
      await api.saveContact(editing, { name: name.trim(), phone: number });
      setMessage(`${label(editing)} saved.`);
      setEditing(null);
      onChanged();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function call(contact: Contact) {
    const number = dialableNumber(contact.phone);
    if (!number) return setMessage('This number needs to be fixed before it can be called.');
    try {
      await Linking.openURL(`tel:${number}`);
    } catch {
      setMessage(`Couldn't open the phone app. Please dial ${contact.phone} yourself.`);
    }
  }

  function confirmRemove(role: ContactRole) {
    Alert.alert(`Remove the ${label(role).toLowerCase()}?`, 'The call button will disappear for everyone in the care circle.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.removeContact(role);
            onChanged();
          } catch (error) {
            setMessage(errorMessage(error));
          }
        },
      },
    ]);
  }

  return (
    <View style={ui.card}>
      <Text style={ui.sectionTitle}>Call for help</Text>
      <Text style={ui.helper}>Everyone in the care circle sees these numbers. They work even without internet.</Text>
      {roles.map((role) => {
        const contact = contacts.find((item) => item.role === role);
        return (
          <View key={role} style={[ui.divider, styles.contact]}>
            <Text style={styles.role}>{label(role)}</Text>
            {contact ? (
              <>
                <Button
                  label={`☎  Call ${contact.name}`}
                  variant={role === 'emergency' ? 'emergency' : 'primary'}
                  accessibilityLabel={`Call ${contact.name}, ${label(role).toLowerCase()}`}
                  onPress={() => call(contact)}
                />
                <Text style={ui.small}>{contact.phone}</Text>
                <View style={styles.actions}>
                  <Button label="Change" variant="text" onPress={() => startEditing(role)} />
                  <Button label="Remove" variant="danger" onPress={() => confirmRemove(role)} />
                </View>
              </>
            ) : (
              <Button label={`+ Add ${label(role).toLowerCase()}`} variant="outline" onPress={() => startEditing(role)} />
            )}
          </View>
        );
      })}

      {editing && (
        <View style={[ui.divider, styles.contact]}>
          <Text style={styles.editorTitle}>{label(editing)}</Text>
          <Button label="Choose from phone contacts" variant="outline" onPress={chooseFromPhone} />
          {phoneChoices.length > 1 && (
            <View accessibilityRole="radiogroup" style={ui.row}>
              {phoneChoices.map((choice, index) => (
                <Chip key={`${choice}-${index}`} label={choice} selected={phone === choice} onPress={() => setPhone(choice)} />
              ))}
            </View>
          )}
          <Text style={ui.label}>Name</Text>
          <TextInput accessibilityLabel={`${label(editing)} name`} maxLength={80} style={ui.input} value={name} onChangeText={setName} />
          <Text style={ui.label}>Phone number</Text>
          <TextInput
            accessibilityLabel={`${label(editing)} phone number`}
            keyboardType="phone-pad"
            maxLength={25}
            placeholder="+91 98765 43210"
            placeholderTextColor={colors.placeholder}
            style={ui.input}
            value={phone}
            onChangeText={setPhone}
          />
          <Button label="Save" disabled={busy} onPress={save} />
          <Button label="Cancel" variant="text" onPress={() => setEditing(null)} />
        </View>
      )}
      <Notice message={message} />
      <Text style={styles.caution}>In immediate danger, call your local emergency number. These buttons call the people saved above.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contact: { gap: 8 },
  role: { color: '#46624C', fontSize: 16, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12 },
  editorTitle: { color: colors.heading, fontSize: 19, fontWeight: '800' },
  caution: { color: colors.caution, fontSize: 14, lineHeight: 20 },
});
