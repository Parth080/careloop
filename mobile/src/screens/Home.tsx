import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, RefreshControl, ScrollView, Text, View } from 'react-native';

import { ApiError, careApi } from '../api';
import { readSnapshot, writeSnapshot, type Snapshot } from '../cache';
import Appointments from '../components/Appointments';
import AskCareLoop from '../components/AskCareLoop';
import CareCircle from '../components/CareCircle';
import { Button, Notice } from '../components/controls';
import Medicines from '../components/Medicines';
import NoteComposer from '../components/NoteComposer';
import NoteList from '../components/NoteList';
import TodayDoses from '../components/TodayDoses';
import TrustedContacts from '../components/TrustedContacts';
import { localDate } from '../model';
import {
  allowReminders,
  readReminderSetting,
  remindersAllowed,
  saveReminderSetting,
  syncReminders,
  type ReminderSetting,
} from '../reminders';
import { colors, ui } from '../theme';

type Props = { token: string; onSignedOut: (notice?: string) => void };

export default function Home({ token, onSignedOut }: Props) {
  const api = useMemo(() => careApi(token), [token]);
  const [data, setData] = useState<Snapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reminderSetting, setReminderSetting] = useState<ReminderSetting | null | undefined>(undefined); // undefined: still loading
  const [notificationsAllowed, setNotificationsAllowed] = useState(false);
  const loadedFromServer = useRef(false);

  const refresh = useCallback(async () => {
    const today = localDate();
    try {
      const [circle, notes, contacts, medicines, doses, appointments] = await Promise.all([
        api.circle(),
        api.notes(),
        api.contacts(),
        api.medicines(),
        api.doses(today, today),
        api.appointments(),
      ]);
      loadedFromServer.current = true;
      setData({ circle, notes, contacts, medicines, doses, appointments });
      setOffline(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSignedOut('This phone was signed out of CareLoop. Ask someone in the care circle for a new invite code to join again.');
      } else {
        setOffline(true);
      }
    }
    setNotificationsAllowed(await remindersAllowed().catch(() => false));
  }, [api, onSignedOut]);

  useEffect(() => {
    void readSnapshot().then((saved) => {
      if (saved && !loadedFromServer.current) setData(saved); // show the last copy until the server answers
    });
    void readReminderSetting().then(setReminderSetting);
    void refresh();
    // Pick up what the rest of the care circle changed whenever the app comes back to the screen.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    if (data && loadedFromServer.current) void writeSnapshot(data);
  }, [data]);

  const forSelf = data?.circle.me.role === 'care_recipient';
  // Reminders default to on for the older adult, and for a caregiver while the older adult isn't on CareLoop.
  const remindersOn = reminderSetting
    ? reminderSetting === 'on'
    : !!data && (forSelf || !data.circle.members.some((member) => member.role === 'care_recipient'));

  useEffect(() => {
    if (!data || reminderSetting === undefined) return; // until the saved setting loads, the default could be wrong
    void syncReminders({
      enabled: remindersOn,
      medicines: data.medicines,
      logs: data.doses,
      appointments: data.appointments,
      personName: data.circle.profile.person_name,
      forSelf: data.circle.me.role === 'care_recipient',
    }).catch(() => undefined); // reminders are best effort; the Today list still works
  }, [data, reminderSetting, remindersOn, notificationsAllowed]);

  async function setReminders(on: boolean): Promise<boolean> {
    if (on) {
      const allowed = await allowReminders();
      setNotificationsAllowed(allowed);
      if (!allowed) return false;
    }
    await saveReminderSetting(on ? 'on' : 'off');
    setReminderSetting(on ? 'on' : 'off');
    return true;
  }

  async function pullToRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  if (!data) {
    return (
      <View style={ui.center}>
        {offline ? (
          <>
            <Text style={ui.helper}>Can't reach CareLoop right now. Check the internet connection.</Text>
            <Button label="Try again" onPress={() => void refresh()} />
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.primary} />
        )}
      </View>
    );
  }

  const { circle, notes, contacts, medicines, doses, appointments } = data;
  const person = circle.profile.person_name;

  return (
    <ScrollView
      contentContainerStyle={ui.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} tintColor={colors.primary} />}
    >
      <Text style={ui.eyebrow}>{forSelf ? 'YOUR CARE' : `CARING FOR ${person.toUpperCase()}`}</Text>
      <Text style={ui.heading}>CareLoop</Text>
      <Text style={ui.intro}>
        Hi {circle.me.name}.{' '}
        {forSelf ? 'Tell CareLoop how you feel, or about a medicine or doctor visit.' : `Keep ${person}'s notes and contacts up to date.`}
      </Text>
      {offline && <Notice message="You're offline. Showing what was last saved on this phone; changes need the internet." />}
      <TodayDoses
        medicines={medicines}
        logs={doses}
        api={api}
        personName={person}
        forSelf={forSelf}
        reminders={{ on: remindersOn, allowed: notificationsAllowed }}
        onSetReminders={setReminders}
        onChanged={refresh}
      />
      <TrustedContacts contacts={contacts} api={api} onChanged={refresh} />
      <NoteComposer api={api} personName={person} forSelf={forSelf} contacts={contacts} onSaved={refresh} />
      <AskCareLoop api={api} contacts={contacts} personName={person} forSelf={forSelf} onSaved={refresh} />
      <Medicines medicines={medicines} api={api} onChanged={refresh} />
      <Appointments appointments={appointments} api={api} onChanged={refresh} />
      <NoteList notes={notes} myId={circle.me.id} api={api} onChanged={refresh} />
      <CareCircle circle={circle} api={api} onChanged={refresh} onSignedOut={onSignedOut} />
    </ScrollView>
  );
}
