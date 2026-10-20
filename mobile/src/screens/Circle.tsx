import { useState } from 'react';
import { Alert, Share, View } from 'react-native';

import type { CareApi } from '../api';
import { Button, Card, CloseButton, ModalScreen, Notice, ScreenHeader, Txt } from '../components/kit';
import { describeTime, errorMessage, roleLabel, type Circle as CircleData, type Invite, type Member, type Role } from '../model';
import { useTheme } from '../theme';

type Props = { circle: CircleData; api: CareApi; onClose: () => void; onChanged: () => void; onSignedOut: (notice: string) => void };

const cancel = { text: 'Cancel', style: 'cancel' as const };

/** Who can see and add to the care record, inviting family, and leaving or deleting everything. */
export default function Circle({ circle, api, onClose, onChanged, onSignedOut }: Props) {
  const { s } = useTheme();
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
    Alert.alert(`Delete all of ${whose} CareLoop data?`, 'Every note and contact is erased for everyone, and every phone is signed out. This cannot be undone.', [
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
    ]);
  }

  return (
    <ModalScreen onClose={onClose} header={<ScreenHeader title="Care circle" right={<CloseButton onPress={onClose} />} />}>
      <Txt v="body" tone="textSecondary">
        People who can see and add to {whose} notes, medicines and visits.
      </Txt>
      {circle.members.map((member) => (
        <Card key={member.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="title3">
              {member.name}
              {member.is_me ? ' (you)' : ''}
            </Txt>
            <Txt v="bodySmall" tone="textMuted">
              {roleLabel(member.role)}
              {member.is_creator ? ' · set up CareLoop' : ''}
            </Txt>
          </View>
          {member.can_remove && <Button label="Remove" variant="quiet" accessibilityLabel={`Remove ${member.name}`} onPress={() => confirmRemove(member)} />}
        </Card>
      ))}
      <Button label="Invite a caregiver" icon="plus" variant="secondary" disabled={busy} onPress={() => createInvite('caregiver')} />
      {circle.can_manage && !hasCareRecipient && (
        <Button label={`Add ${person}'s own phone`} icon="plus" variant="secondary" disabled={busy} onPress={() => createInvite('care_recipient')} />
      )}
      {invite && (
        <View style={[s.cardSoft, { gap: 12 }]}>
          <Txt v="body" tone="onPrimarySoft">
            {invite.role === 'care_recipient' ? `On ${person}'s phone` : 'On their phone'}, open CareLoop, tap "I have an invite code" and enter:
          </Txt>
          <Txt v="display" selectable accessibilityLabel={`Invite code: ${invite.code.split('').join(' ')}`} style={{ letterSpacing: 6, textAlign: 'center' }}>
            {invite.code}
          </Txt>
          <Txt v="bodySmall" tone="onPrimarySoft">
            Works once, until {describeTime(invite.expires_at)}.
          </Txt>
          <Button label="Share code" icon="share" onPress={() => shareInvite(invite)} />
        </View>
      )}
      <Notice message={message} tone="warning" />
      <View style={{ gap: 4, paddingTop: 12 }}>
        <Button label="Leave this care circle" variant="quiet" onPress={confirmLeave} />
        {circle.can_manage && <Button label={`Delete all ${whose} data`} icon="trash" variant="removal" onPress={confirmDeleteEverything} />}
      </View>
    </ModalScreen>
  );
}
