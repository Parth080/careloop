import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import type { CareApi } from '../api';
import { afterTransition, Button, Card, DateTile, Divider, Expander, Icon, IconButton, Notice, Sheet, Txt } from '../components/kit';
import TabPage from '../components/TabPage';
import { dateTile, daysAway, describeAppointmentTime, errorMessage, formatClock, localDate, type Appointment } from '../model';
import type { Overlay } from '../navigation';
import { readAloud } from '../readAloud';
import { radius, useTheme } from '../theme';

type Props = {
  appointments: Appointment[];
  api: CareApi;
  onChanged: () => void;
  open: (overlay: Overlay) => void;
  refreshing: boolean;
  onRefresh: () => void;
  offline: boolean;
};

export default function VisitsTab({ appointments, api, onChanged, open, refreshing, onRefresh, offline }: Props) {
  const { c } = useTheme();
  const [chosen, setChosen] = useState<Appointment | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [message, setMessage] = useState('');
  const today = localDate();
  const upcoming = appointments.filter((appointment) => appointment.day >= today);
  const past = appointments.filter((appointment) => appointment.day < today).reverse(); // most recent first
  const [next, ...later] = upcoming;

  function confirmRemove(appointment: Appointment) {
    Alert.alert(`Remove "${appointment.title}"?`, 'It will be removed for everyone in the care circle.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteAppointment(appointment.id);
            setChosen(null);
            onChanged();
          } catch (error) {
            setMessage(errorMessage(error));
          }
        },
      },
    ]);
  }

  const when = (appointment: Appointment) =>
    [appointment.time ? formatClock(appointment.time) : 'Time not set', appointment.with_whom, appointment.place].filter(Boolean).join(' · ');

  const smallCard = (appointment: Appointment) => {
    const tile = dateTile(appointment.day);
    return (
      <Card key={appointment.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <DateTile weekday={tile.weekday} day={tile.day} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="headline">{appointment.title}</Txt>
          <Txt v="body" tone="textSecondary">
            {when(appointment)}
          </Txt>
          {!!appointment.notes && (
            <Txt v="body" tone="onWarning">
              {appointment.notes}
            </Txt>
          )}
          {!!appointment.created_by_name && (
            <Txt v="bodySmall" tone="textMuted">
              Added by {appointment.created_by_name}
            </Txt>
          )}
        </View>
        <IconButton icon="more" label={`More for ${appointment.title}`} tone="sunken" onPress={() => setChosen(appointment)} />
      </Card>
    );
  };

  return (
    <TabPage refreshing={refreshing} onRefresh={onRefresh} offline={offline}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Txt v="title1" accessibilityRole="header" style={{ flex: 1 }}>
          Visits
        </Txt>
        <Button label="+ Add a visit" variant="secondary" onPress={() => open({ kind: 'visit', appointment: null })} />
      </View>
      <Notice message={message} tone="warning" />

      {next ? (
        <Card focus style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Txt v="label" tone="primary" style={{ flex: 1 }}>
              Next visit · {daysAway(next.day, today)}
            </Txt>
            <IconButton icon="more" label={`More for ${next.title}`} tone="sunken" onPress={() => setChosen(next)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <DateTile {...dateTile(next.day)} strong />
            <View style={{ flex: 1, gap: 4 }}>
              <Txt v="title2">{next.title}</Txt>
              <Txt v="bodyLarge" tone="textSecondary">
                {[next.time ? formatClock(next.time) : 'Time not set', next.with_whom, next.place].filter(Boolean).join(' · ')}
              </Txt>
            </View>
          </View>
          {!!next.notes && (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.warningSoft, borderRadius: radius.md, padding: 14 }}>
              <Icon name="file" color={c.onWarning} />
              <Txt v="body" tone="onWarning" style={{ flex: 1 }}>
                {next.notes}
              </Txt>
            </View>
          )}
          <Button label="Prepare for this visit" icon="clipboard" onPress={() => open({ kind: 'summary', appointment: next })} />
          {!!next.created_by_name && (
            <Txt v="bodySmall" tone="textMuted">
              Added by {next.created_by_name}
            </Txt>
          )}
        </Card>
      ) : (
        <Card>
          <Txt v="title3">No visits planned</Txt>
          <Txt v="body" tone="textSecondary">
            Add a doctor visit, test or call, and CareLoop reminds everyone the evening before.
          </Txt>
        </Card>
      )}

      {later.length > 0 && (
        <Txt v="label" tone="textSecondary">
          Later
        </Txt>
      )}
      {later.map(smallCard)}

      <Pressable
        accessibilityRole="button"
        onPress={() => open({ kind: 'summary', appointment: null })}
        style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 8 }}
      >
        <Txt v="headline" tone="primary" style={{ flex: 1 }}>
          Health summary for any doctor
        </Txt>
        <Icon name="forward" color={c.primary} />
      </Pressable>
      {past.length > 0 && (
        <>
          <Divider />
          <Expander label={`Past visits (${past.length})`} expanded={showPast} onToggle={() => setShowPast(!showPast)} />
          {showPast && past.map(smallCard)}
        </>
      )}

      {chosen && (
        <Sheet
          visible
          onClose={() => setChosen(null)}
          title={chosen.title}
          subtitle={
            <>
              <Txt v="bodyLarge" tone="textSecondary">
                {[describeAppointmentTime(chosen, today), chosen.with_whom, chosen.place].filter(Boolean).join(' · ')}
              </Txt>
              {!!chosen.notes && <Txt v="body">{chosen.notes}</Txt>}
            </>
          }
        >
          <Button
            label="Read aloud"
            icon="speaker"
            variant="secondary"
            onPress={() =>
              readAloud(`${chosen.title}, ${describeAppointmentTime(chosen, today).replace(', time not set', '')}${chosen.place ? `, at ${chosen.place}` : ''}.`)
            }
          />
          <Button
            label="Edit"
            icon="edit"
            variant="secondary"
            onPress={() => {
              const appointment = chosen;
              setChosen(null);
              afterTransition(() => open({ kind: 'visit', appointment }));
            }}
          />
          <Button label="Remove this visit" icon="trash" variant="removal" onPress={() => confirmRemove(chosen)} />
        </Sheet>
      )}
    </TabPage>
  );
}
