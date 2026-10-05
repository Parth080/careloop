import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { clearSnapshot } from './src/cache';
import type { Session } from './src/model';
import Home from './src/screens/Home';
import { startReminders, stopReminders } from './src/reminders';
import Onboarding from './src/screens/Onboarding';
import { clearToken, loadToken, saveToken } from './src/session';
import { colors, ui } from './src/theme';

export default function App() {
  const [token, setToken] = useState<string | null | undefined>(undefined); // undefined while the keychain is read
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    void loadToken().then(setToken);
  }, []);

  const signIn = useCallback(async (session: Session) => {
    // The invite code is already used up, so stay signed in for now even if the keychain write fails.
    await saveToken(session.token).catch(() => undefined);
    startReminders();
    setNotice(undefined);
    setToken(session.token);
  }, []);

  const signOut = useCallback(async (message?: string) => {
    await Promise.all([clearToken(), clearSnapshot(), stopReminders()]); // stop reminders for someone else's medicines
    setNotice(message);
    setToken(null);
  }, []);

  return (
    // Android draws edge-to-edge in SDK 57 and no longer resizes for the keyboard, so pad on both platforms.
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <StatusBar style="dark" />
      {token === undefined ? (
        <View style={ui.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : token ? (
        <Home token={token} onSignedOut={signOut} />
      ) : (
        <Onboarding notice={notice} onSignedIn={signIn} />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
});
