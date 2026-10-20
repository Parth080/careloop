import { useState } from 'react';
import { View } from 'react-native';

import type { Contact } from '../model';
import { callNumber } from '../phone';
import { useTheme } from '../theme';
import { Button, Icon, Notice, Txt } from './kit';

// India's emergency number. Most mobile networks elsewhere also connect it to local emergency services.
const EMERGENCY_NUMBER = '112';

/** Shown when words suggest someone may need help right now: one tap to call. */
export default function UrgentHelp({ contacts }: { contacts: Contact[] }) {
  const { c, s } = useTheme();
  const [message, setMessage] = useState('');
  const emergency = contacts.find((contact) => contact.role === 'emergency');

  async function call(phone: string) {
    setMessage((await callNumber(phone)) ?? '');
  }

  return (
    <View accessibilityRole="alert" style={s.emergencyBox}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Icon name="alert" size={30} color={c.onDangerSoft} />
        <Txt v="title3" tone="onDangerSoft" style={{ flex: 1 }}>
          If this is an emergency, get help now.
        </Txt>
      </View>
      {emergency && <Button label={`Call ${emergency.name}`} icon="phone" variant="danger" onPress={() => void call(emergency.phone)} />}
      <Button label={`Call ${EMERGENCY_NUMBER} · emergency services`} icon="phone" variant="danger" onPress={() => void call(EMERGENCY_NUMBER)} />
      <Notice message={message} tone="danger" />
    </View>
  );
}
