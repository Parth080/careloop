import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Contacts from 'expo-contacts';

import {
  deleteTrustedContact,
  initializeNotes,
  listTrustedContacts,
  saveTrustedContact,
  type ContactRole,
  type TrustedContact,
} from './notes';

const roles: ContactRole[] = ['emergency', 'doctor'];
const label = (role: ContactRole) => role === 'emergency' ? 'Emergency contact' : 'Doctor';

function dialableNumber(value: string): string | null {
  // Keep the '+' for international numbers, and reject extensions or URL characters.
  const number = value.trim().replace(/[ ().-]/g, '');
  return /^\+?[0-9]{3,15}$/.test(number) ? number : null;
}

export default function TrustedContacts() {
  const [saved, setSaved] = useState<TrustedContact[]>([]);
  const [editing, setEditing] = useState<ContactRole | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneChoices, setPhoneChoices] = useState<string[]>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    initializeNotes().then(listTrustedContacts).then(setSaved)
      .catch(() => setStatus('Could not load trusted contacts.'));
  }, []);

  function startEditing(role: ContactRole) {
    const existing = saved.find((contact) => contact.role === role);
    setEditing(role);
    setName(existing?.name ?? '');
    setPhone(existing?.phone ?? '');
    setPhoneChoices([]);
    setStatus('');
  }

  async function chooseFromPhone() {
    try {
      if (Platform.OS === 'android') {
        const permission = await Contacts.requestPermissionsAsync();
        if (!permission.granted) {
          setStatus('Contacts permission was not granted. You can enter the name and number below.');
          return;
        }
      }
      const selected = await Contacts.Contact.presentPicker();
      if (!selected) return;
      const [selectedName, phones] = await Promise.all([selected.getFullName(), selected.getPhones()]);
      const choices = phones.map((item) => item.number).filter((value): value is string => !!value);
      setName(selectedName);
      setPhoneChoices(choices);
      setPhone(choices.length === 1 ? choices[0] : '');
      setStatus(choices.length === 0 ? 'This contact has no phone number. Enter one manually.' :
        choices.length > 1 ? 'Choose the number you want to call.' : 'Check the selected number before saving.');
    } catch {
      setStatus('Could not open phone contacts. You can enter the number manually.');
    }
  }

  async function save() {
    if (!editing) return;
    const validPhone = dialableNumber(phone);
    if (!name.trim() || !validPhone) {
      setStatus('Enter a name and a phone number of 3–15 digits, with an optional + at the start.');
      return;
    }
    try {
      await saveTrustedContact({ role: editing, name: name.trim(), phone: validPhone });
      setSaved(await listTrustedContacts());
      setEditing(null);
      setStatus(`${label(editing)} saved on this phone.`);
    } catch {
      setStatus('Could not save this contact. Please try again.');
    }
  }

  async function call(contact: TrustedContact) {
    const validPhone = dialableNumber(contact.phone);
    if (!validPhone) {
      setStatus('This phone number needs to be corrected before calling.');
      return;
    }
    try {
      await Linking.openURL(`tel:${validPhone}`);
    } catch {
      setStatus('Could not open the phone app. Check this device and call the number manually.');
    }
  }

  function confirmRemove(role: ContactRole) {
    Alert.alert(`Remove ${label(role).toLowerCase()}?`, 'The call button for this person will disappear.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await deleteTrustedContact(role);
          setSaved(await listTrustedContacts());
          setStatus(`${label(role)} removed.`);
        } catch {
          setStatus('Could not remove this contact.');
        }
      } },
    ]);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Call for help</Text>
      <Text style={styles.helper}>Choose people you trust. Their names and numbers stay on this phone.</Text>
      {roles.map((role) => {
        const contact = saved.find((item) => item.role === role);
        return (
          <View key={role} style={styles.contactRow}>
            <Text style={styles.role}>{label(role)}</Text>
            {contact ? (
              <>
                <Text style={styles.name}>{contact.name}</Text>
                <Text style={styles.number}>{contact.phone}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Call ${contact.name}`} onPress={() => call(contact)} style={[styles.callButton, role === 'emergency' && styles.emergencyButton]}>
                  <Text style={styles.callText}>☎  Call {contact.name}</Text>
                </Pressable>
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" onPress={() => startEditing(role)}><Text style={styles.actionText}>Edit</Text></Pressable>
                  <Pressable accessibilityRole="button" onPress={() => confirmRemove(role)}><Text style={styles.removeText}>Remove</Text></Pressable>
                </View>
              </>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => startEditing(role)} style={styles.addButton}>
                <Text style={styles.addText}>+ Add {label(role).toLowerCase()}</Text>
              </Pressable>
            )}
          </View>
        );
      })}

      {editing && (
        <View style={styles.editor}>
          <Text style={styles.editorTitle}>Set {label(editing).toLowerCase()}</Text>
          <Pressable accessibilityRole="button" onPress={chooseFromPhone} style={styles.addButton}>
            <Text style={styles.addText}>Choose from phone contacts</Text>
          </Pressable>
          {phoneChoices.length > 1 && phoneChoices.map((choice, index) => (
            <Pressable key={`${choice}-${index}`} accessibilityRole="button" onPress={() => setPhone(choice)} style={[styles.choice, phone === choice && styles.selectedChoice]}>
              <Text style={styles.choiceText}>{choice}</Text>
            </Pressable>
          ))}
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput accessibilityLabel={`${label(editing)} name`} style={styles.input} value={name} onChangeText={setName} placeholder="Name" />
          <Text style={styles.fieldLabel}>Phone number</Text>
          <TextInput accessibilityLabel={`${label(editing)} phone number`} keyboardType="phone-pad" style={styles.input} value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" />
          <Pressable accessibilityRole="button" onPress={save} style={styles.saveButton}><Text style={styles.callText}>Save contact</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setEditing(null); setPhoneChoices([]); setStatus(''); }} style={styles.cancelButton}><Text style={styles.actionText}>Cancel</Text></Pressable>
        </View>
      )}
      {!!status && <Text accessibilityRole="alert" style={styles.status}>{status}</Text>}
      <Text style={styles.caution}>For immediate danger, call your local emergency service. This button calls the person you saved above.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20, gap: 12, borderWidth: 1, borderColor: '#DCE5D9' },
  heading: { color: '#183B2A', fontSize: 24, fontWeight: '800' },
  helper: { color: '#4B5F51', fontSize: 16, lineHeight: 24 },
  contactRow: { paddingTop: 10, gap: 7, borderTopWidth: 1, borderTopColor: '#E4EAE2' },
  role: { color: '#46624C', fontSize: 15, fontWeight: '700' },
  name: { color: '#183B2A', fontSize: 21, fontWeight: '800' },
  number: { color: '#4B5F51', fontSize: 16 },
  callButton: { minHeight: 60, backgroundColor: '#176A46', borderRadius: 12, justifyContent: 'center', alignItems: 'center', padding: 12 },
  emergencyButton: { backgroundColor: '#AD382C' },
  callText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 28, paddingVertical: 6 },
  actionText: { color: '#28563B', fontSize: 16, fontWeight: '700' },
  removeText: { color: '#A33829', fontSize: 16, fontWeight: '700' },
  addButton: { borderWidth: 1.5, borderColor: '#176A46', borderRadius: 12, minHeight: 52, justifyContent: 'center', alignItems: 'center', padding: 10 },
  addText: { color: '#176A46', fontSize: 17, fontWeight: '800' },
  editor: { gap: 9, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E4EAE2' },
  editorTitle: { color: '#183B2A', fontSize: 19, fontWeight: '800' },
  fieldLabel: { color: '#284A35', fontSize: 16, fontWeight: '700' },
  input: { borderWidth: 1.5, borderColor: '#A9BBAC', borderRadius: 12, padding: 14, color: '#18291E', fontSize: 18, minHeight: 54 },
  choice: { borderWidth: 1, borderColor: '#B6C4B8', borderRadius: 10, padding: 10 },
  selectedChoice: { borderColor: '#176A46', backgroundColor: '#E4F0E6' },
  choiceText: { color: '#183B2A', fontSize: 16 },
  saveButton: { minHeight: 56, backgroundColor: '#176A46', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cancelButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  status: { color: '#1D4932', fontSize: 15, backgroundColor: '#E4F0E6', padding: 12, borderRadius: 10 },
  caution: { color: '#675C46', fontSize: 14, lineHeight: 20 },
});
