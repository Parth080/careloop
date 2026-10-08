import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, careApi } from '../api';
import { readSnapshot, writeSnapshot, type Snapshot } from '../cache';
import { Button, Icon, Notice, Txt, type IconName } from '../components/kit';
import { localDate } from '../model';
import type { Overlay, Tab } from '../navigation';
import { allowReminders, readReminderSetting, remindersAllowed, saveReminderSetting, syncReminders, type ReminderSetting } from '../reminders';
import { size, useTheme } from '../theme';
import Ask from './Ask';
import Circle from './Circle';
import EditNote from './EditNote';
import Help from './Help';
import MedicineForm from './MedicineForm';
import MedicinesTab from './MedicinesTab';
import NewNote from './NewNote';
import NotesTab from './NotesTab';
import PrescriptionCheck from './PrescriptionCheck';
import Summary from './Summary';
import Today from './Today';
import VisitForm from './VisitForm';
import VisitsTab from './VisitsTab';

type Props = { token: string; onSignedOut: (notice?: string) => void };

const tabs: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'today', label: 'Today', icon: 'home' },
  { key: 'medicines', label: 'Medicines', icon: 'pill' },
  { key: 'visits', label: 'Visits', icon: 'calendar' },
  { key: 'notes', label: 'Notes', icon: 'notes' },
];

export default function Home({ token, onSignedOut }: Props) {
  const { c } = useTheme();
  const api = useMemo(() => careApi(token), [token]);
  const [data, setData] = useState<Snapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reminderSetting, setReminderSetting] = useState<ReminderSetting | null | undefined>(undefined); // undefined: still loading
  const [notificationsAllowed, setNotificationsAllowed] = useState(false);
  const [tab, setTab] = useState<Tab>('today');
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [flash, setFlash] = useState('');
  const [now, setNow] = useState(() => new Date());
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
    setNow(new Date());
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
    const clock = setInterval(() => setNow(new Date()), 60_000); // "later" becomes "due now" without a refresh
    return () => {
      subscription.remove();
      clearInterval(clock);
    };
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
    }).catch(() => undefined); // reminders are best effort; the Today page still works
  }, [data, reminderSetting, remindersOn, notificationsAllowed]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(''), 4000);
    return () => clearTimeout(timer);
  }, [flash]);

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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: c.bg }}>
        {offline ? (
          <>
            <Txt v="bodyLarge" style={{ textAlign: 'center' }}>
              Can't reach CareLoop right now. Check the internet connection.
            </Txt>
            <Button label="Try again" onPress={() => void refresh()} />
          </>
        ) : (
          <ActivityIndicator size="large" color={c.primary} />
        )}
      </View>
    );
  }

  const person = data.circle.profile.person_name;
  const close = () => setOverlay(null);
  const page = { refreshing, onRefresh: pullToRefresh, offline };
  const changed = () => void refresh();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1 }}>
        {tab === 'today' && (
          <Today
            data={data}
            api={api}
            now={now}
            reminders={{ on: remindersOn, allowed: notificationsAllowed }}
            onSetReminders={setReminders}
            onChanged={changed}
            open={setOverlay}
            goTo={setTab}
            {...page}
          />
        )}
        {tab === 'medicines' && <MedicinesTab medicines={data.medicines} api={api} onChanged={changed} open={setOverlay} {...page} />}
        {tab === 'visits' && <VisitsTab appointments={data.appointments} api={api} onChanged={changed} open={setOverlay} {...page} />}
        {tab === 'notes' && <NotesTab notes={data.notes} api={api} onChanged={changed} open={setOverlay} {...page} />}
      </View>
      {!!flash && (
        <View style={{ position: 'absolute', left: 20, right: 20, bottom: 110 }} pointerEvents="none">
          <Notice message={flash} icon="check" />
        </View>
      )}
      <TabBar tab={tab} onChange={setTab} />

      {overlay?.kind === 'note' && (
        <NewNote api={api} personName={person} forSelf={forSelf} contacts={data.contacts} onClose={close} onSaved={changed} />
      )}
      {overlay?.kind === 'ask' && <Ask api={api} contacts={data.contacts} personName={person} forSelf={forSelf} onClose={close} onSaved={changed} />}
      {overlay?.kind === 'help' && (
        <Help api={api} contacts={data.contacts} personName={person} forSelf={forSelf} startEditing={overlay.editing} onClose={close} onChanged={changed} />
      )}
      {overlay?.kind === 'circle' && <Circle circle={data.circle} api={api} onClose={close} onChanged={changed} onSignedOut={onSignedOut} />}
      {overlay?.kind === 'medicine' && <MedicineForm api={api} medicine={overlay.medicine} onClose={close} onSaved={changed} />}
      {overlay?.kind === 'prescription' && (
        <PrescriptionCheck
          api={api}
          photo={overlay.photo}
          onClose={close}
          onSaved={changed}
          onDone={(message) => {
            close();
            setFlash(message);
          }}
        />
      )}
      {overlay?.kind === 'visit' && (
        <VisitForm api={api} appointment={overlay.appointment} initial={overlay.initial} heard={overlay.heard} onClose={close} onSaved={changed} />
      )}
      {overlay?.kind === 'summary' && (
        <Summary api={api} appointments={data.appointments} appointment={overlay.appointment} personName={person} onClose={close} />
      )}
      {overlay?.kind === 'editNote' && <EditNote api={api} note={overlay.note} myId={data.circle.me.id} onClose={close} onSaved={changed} />}
    </View>
  );
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        gap: 6,
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 10),
        backgroundColor: c.surface,
        borderTopWidth: 1,
        borderTopColor: c.border,
      }}
    >
      {tabs.map((item) => {
        const active = item.key === tab;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            onPress={() => onChange(item.key)}
            style={[s.tabItem, { minHeight: size.tabItem + 8 }, active && s.tabItemActive]}
          >
            <Icon name={item.icon} size={size.iconLg} color={active ? c.onPrimarySoft : c.textSecondary} />
            <Txt v="label" maxFontSizeMultiplier={1.2} style={[s.tabLabel, active && s.tabLabelActive]} numberOfLines={1}>
              {item.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
