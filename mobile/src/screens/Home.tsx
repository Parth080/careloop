import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, RefreshControl, ScrollView, Text, View } from 'react-native';

import { ApiError, careApi } from '../api';
import { readSnapshot, writeSnapshot, type Snapshot } from '../cache';
import CareCircle from '../components/CareCircle';
import { Button, Notice } from '../components/controls';
import NoteComposer from '../components/NoteComposer';
import NoteList from '../components/NoteList';
import TrustedContacts from '../components/TrustedContacts';
import { colors, ui } from '../theme';

type Props = { token: string; onSignedOut: (notice?: string) => void };

export default function Home({ token, onSignedOut }: Props) {
  const api = useMemo(() => careApi(token), [token]);
  const [data, setData] = useState<Snapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadedFromServer = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [circle, notes, contacts] = await Promise.all([api.circle(), api.notes(), api.contacts()]);
      loadedFromServer.current = true;
      setData({ circle, notes, contacts });
      setOffline(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSignedOut('This phone was signed out of CareLoop. Ask someone in the care circle for a new invite code to join again.');
      } else {
        setOffline(true);
      }
    }
  }, [api, onSignedOut]);

  useEffect(() => {
    void readSnapshot().then((saved) => {
      if (saved && !loadedFromServer.current) setData(saved); // show the last copy until the server answers
    });
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

  const { circle, notes, contacts } = data;
  const person = circle.profile.person_name;
  const forSelf = circle.me.role === 'care_recipient';

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
      <TrustedContacts contacts={contacts} api={api} onChanged={refresh} />
      <NoteComposer api={api} personName={person} forSelf={forSelf} onSaved={refresh} />
      <NoteList notes={notes} myId={circle.me.id} api={api} onChanged={refresh} />
      <CareCircle circle={circle} api={api} onChanged={refresh} onSignedOut={onSignedOut} />
    </ScrollView>
  );
}
