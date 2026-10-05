import { useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';

import type { CareApi } from '../api';
import { describeTime, errorMessage, roleLabel, type Circle, type Invite, type Member, type Role } from '../model';
import { colors, ui } from '../theme';
import { Button, Notice } from './controls';

type Props = { circle: Circle; api: CareApi; onChanged: () => void; onSignedOut: (notice: string) => void };

const cancel = { text: 'Cancel', style: 'cancel' as const };

export default function CareCircle({ circle, api, onChanged, onSignedOut }: Props) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const person = circle.profile.person_name;
  const forSelf = circle.me.role === 'care_recipient';
  const whose = forSelf ? 'your' : `${person}'s`;
  const hasCareRecipient = circle.members.some((member) => member.role === 'care_recipient');

  async function createInvite(role: Role) {
    setBusy(true);
    setMessage('');
    try {
      setInvite(await api.createInvite(role));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function shareInvite(code: Invite) {
    const opening = code.role === 'care_recipient' ? `${person}, here is your CareLoop code.` : `Join ${person}'s care circle on CareLoop.`;
    Share.share({
      message: `${opening} Open CareLoop, tap "I have an invite code" and enter ${code.code}. It works once, until ${describeTime(code.expires_at)}.`,
    }).catch(() => setMessage(`Couldn't open sharing. Read the code out instead: ${code.code}`));
  }

  function confirmRemove(member: Member) {
    Alert.alert(`Remove ${member.name}?`, `${member.name} will no longer see or change ${whose} notes.`, [
      cancel,
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.removeMember(member.id);
            onChanged();
          } catch (error) {
            setMessage(errorMessage(error));
          }
        },
      },
    ]);
  }

  function confirmLeave() {
    const lastPerson = circle.members.length === 1;
    Alert.alert(
      'Leave this care circle?',
      lastPerson ? `You're the only one here, so all of ${whose} CareLoop data will be deleted.` : `This phone will stop showing ${whose} notes.`,
      [
        cancel,
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.removeMember(circle.me.id);
              onSignedOut(lastPerson ? 'You left, and the care profile was deleted.' : `You left ${person}'s care circle.`);
            } catch (error) {
              setMessage(errorMessage(error));
            }
          },
        },
      ],
    );
  }

  function confirmDeleteEverything() {
    Alert.alert(
      `Delete all of ${whose} CareLoop data?`,
      'Every note and contact is erased for everyone, and every phone is signed out. This cannot be undone.',
      [
        cancel,
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteEverything();
              onSignedOut('All CareLoop data was deleted.');
            } catch (error) {
              setMessage(errorMessage(error));
            }
          },
        },
      ],
    );
  }

  return (
    <View style={ui.card}>
      <Text style={ui.sectionTitle}>Care circle</Text>
      <Text style={ui.helper}>People who can see and add to {whose} notes.</Text>
      {circle.members.map((member) => (
        <View key={member.id} style={[ui.divider, styles.member]}>
          <View style={styles.memberText}>
            <Text style={styles.name}>
              {member.name}
              {member.is_me ? ' (you)' : ''}
            </Text>
            <Text style={ui.small}>
              {roleLabel(member.role)}
              {member.is_creator ? ' · set up CareLoop' : ''}
            </Text>
          </View>
          {member.can_remove && (
            <Button label="Remove" variant="danger" accessibilityLabel={`Remove ${member.name}`} onPress={() => confirmRemove(member)} />
          )}
        </View>
      ))}
      <Button label="Invite a caregiver" variant="outline" disabled={busy} onPress={() => createInvite('caregiver')} />
      {circle.can_manage && !hasCareRecipient && (
        <Button label={`Add ${person}'s own phone`} variant="outline" disabled={busy} onPress={() => createInvite('care_recipient')} />
      )}
      {invite && (
        <View style={styles.invite}>
          <Text style={ui.helper}>
            {invite.role === 'care_recipient' ? `On ${person}'s phone` : 'On their phone'}, open CareLoop, tap "I have an invite code" and enter:
          </Text>
          <Text selectable accessibilityLabel={`Invite code: ${invite.code.split('').join(' ')}`} style={styles.code}>
            {invite.code}
          </Text>
          <Text style={ui.small}>Works once, until {describeTime(invite.expires_at)}.</Text>
          <Button label="Share code" onPress={() => shareInvite(invite)} />
        </View>
      )}
      <Notice message={message} />
      <View style={ui.divider}>
        <Button label="Leave this care circle" variant="text" onPress={confirmLeave} />
        {circle.can_manage && <Button label={`Delete all ${whose} data`} variant="danger" onPress={confirmDeleteEverything} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  member: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberText: { flex: 1, gap: 2 },
  name: { color: colors.heading, fontSize: 19, fontWeight: '800' },
  invite: { backgroundColor: colors.notice, borderRadius: 14, padding: 16, gap: 10 },
  code: { color: colors.heading, fontSize: 40, fontWeight: '900', letterSpacing: 4, textAlign: 'center' },
});
