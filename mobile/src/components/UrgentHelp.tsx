import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Contact } from '../model';
import { callNumber } from '../phone';
import { Button, Notice } from './controls';

// India's emergency number. Most mobile networks elsewhere also connect it to local emergency services.
const EMERGENCY_NUMBER = '112';

/** Shown when words suggest someone may need help right now: one tap to call. */
export default function UrgentHelp({ contacts }: { contacts: Contact[] }) {
  const [message, setMessage] = useState('');
  const emergency = contacts.find((contact) => contact.role === 'emergency');

  async function call(phone: string) {
    setMessage((await callNumber(phone)) ?? '');
  }

  return (
    <View accessibilityRole="alert" style={styles.box}>
      <Text style={styles.title}>If this is an emergency, get help now.</Text>
      {emergency && <Button label={`☎  Call ${emergency.name}`} variant="emergency" onPress={() => void call(emergency.phone)} />}
      <Button label={`☎  Call ${EMERGENCY_NUMBER} (emergency services)`} variant="emergency" onPress={() => void call(EMERGENCY_NUMBER)} />
      <Notice message={message} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: '#FBE1DC', borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: '#E3A99F' },
  title: { color: '#7A2418', fontSize: 18, fontWeight: '800' },
});
