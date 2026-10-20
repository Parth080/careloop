import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { joinWithCode, startProfile } from '../api';
import { Button, Field, Icon, Notice, PrivacyLine, ScreenHeader, Txt, type IconName } from '../components/kit';
import { errorMessage, type Session } from '../model';
import { border, radius, space, useTheme } from '../theme';

type Props = { notice?: string; onSignedIn: (session: Session) => Promise<void> };
type Step = 'start' | 'create' | 'join';

export default function Onboarding({ notice, onSignedIn }: Props) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
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

  const page = (body: ReactNode, footer: ReactNode) => (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      {step !== 'start' && <ScreenHeader title="Back" onBack={() => go('start')} />}
      <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.s5, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.s3, paddingBottom: space.s4 + insets.bottom, gap: space.s3 }}>{footer}</View>
    </KeyboardAvoidingView>
  );

  if (step === 'create') {
    return page(
      <>
        <Txt v="title1" accessibilityRole="header">
          Who is CareLoop for?
        </Txt>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 12 }}>
          <Choice icon="person" label="Me" selected={forSelf} onPress={() => setForSelf(true)} />
          <Choice icon="people" label="Someone I care for" selected={!forSelf} onPress={() => setForSelf(false)} />
        </View>
        {!forSelf && <Field label="Their name" maxLength={80} placeholder="For example: Asha" value={personName} onChangeText={setPersonName} />}
        <Field label="Your name" maxLength={80} placeholder="For example: Priya" value={yourName} onChangeText={setYourName} />
        <Notice message={message} tone="warning" />
      </>,
      <>
        <Button label={busy ? 'Creating…' : 'Create profile'} disabled={busy} onPress={create} />
        <PrivacyLine text="Notes are kept on the CareLoop server and shared only with people you invite. You can delete everything at any time." />
      </>,
    );
  }

  if (step === 'join') {
    return page(
      <>
        <Txt v="title1" accessibilityRole="header">
          Join a care circle
        </Txt>
        <Txt v="bodyLarge" tone="textSecondary">
          Type the code someone in your family shared with you.
        </Txt>
        <Field
          label="Invite code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
          placeholder="ABC-234"
          value={code}
          onChangeText={setCode}
          style={{ fontSize: 30, lineHeight: 36, letterSpacing: 6, textAlign: 'center', minHeight: 72 }}
        />
        <Field label="Your name" maxLength={80} placeholder="For example: Priya" value={yourName} onChangeText={setYourName} />
        <Notice message={message} tone="warning" />
      </>,
      <>
        <Button label={busy ? 'Joining…' : 'Join'} disabled={busy} onPress={join} />
        <PrivacyLine text="Shared only with people in this care circle. You can delete everything at any time." />
      </>,
    );
  }

  return page(
    <View style={{ flex: 1, justifyContent: 'center', gap: space.s5 }}>
      <View style={{ width: 88, height: 88, borderRadius: radius.xl, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="heart" size={46} color={c.onPrimary} />
      </View>
      <Txt v="display" accessibilityRole="header">
        CareLoop
      </Txt>
      <Txt v="bodyLarge" tone="textSecondary" style={{ fontSize: 22, lineHeight: 30 }}>
        Health notes, medicines and family care, in one simple place.
      </Txt>
      <Notice message={message} tone="warning" />
    </View>,
    <>
      <Button label="Start a new care profile" onPress={() => go('create')} />
      <Button label="I have an invite code" variant="secondary" onPress={() => go('join')} />
      <PrivacyLine text="Notes are kept on the CareLoop server and shared only with people you invite. You can delete everything at any time." />
    </>,
  );
}

function Choice({ icon, label, selected, onPress }: { icon: IconName; label: string; selected: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 140,
        borderRadius: radius.xl,
        borderWidth: selected ? border.strong : border.input,
        borderColor: selected ? c.primary : c.borderInput,
        backgroundColor: selected ? c.primarySoft : c.surface,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 12,
      }}
    >
      <Icon name={icon} size={36} color={selected ? c.onPrimarySoft : c.text} />
      <Txt v="headline" tone={selected ? 'onPrimarySoft' : 'text'} style={{ textAlign: 'center' }}>
        {label}
      </Txt>
    </Pressable>
  );
}
