import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { joinWithCode, startProfile } from '../api';
import { Button, Chip, Notice } from '../components/controls';
import { errorMessage, type Session } from '../model';
import { colors, ui } from '../theme';

type Props = { notice?: string; onSignedIn: (session: Session) => Promise<void> };
type Step = 'start' | 'create' | 'join';

export default function Onboarding({ notice, onSignedIn }: Props) {
  const [step, setStep] = useState<Step>('start');
  const [forSelf, setForSelf] = useState(true);
  const [yourName, setYourName] = useState('');
  const [personName, setPersonName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(notice ?? '');

  function go(next: Step) {
    setStep(next);
    setMessage('');
  }

  async function signIn(request: () => Promise<Session>) {
    setBusy(true);
    setMessage('');
    try {
      await onSignedIn(await request());
    } catch (error) {
      setMessage(errorMessage(error));
      setBusy(false);
    }
  }

  function create() {
    if (!yourName.trim() || (!forSelf && !personName.trim())) {
      return setMessage(forSelf ? 'Enter your name.' : 'Enter both names.');
    }
    void signIn(() =>
      startProfile({
        your_name: yourName.trim(),
        your_role: forSelf ? 'care_recipient' : 'caregiver',
        ...(forSelf ? {} : { person_name: personName.trim() }),
      }),
    );
  }

  function join() {
    if (code.replace(/[^a-z0-9]/gi, '').length !== 6 || !yourName.trim()) {
      return setMessage('Enter the 6-character code and your name.');
    }
    void signIn(() => joinWithCode(code, yourName.trim()));
  }

  return (
    <ScrollView contentContainerStyle={ui.page} keyboardShouldPersistTaps="handled">
      <Text style={ui.heading}>CareLoop</Text>
      <Text style={ui.intro}>A simple helper for health notes, medicines and family care.</Text>

      {step === 'start' && (
        <View style={ui.card}>
          <Button label="Start a new care profile" onPress={() => go('create')} />
          <Button label="I have an invite code" variant="outline" onPress={() => go('join')} />
        </View>
      )}

      {step === 'create' && (
        <View style={ui.card}>
          <Text style={ui.sectionTitle}>Who is CareLoop for?</Text>
          <View accessibilityRole="radiogroup" style={ui.row}>
            <Chip label="Me" selected={forSelf} onPress={() => setForSelf(true)} />
            <Chip label="Someone I care for" selected={!forSelf} onPress={() => setForSelf(false)} />
          </View>
          {!forSelf && (
            <>
              <Text style={ui.label}>Their name</Text>
              <TextInput accessibilityLabel="Their name" maxLength={80} style={ui.input} value={personName} onChangeText={setPersonName} />
            </>
          )}
          <Text style={ui.label}>Your name</Text>
          <TextInput accessibilityLabel="Your name" maxLength={80} style={ui.input} value={yourName} onChangeText={setYourName} />
          <Button label={busy ? 'Creating…' : 'Create'} disabled={busy} onPress={create} />
          <Button label="Back" variant="text" disabled={busy} onPress={() => go('start')} />
        </View>
      )}

      {step === 'join' && (
        <View style={ui.card}>
          <Text style={ui.sectionTitle}>Join a care circle</Text>
          <Text style={ui.helper}>Enter the code someone in the family shared with you.</Text>
          <TextInput
            accessibilityLabel="Invite code"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={9}
            placeholder="ABC-234"
            placeholderTextColor={colors.placeholder}
            style={[ui.input, { fontSize: 26, letterSpacing: 3, textAlign: 'center' }]}
            value={code}
            onChangeText={setCode}
          />
          <Text style={ui.label}>Your name</Text>
          <TextInput accessibilityLabel="Your name" maxLength={80} style={ui.input} value={yourName} onChangeText={setYourName} />
          <Button label={busy ? 'Joining…' : 'Join'} disabled={busy} onPress={join} />
          <Button label="Back" variant="text" disabled={busy} onPress={() => go('start')} />
        </View>
      )}

      <Notice message={message} />
      <Text style={ui.small}>
        Notes are kept on the CareLoop server and shared only with people you invite. You can delete everything at any time.
      </Text>
    </ScrollView>
  );
}
